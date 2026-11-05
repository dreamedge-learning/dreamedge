import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../models/content.dart';
import '../models/lesson_file.dart';
import '../services/document_service.dart';
import '../services/playback_service.dart';
import 'connectivity_service.dart';
import 'device_identity.dart';
import 'disk_space.dart';
import 'download_notifier.dart';
import 'download_record.dart';
import 'download_settings.dart';
import 'offline_paths.dart';
import 'offline_store.dart';
import 'server_clock.dart';

/// Why a download could not be started, in words worth showing.
class DownloadRefused implements Exception {
  final String message;

  /// True when the device has no room. The caller says something different for
  /// this than for "the admin has not allowed this offline", because telling a
  /// student a lesson is unavailable when the real answer is "free up 700 MB"
  /// sends them to support instead of to their photo gallery.
  final bool outOfSpace;

  const DownloadRefused(this.message, {this.outOfSpace = false});

  @override
  String toString() => message;
}

/// Runs the download queue.
///
/// The queue is in the database, not in memory. A student who starts six
/// lessons downloading and then gets a phone call, or runs out of battery, or
/// swipes the app away, comes back to six lessons still downloading -- and
/// each one resumes from the byte it reached rather than from zero, which on
/// a 700 MB video over a patchy connection is the difference between a
/// feature and a frustration.
///
/// Two at a time. More would not go faster on a mobile connection; it would
/// just divide the same bandwidth into more stalls and make the progress bars
/// look broken.
///
/// What this will not download: tests and quizzes. They stay online-only
/// because they are scored on the server, and a downloaded test could be
/// re-attempted with nothing recording it. Videos and documents are the whole
/// of the offline surface for now.
///
/// A lesson is downloaded whole. Beside its video or main document come the
/// attachments the app can open -- every PDF and image on it -- into the same
/// folder, under the same licence, counted in the same progress ring. The
/// lesson is not marked done until the last of them has arrived, so a student
/// on a train never finds the video saved and the worksheet missing.
class DownloadManager {
  DownloadManager({
    required this._store,
    required this._playback,
    required this._documents,
    required this._connectivity,
    required this._settings,
    required this._device,
    required this._notifier,
    required this._clock,
    required this._dio,
  }) {
    _watchConnectivity();
    _settings.addListener(_onAllowedNetworkChanged);
  }

  final OfflineStore _store;
  final PlaybackService _playback;
  final DocumentService _documents;
  final ConnectivityService _connectivity;
  final DownloadSettings _settings;
  final DeviceIdentity _device;
  final DownloadNotifier _notifier;
  final ServerClock _clock;
  final Dio _dio;

  static const int _maxConcurrent = 2;

  /// One first attempt plus this many retries.
  ///
  /// Named for what it is rather than for the loop bound it used to be: the
  /// old `_maxAttempts = 3` with `attempts < _maxAttempts` gave two retries
  /// while the comment and the backoff table both described three.
  static const int _maxRetries = 3;

  /// Headroom to leave beyond the file itself, so a finished download does not
  /// leave a phone that cannot take a photo or receive a message. The student
  /// will not connect either of those to a video they saved.
  static const int _freeSpaceMarginBytes = 200 * 1024 * 1024;

  /// What to assume a lesson costs when its size is not known yet, which is
  /// the case before the first byte arrives. A 50-minute 480p lesson lands
  /// near this, so it is a floor on the space check rather than a guess that
  /// lets a 700 MB file onto a device with 400 MB free.
  static const int _assumedItemBytes = 400 * 1024 * 1024;

  static const List<Duration> _backoff = [
    Duration(seconds: 3),
    Duration(seconds: 15),
    Duration(seconds: 45),
  ];

  static const DiskSpace _disk = DiskSpace();

  final Map<String, CancelToken> _active = {};

  /// Retry timers, so a timer cannot fire into a disposed manager and pump a
  /// queue that no longer has a database behind it.
  final Set<Timer> _retryTimers = {};

  StreamSubscription<NetworkState>? _networkWatch;
  bool _pumping = false;

  /// Progress reaches the UI through [OfflineStore.changes] rather than a
  /// stream of its own.
  ///
  /// There was one here and it was a second way to learn the same thing. The
  /// store is already the place a download record changes, the Downloads
  /// screen and every lesson tile already watch it, and two notification
  /// paths for one fact is how a progress ring ends up disagreeing with the
  /// list it sits in.
  Future<void> dispose() async {
    _settings.removeListener(_onAllowedNetworkChanged);
    await _networkWatch?.cancel();

    for (final timer in _retryTimers) {
      timer.cancel();
    }
    _retryTimers.clear();

    for (final token in _active.values) {
      token.cancel('shutting down');
    }
  }

  // ---------------------------------------------------------------------------
  // Starting and stopping
  // ---------------------------------------------------------------------------

  /// Adds one lesson to the queue.
  ///
  /// Throws [DownloadRefused] with something worth reading when it will not
  /// work: no room, not allowed offline, nothing to download.
  Future<void> enqueue(Content content) async {
    if (!content.canDownload) {
      throw const DownloadRefused('This lesson is not available offline.');
    }

    final owner = await _store.currentOwner();
    if (owner == null) {
      throw const DownloadRefused(
        'Please sign in again to save this lesson.',
      );
    }

    final existing = await _store.download(content.id);
    if (existing != null && existing.status == DownloadStatus.done) {
      return;
    }

    // Size-aware rather than a fixed floor. The old check refused anything
    // below 300 MB free and waved through a 700 MB video on a device with
    // 400 MB, which is the one case the check existed for.
    final needed = _bytesStillNeeded(existing);
    final free = await _freeSpace();
    if (free != null && free < needed + _freeSpaceMarginBytes) {
      final shortfall = needed + _freeSpaceMarginBytes - free;
      throw DownloadRefused(
        'Not enough space. Free up about '
        '${(shortfall / 1024 / 1024).ceil()} MB and try again.',
        outOfSpace: true,
      );
    }

    final place = await _store.lessonContext(content.topicId);

    final record = DownloadRecord(
      contentItemId: content.id,
      studentId: owner,
      courseId: place.courseId,
      courseName: place.courseName,
      subjectId: place.subjectId,
      subjectName: place.subjectName,
      topicId: content.topicId,
      title: content.title,
      type: content.type.wireValue,
      // Carried over on a retry so a half-finished file is not abandoned for
      // being the wrong quality.
      quality: existing?.quality,
      localPath: existing?.localPath,
      bytesTotal: existing?.bytesTotal ?? 0,
      bytesDone: existing?.bytesDone ?? 0,
      status: DownloadStatus.queued,
      attempts: 0,
      licenceExpiresAt: existing?.licenceExpiresAt,
      licenceDays: existing?.licenceDays,
      lastVerifiedAt: existing?.lastVerifiedAt,
      createdAt: existing?.createdAt ?? DateTime.now(),
    );

    await _store.putDownload(record);
    unawaited(_pump());
  }

  int _bytesStillNeeded(DownloadRecord? existing) {
    if (existing == null) return _assumedItemBytes;
    final remaining = existing.bytesTotal - existing.bytesDone;
    return remaining > 0 ? remaining : _assumedItemBytes;
  }

  /// Queues everything downloadable under a topic.
  ///
  /// Reports the two reasons separately, because they are not the same message
  /// to a student: one needs an admin to change a switch, the other needs them
  /// to delete something.
  Future<({int queued, int notOffline, int noSpace})> enqueueAll(
    List<Content> items,
  ) async {
    var queued = 0;
    var notOffline = 0;

    for (var index = 0; index < items.length; index++) {
      final item = items[index];
      if (!item.canDownload) {
        notOffline++;
        continue;
      }
      try {
        await enqueue(item);
        queued++;
      } on DownloadRefused catch (refused) {
        if (!refused.outOfSpace) {
          notOffline++;
          continue;
        }
        // Out of space. Stop rather than report a hundred identical failures,
        // and count everything left as space rather than as unavailable.
        final remaining = items
            .sublist(index)
            .where((candidate) => candidate.canDownload)
            .length;
        return (queued: queued, notOffline: notOffline, noSpace: remaining);
      }
    }

    return (queued: queued, notOffline: notOffline, noSpace: 0);
  }

  /// The student pressed pause.
  ///
  /// Recorded as such, so the next connectivity event does not undo it.
  Future<void> pause(String contentItemId) async {
    _active.remove(contentItemId)?.cancel('paused');
    await _store.patchDownload(contentItemId, {
      'status': DownloadStatus.paused.name,
      'paused_reason': PauseReason.student.name,
    });
    await _notifier.sync(await _store.pendingDownloads());
  }

  Future<void> resume(String contentItemId) async {
    await _store.patchDownload(contentItemId, {
      'status': DownloadStatus.queued.name,
      'paused_reason': null,
      'attempts': 0,
      'error': null,
    });
    unawaited(_pump());
  }

  /// Removes the record and the file.
  Future<void> remove(String contentItemId) async {
    _active.remove(contentItemId)?.cancel('removed');

    final record = await _store.download(contentItemId);
    if (record != null) await _deleteLesson(record);
    await _store.removeDownload(contentItemId);

    await _notifier.sync(await _store.pendingDownloads());
  }

  Future<void> removeAll() async {
    final records = await _store.allDownloads();
    for (final record in records) {
      _active.remove(record.contentItemId)?.cancel('removed');
      await _deleteLesson(record);
      await _store.removeDownload(record.contentItemId);
    }
    await _notifier.cancel();
  }

  /// Picks the queue back up after a restart.
  ///
  /// Anything the database says was mid-flight when the app died is not
  /// actually running, so it goes back to queued before the pump starts.
  Future<void> restore() async {
    await purgeUnowned();

    final stuck = await _store.pendingDownloads();
    for (final record in stuck) {
      if (record.status == DownloadStatus.downloading) {
        await _store.patchDownload(record.contentItemId, {
          'status': DownloadStatus.queued.name,
        });
      }
    }
    unawaited(_pump());
  }

  /// Deletes the files left by rows the version 1 schema could not attribute.
  ///
  /// Those rows have no owner, so no student can play them and none of them
  /// will ever be listed. Without this their bytes would sit on the device
  /// forever, which on a phone that held a course is a gigabyte the student
  /// cannot find and cannot free.
  Future<void> purgeUnowned() async {
    final orphans = await _store.unownedDownloads();
    for (final record in orphans) {
      await _deleteLesson(record);
      await _store.removeDownload(record.contentItemId, studentId: '');
    }
  }

  // ---------------------------------------------------------------------------
  // The pump
  // ---------------------------------------------------------------------------

  void _watchConnectivity() {
    _networkWatch = _connectivity.states.listen((_) {
      unawaited(_onAllowedNetworkChanged());
    });
  }

  /// Both directions of the Wi-Fi-only rule.
  ///
  /// The resume direction used to be the only one handled, which meant a
  /// student who queued three lessons on home Wi-Fi and walked out of range
  /// had Android hand over to 4G while the transfer stream never errored:
  /// two gigabytes onto a metered pack, under a settings screen promising the
  /// opposite. So the rule is re-evaluated on every transition, and a
  /// connection that is no longer allowed cancels what is in flight rather
  /// than only refusing what has not started.
  Future<void> _onAllowedNetworkChanged() async {
    if (_canUseNetworkNow()) {
      await _resumeAutoPaused();
      return;
    }
    await _parkForNetwork();
  }

  Future<void> _resumeAutoPaused() async {
    if (!_canUseNetworkNow()) return;

    for (final record in await _store.autoPausedDownloads()) {
      await _store.patchDownload(record.contentItemId, {
        'status': DownloadStatus.queued.name,
        'paused_reason': null,
      });
    }
    unawaited(_pump());
  }

  bool _canUseNetworkNow() {
    final state = _connectivity.state;
    if (!state.isOnline) return false;
    if (_settings.wifiOnly && !state.isWifi) return false;
    return true;
  }

  /// Fills the free slots. Re-entrant-safe: a second caller returns
  /// immediately and the running pump picks up whatever they queued.
  Future<void> _pump() async {
    if (_pumping) return;
    _pumping = true;

    try {
      while (true) {
        if (_active.length >= _maxConcurrent) break;

        if (!_canUseNetworkNow()) {
          await _parkForNetwork();
          break;
        }

        final pending = await _store.pendingDownloads();
        final next = pending.firstWhere(
          (record) => !_active.containsKey(record.contentItemId),
          orElse: () => _none,
        );
        if (next.contentItemId.isEmpty) break;

        unawaited(_run(next));
      }

      await _notifier.sync(await _store.pendingDownloads());
    } finally {
      _pumping = false;
    }
  }

  static final DownloadRecord _none = DownloadRecord(
    contentItemId: '',
    studentId: '',
    title: '',
    type: 'video',
    bytesTotal: 0,
    bytesDone: 0,
    status: DownloadStatus.queued,
    attempts: 0,
    createdAt: DateTime.fromMillisecondsSinceEpoch(0),
  );

  /// Puts the queue to sleep until the connection the student allows returns.
  ///
  /// Cancels what is in flight as well as parking what is queued. Resuming is
  /// safe because the transfer resumes by Range from where the file actually
  /// ends, so the bytes already paid for are not spent twice.
  Future<void> _parkForNetwork() async {
    final pending = await _store.pendingDownloads();
    for (final record in pending) {
      _active.remove(record.contentItemId)?.cancel('connection not allowed');
      await _store.patchDownload(record.contentItemId, {
        'status': DownloadStatus.paused.name,
        'paused_reason': PauseReason.network.name,
      });
    }

    if (pending.isNotEmpty) {
      await _notifier.waitingForWifi(pending.length);
    }
  }

  // ---------------------------------------------------------------------------
  // One download
  // ---------------------------------------------------------------------------

  Future<void> _run(DownloadRecord record) async {
    final id = record.contentItemId;
    final token = CancelToken();
    _active[id] = token;

    await _store.patchDownload(id, {
      'status': DownloadStatus.downloading.name,
      'paused_reason': null,
      'error': null,
    });

    try {
      final target = await _resolveTarget(record);
      final main = await _transfer(record, target, token);
      await _fetchAttachments(record, target, main.bytes, token);
      await _finish(record, target, main);
    } on DownloadRefused catch (refused) {
      await _fail(id, refused.message, retryable: false);
    } on PlaybackException catch (failure) {
      // A paywall answer is final; anything else might be the network.
      await _fail(
        id,
        failure.message,
        retryable: failure.failure == PlaybackFailure.unavailable,
      );
    } on DocumentException catch (failure) {
      await _fail(
        id,
        failure.message,
        retryable: failure.failure == DocumentFailure.unavailable,
      );
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) {
        // Paused, parked or removed. The row already says so.
        return;
      }
      await _fail(id, 'Download interrupted.', retryable: true);
    } on FileSystemException {
      await _fail(id, 'Could not save to this device.', retryable: false);
    } catch (_) {
      await _fail(id, 'Download failed.', retryable: true);
    } finally {
      _active.remove(id);
      unawaited(_pump());
    }
  }

  /// Where the bytes come from, where they go, and on what terms.
  Future<_Target> _resolveTarget(DownloadRecord record) async {
    final metered = _connectivity.state.isMetered;
    final deviceId = await _device.id();

    if (record.isVideo) {
      final wanted = record.quality ?? _settings.heightFor(metered: metered);

      final payload = await _playback.getForDownload(
        record.contentItemId,
        deviceId: deviceId,
        quality: wanted,
      );

      await _clock.anchor(payload.serverNow);

      final chosen = _pickRendition(payload, wanted);
      if (chosen == null) {
        throw const DownloadRefused(
          'This lesson cannot be downloaded yet. Please try again later.',
        );
      }

      return _Target(
        url: payload.mp4[chosen]!,
        quality: chosen,
        extension: 'mp4',
        // Notes and worksheets attached to a video lesson come with it.
        attachments: LessonFile.viewable(
          await _documents.listFiles(record.contentItemId),
        ),
        licenceExpiresAt: _licenceEnd(
          serverNow: payload.serverNow,
          licenceDays: payload.offlineLicenseDays,
          validUntil: payload.validUntil,
        ),
        licenceDays: payload.offlineLicenseDays,
        verifiedAt: payload.serverNow,
      );
    }

    // The first file the app can open is the main one; the rest of the
    // viewable files come after it. Asking for it by id, rather than taking
    // whatever the route serves first, keeps an ePub that happens to sort
    // first from becoming the one file the reader is handed.
    //
    // A lesson with no listed files is an older one whose document is a bare
    // link on the item, and goes through the route exactly as it always did.
    final files = LessonFile.viewable(
      await _documents.listFiles(record.contentItemId),
    );
    final primary = files.isEmpty ? null : files.first;

    // The device id goes to the document endpoint for the same reason it goes
    // to the video one: a downloaded booklet is a copy that has to be
    // auditable and revocable, and a row with no device on it is neither.
    final document = await _documents.getSource(
      record.contentItemId,
      fileId: primary?.id,
      deviceId: deviceId,
    );
    if (!document.isDownloadable) {
      throw const DownloadRefused('This lesson is not available offline.');
    }

    await _clock.anchor(document.serverNow);

    return _Target(
      url: document.url,
      quality: null,
      extension: primary?.extension.isNotEmpty == true
          ? primary!.extension
          : _extensionOf(document.fileName) ?? 'pdf',
      primary: primary,
      attachments: files.skip(1).toList(),
      // The same cap the video path uses. Without it a student with ten days
      // of enrolment left downloaded every booklet and past paper and kept
      // them for thirty -- twenty days of readable paid content past the
      // paywall, with no server-side record that the copies existed.
      licenceExpiresAt: _licenceEnd(
        serverNow: document.serverNow,
        licenceDays: document.offlineLicenseDays,
        validUntil: document.validUntil,
      ),
      licenceDays: document.offlineLicenseDays,
      verifiedAt: document.serverNow,
    );
  }

  /// The wanted rendition, or the nearest one below it.
  ///
  /// Asking for 720p on a video that only encoded to 480p should give 480p,
  /// not a failure: the student asked for the best up to that size.
  String? _pickRendition(PlaybackPayload payload, String wanted) {
    if (payload.mp4.containsKey(wanted)) return wanted;
    if (payload.mp4.isEmpty) return null;

    final target = int.tryParse(wanted) ?? 480;
    final heights =
        payload.qualities
            .map((value) => int.tryParse(value) ?? 0)
            .where((value) => value > 0)
            .toList()
          ..sort();

    String? best;
    for (final height in heights) {
      if (height <= target) best = '$height';
    }
    // Everything on offer is bigger than asked for; take the smallest of them.
    return best ?? '${heights.first}';
  }

  /// The licence can never outlive the enrolment behind it, and is measured
  /// from the server's clock rather than this device's.
  DateTime? _licenceEnd({
    required DateTime serverNow,
    required int licenceDays,
    required DateTime? validUntil,
  }) {
    final byPolicy = serverNow.add(Duration(days: licenceDays));
    if (validUntil == null) return byPolicy;
    return validUntil.isBefore(byPolicy) ? validUntil : byPolicy;
  }

  /// Fetches the main file -- the video, or the lesson's first document --
  /// and reports where it went and how big it is.
  ///
  /// The row's totals include the attachments still to come from the start,
  /// so the ring climbs once from empty to full rather than filling for the
  /// video and then dropping back for the worksheets.
  Future<({String path, int bytes})> _transfer(
    DownloadRecord record,
    _Target target,
    CancelToken token,
  ) async {
    final extra = target.attachmentBytes;
    final path = record.localPath ?? await _pathFor(record, target.extension);
    final file = File(path);
    await file.parent.create(recursive: true);

    final existing = await file.exists() ? await file.length() : 0;

    await _store.patchDownload(record.contentItemId, {
      'local_path': path,
      'quality': target.quality,
      'bytes_done': existing,
    }, announce: false);

    // Range from where the file actually ends, not from what the row claims:
    // a process killed mid-write can leave the two disagreeing, and trusting
    // the row would corrupt the file.
    final headers = <String, String>{
      if (existing > 0) 'Range': 'bytes=$existing-',
    };

    final response = await _dio.get<ResponseBody>(
      target.url,
      cancelToken: token,
      options: Options(
        responseType: ResponseType.stream,
        headers: headers,
        followRedirects: true,
        validateStatus: (status) =>
            status == 200 || status == 206 || status == 416,
      ),
    );

    // 416 means the server says there is nothing past where we are, which for
    // a resumed download means it was already complete.
    if (response.statusCode == 416) {
      await _store.patchDownload(record.contentItemId, {
        'bytes_total': existing + extra,
        'bytes_done': existing,
      }, announce: false);
      return (path: path, bytes: existing);
    }

    // A server that ignored the Range header sent the file from the start, so
    // appending would duplicate the first half.
    final resumed = response.statusCode == 206;
    final startAt = resumed ? existing : 0;
    if (!resumed && existing > 0) {
      await file.writeAsBytes(const [], flush: true);
    }

    final total = _totalBytes(response, startAt);
    await _store.patchDownload(record.contentItemId, {
      'bytes_total': total + extra,
      'bytes_done': startAt,
    }, announce: false);

    final sink = file.openWrite(
      mode: resumed ? FileMode.append : FileMode.write,
    );

    var written = startAt;
    var lastReport = DateTime.fromMillisecondsSinceEpoch(0);

    try {
      await for (final chunk in response.data!.stream) {
        sink.add(chunk);
        written += chunk.length;

        // Four reports a second. Writing the row per chunk would make the
        // database the slowest part of the transfer.
        final now = DateTime.now();
        if (now.difference(lastReport) > const Duration(milliseconds: 250)) {
          lastReport = now;
          await _store.patchDownload(record.contentItemId, {
            'bytes_done': written,
          });
        }
      }
    } finally {
      await sink.flush();
      await sink.close();
    }

    await _store.patchDownload(record.contentItemId, {
      'bytes_done': written,
      'bytes_total': (written > total ? written : total) + extra,
    }, announce: false);

    return (path: path, bytes: written);
  }

  /// Fetches every attachment after the main file, into the lesson's folder.
  ///
  /// Each one resumes from where its own file ends, so a dropped connection
  /// on the third worksheet does not fetch the first two again. One already
  /// complete on disk is not even asked for.
  Future<void> _fetchAttachments(
    DownloadRecord record,
    _Target target,
    int mainBytes,
    CancelToken token,
  ) async {
    if (target.attachments.isEmpty) return;

    final id = record.contentItemId;
    final base = (await getApplicationSupportDirectory()).path;
    final deviceId = await _device.id();
    final saved = {
      for (final file in await _store.savedFiles(id)) file.fileId: file,
    };

    var done = mainBytes;
    var total = mainBytes + target.attachmentBytes;

    for (final attachment in target.attachments) {
      final path = OfflinePaths.attachmentPath(
        base,
        id,
        attachment.id,
        attachment.extension,
      );

      final already = saved[attachment.id];
      if (already != null &&
          already.localPath == path &&
          await _lengthOf(path) == already.bytes &&
          already.bytes > 0) {
        done += already.bytes;
        continue;
      }

      // A fresh signed address per file: each expires in minutes, and the
      // route checks the paywall and records the copy against this device
      // every time, exactly as it does for the main file.
      final source = await _documents.getSource(
        id,
        fileId: attachment.id,
        deviceId: deviceId,
      );
      if (!source.isDownloadable) {
        throw const DownloadRefused('This lesson is not available offline.');
      }

      final before = done;
      final bytes = await _fetchFile(
        source.url,
        path,
        token,
        (written) => _store.patchDownload(id, {'bytes_done': before + written}),
      );
      done += bytes;
      if (done > total) total = done;

      await _store.putSavedFile(SavedFile(
        contentItemId: id,
        fileId: attachment.id,
        name: attachment.name,
        extension: attachment.extension,
        localPath: path,
        bytes: bytes,
        weight: attachment.weight,
      ));
    }

    await _store.patchDownload(id, {
      'bytes_done': done,
      'bytes_total': total,
    }, announce: false);
  }

  /// Streams one attachment to [path], resuming by Range from where the file
  /// already ends. Returns the file's final size.
  ///
  /// Kept apart from [_transfer] on purpose: that one also keeps the lesson
  /// row's path and quality in step, and the video path is not worth putting
  /// at risk to share twenty lines.
  Future<int> _fetchFile(
    String url,
    String path,
    CancelToken token,
    Future<void> Function(int written) onProgress,
  ) async {
    final file = File(path);
    await file.parent.create(recursive: true);
    final existing = await file.exists() ? await file.length() : 0;

    final response = await _dio.get<ResponseBody>(
      url,
      cancelToken: token,
      options: Options(
        responseType: ResponseType.stream,
        headers: {if (existing > 0) 'Range': 'bytes=$existing-'},
        followRedirects: true,
        validateStatus: (status) =>
            status == 200 || status == 206 || status == 416,
      ),
    );

    if (response.statusCode == 416) return existing;

    final resumed = response.statusCode == 206;
    final sink = file.openWrite(
      mode: resumed ? FileMode.append : FileMode.write,
    );

    var written = resumed ? existing : 0;
    var lastReport = DateTime.fromMillisecondsSinceEpoch(0);

    try {
      await for (final chunk in response.data!.stream) {
        sink.add(chunk);
        written += chunk.length;

        final now = DateTime.now();
        if (now.difference(lastReport) > const Duration(milliseconds: 250)) {
          lastReport = now;
          await onProgress(written);
        }
      }
    } finally {
      await sink.flush();
      await sink.close();
    }

    return written;
  }

  Future<int> _lengthOf(String path) async {
    try {
      final file = File(path);
      return await file.exists() ? await file.length() : -1;
    } on FileSystemException {
      return -1;
    }
  }

  int _totalBytes(Response<ResponseBody> response, int startAt) {
    final range = response.headers.value('content-range');
    if (range != null) {
      final total = int.tryParse(range.split('/').last.trim());
      if (total != null && total > 0) return total;
    }

    final length = int.tryParse(response.headers.value('content-length') ?? '');
    if (length != null && length > 0) return startAt + length;

    return 0;
  }

  Future<void> _finish(
    DownloadRecord record,
    _Target target,
    ({String path, int bytes}) main,
  ) async {
    // The main document is listed with the attachments, so the reader can
    // name it and offer it beside them with no network to ask.
    final primary = target.primary;
    if (primary != null) {
      await _store.putSavedFile(SavedFile(
        contentItemId: record.contentItemId,
        fileId: primary.id,
        name: primary.name,
        extension: primary.extension,
        localPath: main.path,
        bytes: main.bytes,
        weight: primary.weight,
      ));
    }

    await _store.patchDownload(record.contentItemId, {
      'status': DownloadStatus.done.name,
      'paused_reason': null,
      'quality': target.quality,
      'licence_expires_at': target.licenceExpiresAt?.millisecondsSinceEpoch,
      'licence_days': target.licenceDays,
      'last_verified_at': target.verifiedAt.millisecondsSinceEpoch,
      'completed_at': target.verifiedAt.millisecondsSinceEpoch,
      'error': null,
      'attempts': 0,
    });
  }

  Future<void> _fail(
    String contentItemId,
    String message, {
    required bool retryable,
  }) async {
    final record = await _store.download(contentItemId);
    if (record == null) return;

    final attempts = record.attempts + 1;

    if (retryable && attempts <= _maxRetries) {
      await _store.patchDownload(contentItemId, {
        'status': DownloadStatus.queued.name,
        'attempts': attempts,
        'error': message,
      });

      // Backing off rather than hammering: a connection that just dropped is
      // usually back within seconds, and retrying instantly only burns
      // battery.
      final delay = _backoff[(attempts - 1).clamp(0, _backoff.length - 1)];
      late final Timer timer;
      timer = Timer(delay, () {
        _retryTimers.remove(timer);
        unawaited(_pump());
      });
      _retryTimers.add(timer);
      return;
    }

    await _store.patchDownload(contentItemId, {
      'status': DownloadStatus.failed.name,
      'attempts': attempts,
      'error': message,
    });
  }

  // ---------------------------------------------------------------------------

  /// App-private, invisible to the gallery and to other apps, and named with
  /// an opaque id so the filename gives nothing away about what was bought.
  Future<String> _pathFor(DownloadRecord record, String extension) async {
    final base = await getApplicationSupportDirectory();
    final name =
        '${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}'
        '${record.contentItemId.replaceAll('-', '').substring(0, 8)}';
    return '${base.path}/offline/${record.contentItemId}/$name.$extension';
  }

  /// Deletes everything saved for a lesson: the main file, every attachment,
  /// and the folder they shared.
  Future<void> _deleteLesson(DownloadRecord record) async {
    // An unowned row predates attachments and has none recorded.
    final saved = record.studentId.isEmpty
        ? const <SavedFile>[]
        : await _store.savedFiles(record.contentItemId);

    await OfflinePaths.deleteLesson(
      contentItemId: record.contentItemId,
      mainPath: record.localPath,
      others: saved.map((file) => file.localPath),
    );
  }

  /// Free space where downloads land, or null when the platform will not say.
  ///
  /// Null is "unknown", not "none": the caller skips the check and lets a
  /// genuinely full device fail the write with a real disk error, because
  /// refusing a download on a figure we do not have is the worse mistake.
  Future<int?> _freeSpace() async {
    try {
      final base = await getApplicationSupportDirectory();
      return await _disk.freeBytes(base.path);
    } on FileSystemException {
      return null;
    }
  }

  String? _extensionOf(String fileName) {
    final match = RegExp(r'\.([A-Za-z0-9]{1,6})$').firstMatch(fileName);
    return match?.group(1)?.toLowerCase();
  }
}

class _Target {
  final String url;
  final String? quality;
  final String extension;

  /// The attachment the main file is, for a document lesson that lists its
  /// files. Null for a video, and for an older lesson whose document is a
  /// bare link on the item.
  final LessonFile? primary;

  /// Everything else on the lesson the app can open, fetched after the main
  /// file into the same folder.
  final List<LessonFile> attachments;

  final DateTime? licenceExpiresAt;

  /// The licence length the server granted, kept so the expiry can be checked
  /// against the last real server contact rather than trusted on its own.
  final int licenceDays;

  /// The server's clock when this target was resolved.
  final DateTime verifiedAt;

  const _Target({
    required this.url,
    required this.quality,
    required this.extension,
    this.primary,
    this.attachments = const [],
    required this.licenceExpiresAt,
    required this.licenceDays,
    required this.verifiedAt,
  });

  /// What the attachments are expected to weigh, from the sizes recorded at
  /// upload. Zero when none are known; the real figures replace it as each
  /// file arrives.
  int get attachmentBytes =>
      attachments.fold(0, (sum, file) => sum + file.sizeBytes);
}
