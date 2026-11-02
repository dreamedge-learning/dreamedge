import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../core/logging/app_log.dart';
import '../../../core/models/content.dart';
import '../../../core/offline/local_library.dart';
import '../../../core/providers/content_provider.dart';
import '../../../core/providers/playback_provider.dart';
import '../../../core/providers/student_provider.dart';
import '../../../core/providers/supabase_provider.dart';
import '../../../core/services/playback_service.dart';

/// Where the player is in its life, as far as the screen is concerned.
enum PlayerPhase {
  /// Fetching the lesson, its playback URLs and any saved position.
  loading,

  /// There is a position worth returning to; waiting for the student to say.
  askingToResume,

  /// A controller is attached and the video is playable.
  ready,

  /// The transcode has not finished. Waiting helps; retrying does not.
  processing,

  /// Replayed as many times as the lesson allows.
  limitReached,

  /// Anything else, with [error] holding what to tell the student.
  failed,
}

/// The auto-quality option, which is the HLS ladder doing the choosing.
const String kAutoQuality = 'auto';

/// The inputs `_attach` needs when the student picks a different quality.
///
/// Carrying the three fields as one value makes `planQualitySwap` a pure
/// function that a test can call without a VideoPlayerController -- the
/// capture is the whole thing that proves a swap preserves position.
class QualitySwap {
  /// The quality label (height, or `kAutoQuality`) to attach next.
  final String nextQuality;

  /// Where the student was when they picked a new quality, so `_attach`
  /// starts the new controller from the same place.
  final Duration resumeAt;

  /// Whether the video was playing at the moment of the capture, so the
  /// new controller honours autoPlay.
  final bool wasPlaying;

  const QualitySwap({
    required this.nextQuality,
    required this.resumeAt,
    required this.wasPlaying,
  });

  @override
  bool operator ==(Object other) =>
      other is QualitySwap &&
      other.nextQuality == nextQuality &&
      other.resumeAt == resumeAt &&
      other.wasPlaying == wasPlaying;

  @override
  int get hashCode => Object.hash(nextQuality, resumeAt, wasPlaying);
}

/// Owns the video for one lesson: the controller, the control state, the
/// gestures' side effects and the progress write-back.
///
/// It is a single object rather than state spread across widgets because every
/// one of those things has to agree about the same position. Switching quality
/// replaces the underlying controller, and the only way that is invisible to
/// the student is if whoever does it also owns the position, the speed and
/// whether the video was playing.
class PlayerController extends ChangeNotifier {
  PlayerController(this._ref, this.contentId);

  final Ref _ref;
  final String contentId;

  // How often progress reaches the server while a video plays. Every frame
  // would be a write a second; only on exit would lose a whole session to a
  // crash or a force-close.
  static const Duration _progressInterval = Duration(seconds: 15);

  // Long enough not to fight a student who is reaching for the scrubber.
  static const Duration _controlsTimeout = Duration(seconds: 3);

  /// Below this, a saved position is indistinguishable from the start.
  static const Duration resumeThreshold = Duration(seconds: 30);

  /// Within this of the end counts as finished.
  static const int completeTailSeconds = 10;

  // A double-tap seek, and how long the badge keeps accumulating further taps.
  static const Duration _seekStep = Duration(seconds: 5);
  static const Duration _seekBadgeLinger = Duration(milliseconds: 900);

  static const List<double> speeds = [
    0.25,
    0.5,
    0.75,
    1.0,
    1.25,
    1.5,
    1.75,
    2.0,
  ];

  // Retry schedule for a stream that drops mid-playback. Mobile data handing
  // over between towers is usually back within a few seconds.
  static const List<Duration> _retryDelays = [
    Duration(seconds: 2),
    Duration(seconds: 5),
    Duration(seconds: 12),
  ];

  PlayerPhase _phase = PlayerPhase.loading;
  String? _error;

  Content? _content;
  PlaybackPayload? _payload;
  List<Content> _siblings = const [];

  VideoPlayerController? _video;
  bool _disposed = false;

  String _quality = kAutoQuality;
  double _speed = 1.0;
  bool _controlsVisible = true;
  bool _locked = false;
  bool _fullscreen = false;
  bool _fullscreenFromRotation = false;
  bool _playingLocalCopy = false;

  int _resumeFromSeconds = 0;
  int _playLimit = 0;
  int _playsUsed = 0;

  Duration _pendingSeekBadge = Duration.zero;

  // The badge's side and its visibility are tracked separately from its
  // amount. Deriving both from the amount's sign meant a forward double-tap
  // followed by a backward one inside the linger window summed to zero, and
  // every trace of the feedback disappeared in the middle of the student
  // correcting themselves.
  bool _seekBadgeForward = true;
  bool _seekBadgeVisible = false;
  Timer? _seekBadgeTimer;
  Timer? _controlsTimer;
  Timer? _progressTimer;
  Timer? _retryTimer;
  Timer? _autoNextTimer;
  int _retryAttempt = 0;
  int _autoNextSeconds = 0;
  bool _autoNextDue = false;

  Duration _lastWrittenPosition = Duration.zero;

  // ---------------------------------------------------------------------------
  // What the screen reads
  // ---------------------------------------------------------------------------

  PlayerPhase get phase => _phase;
  String? get error => _error;
  Content? get content => _content;
  PlaybackPayload? get payload => _payload;

  VideoPlayerController? get video => _video;
  bool get isReady => _phase == PlayerPhase.ready && _video != null;

  bool get isPlaying => _video?.value.isPlaying ?? false;
  bool get isBuffering => _video?.value.isBuffering ?? false;
  bool get isCompleted => _video?.value.isCompleted ?? false;

  Duration get position => _video?.value.position ?? Duration.zero;
  Duration get duration => _video?.value.duration ?? Duration.zero;

  /// The furthest point the player has buffered, for the scrubber's track.
  Duration get buffered {
    final ranges = _video?.value.buffered ?? const <DurationRange>[];
    var furthest = Duration.zero;
    for (final range in ranges) {
      if (range.end > furthest) furthest = range.end;
    }
    return furthest;
  }

  double get speed => _speed;
  String get quality => _quality;
  bool get controlsVisible => _controlsVisible;
  bool get locked => _locked;
  bool get fullscreen => _fullscreen;

  /// Whether the device's orientation put us in fullscreen rather than the
  /// student pressing the button. The back press behaves differently for each.
  bool get fullscreenFromRotation => _fullscreenFromRotation;
  bool get playingLocalCopy => _playingLocalCopy;

  Duration get seekBadge => _pendingSeekBadge;

  /// Which side the badge belongs on: the direction of the most recent tap,
  /// not the sign of the running total.
  bool get seekBadgeForward => _seekBadgeForward;

  /// Whether the badge is on screen at all.
  bool get seekBadgeVisible => _seekBadgeVisible;
  int get resumeFromSeconds => _resumeFromSeconds;
  int get playLimit => _playLimit;
  int get playsUsed => _playsUsed;
  int get autoNextSeconds => _autoNextSeconds;

  /// The countdown ran out and the next lesson should open.
  ///
  /// A flag rather than a callback into navigation: pushing a route is the
  /// screen's job, and a controller that knew about GoRouter could not be
  /// torn down independently of it. The screen clears it with
  /// [consumeAutoNext] once it has acted.
  bool get autoNextDue => _autoNextDue;

  /// Qualities to offer. Only the downloaded one, when that is what is playing:
  /// there is no point offering 1080p to a student with the radio off.
  List<String> get availableQualities {
    if (_playingLocalCopy) return [_quality];
    final payload = _payload;
    if (payload == null) return const [];
    return [kAutoQuality, ...payload.qualities];
  }

  Content? get previousLesson {
    final index = _siblingIndex;
    if (index <= 0) return null;
    return _siblings[index - 1];
  }

  Content? get nextLesson {
    final index = _siblingIndex;
    if (index < 0 || index >= _siblings.length - 1) return null;
    return _siblings[index + 1];
  }

  int get _siblingIndex =>
      _siblings.indexWhere((lesson) => lesson.id == contentId);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /// Fetches everything the player needs and decides what to show first.
  Future<void> load() async {
    _set(() {
      _phase = PlayerPhase.loading;
      _error = null;
    });

    try {
      final content = await _ref
          .read(contentServiceProvider)
          .getContentById(contentId);
      if (_disposed) return;
      _content = content;
      _playLimit = content.playLimit ?? 0;

      // Siblings drive previous/next and autoplay. A failure here is not worth
      // failing the lesson over -- it only costs the navigation buttons.
      unawaited(_loadSiblings(content.topicId));

      await _loadSavedPosition();
      if (_disposed) return;

      // No play is claimed here. It used to be, before the source had even
      // resolved and before the resume prompt below, so a student who opened
      // the wrong lesson, read "Resume from 12:34" and pressed back had spent
      // a replay on four minutes of nothing -- and `retry()` comes back
      // through here, so a failure that needed retrying spent another. The
      // claim now happens when the video actually starts playing, once per
      // controller. See [_ensurePlayClaimed].
      await _resolveSource();
      if (_disposed) return;

      // Offer to resume rather than silently jumping: a student who finished
      // the lesson yesterday and reopened it today usually wants the start.
      if (shouldOfferResume(
        savedSeconds: _resumeFromSeconds,
        totalSeconds: _payload?.durationSeconds ?? _content?.durationSeconds ?? 0,
      )) {
        _set(() => _phase = PlayerPhase.askingToResume);
        return;
      }

      await _attach(Duration.zero, autoPlay: true);
    } on PlaybackException catch (failure) {
      if (_disposed) return;
      _set(() {
        _phase = failure.failure == PlaybackFailure.processing
            ? PlayerPhase.processing
            : PlayerPhase.failed;
        _error = failure.message;
      });
    } catch (err) {
      if (_disposed) return;
      _log('load failed: $err');
      _set(() {
        _phase = PlayerPhase.failed;
        _error = 'Could not load this lesson.';
      });
    }
  }

  Future<void> _loadSiblings(String topicId) async {
    try {
      final siblings = await _ref
          .read(contentServiceProvider)
          .getContentsByTopic(topicId);
      if (_disposed) return;
      _set(() => _siblings = siblings);
    } catch (err) {
      _log('lesson list unavailable: $err');
    }
  }

  Future<void> _loadSavedPosition() async {
    final student = await _ref.read(currentStudentProvider.future);
    if (student == null || _disposed) return;

    try {
      final progress = await _ref
          .read(contentServiceProvider)
          .getProgressFor(student.id, [contentId]);
      final saved = progress[contentId];
      if (saved == null || _disposed) return;

      _resumeFromSeconds = saved.isCompleted ? 0 : saved.lastPositionSeconds;
    } catch (err) {
      _log('saved position unavailable: $err');
    }
  }

  /// Whether a saved position is worth offering to resume from.
  ///
  /// Two thresholds, and both exist because of how it reads to a student. Less
  /// than [resumeThreshold] in is indistinguishable from the start, and a
  /// prompt to "resume from 0:12" is noise. Within [completeTailSeconds] of
  /// the end means they finished it, and someone reopening a finished lesson
  /// wants the beginning -- offering to resume at 44:58 of a 45-minute video
  /// reads as a bug.
  ///
  /// A lesson with no known duration gets the prompt: better to offer it than
  /// to silently discard a position the student earned.
  static bool shouldOfferResume({
    required int savedSeconds,
    required int totalSeconds,
  }) {
    if (savedSeconds <= resumeThreshold.inSeconds) return false;
    if (totalSeconds <= 0) return true;
    return savedSeconds < totalSeconds - completeTailSeconds;
  }

  /// Claims one play against the lesson's replay limit, at most once.
  ///
  /// Called when the video actually starts, not when the screen opens. A play
  /// is what the student watched; opening a lesson, reading the resume prompt
  /// and backing out is not one, and neither is a retry after a stream broke --
  /// that is the same play having another go at reaching the student.
  ///
  /// The count lives on `student_progress` server-side, because counting on
  /// the device would hand every replay back on a reinstall. Each intent
  /// carries a UUID so a timeout AFTER the server incremented does not burn
  /// a second replay on retry -- the server reads the key, finds the earlier
  /// decision, and hands back the same `allowed/plays/limit` without
  /// touching the counter again.
  /// Whether a claim RPC call is still needed, given the current state.
  ///
  /// Pulled out of `_ensurePlayClaimed` so the decision can be tested
  /// without standing a VideoPlayerController up. The scenarios that
  /// matter: a lesson with no limit is a free pass, a flag already set
  /// means the server has recorded the play in this session, and a
  /// positive limit with the flag unset is the one case where the RPC
  /// has to run.
  static bool shouldClaimPlay({
    required int playLimit,
    required bool playClaimed,
  }) {
    return playLimit > 0 && !playClaimed;
  }

  /// What the claim flag should be, given a server response.
  ///
  /// `allowed: true` means the server counted it and the next retry on this
  /// controller must not count again. `allowed: false` leaves the flag off
  /// so the player's refusal path runs, and anything other than a Map
  /// leaves the flag off too -- the idempotency key stays set either way,
  /// so a timed-out response followed by a retry hits the same decision
  /// on the server rather than a second increment. The exception path
  /// (handled by the caller) also leaves this flag off, by design.
  static bool claimedFromResponse(Object? response) {
    if (response is! Map) return false;
    return response['allowed'] == true;
  }

  Future<bool> _ensurePlayClaimed() async {
    if (!shouldClaimPlay(playLimit: _playLimit, playClaimed: _playClaimed)) {
      return true;
    }

    final key = _playClaimKey ??= _newUuidV4();

    try {
      final result = await _ref
          .read(supabaseClientProvider)
          .rpc('register_content_play', params: {
            'p_content_item_id': contentId,
            'p_idempotency_key': key,
          });

      if (result is! Map) return true;

      _playsUsed = (result['plays'] as num?)?.toInt() ?? 0;
      final limit = (result['limit'] as num?)?.toInt() ?? 0;
      if (limit > 0) _playLimit = limit;

      if (claimedFromResponse(result)) {
        _playClaimed = true;
        return true;
      }

      // `allowed: false` is not always a replay limit. The function answers
      // the same way when it cannot resolve the caller to a student and when
      // the item is not published -- and the player used to render all three
      // as "you have reached the replay limit", sending a student to their
      // mentor over an expired session. `reason` says which it is.
      _refusalReason = result['reason'] as String?;
      return false;
    } catch (err) {
      // A counter that cannot be reached must not lock a paying student out of
      // a lesson they are entitled to. This is also the offline case: the
      // limit is enforced server-side and a downloaded lesson has no server to
      // ask.
      //
      // The idempotency key is preserved on `_playClaimKey` across retries,
      // so if the server did increment and the response dropped on the way
      // back, the next retry sees the same decision rather than a second
      // increment.
      _log('play count unavailable: $err');
      return true;
    }
  }

  /// Idempotency key for the current play intent. Null until the first
  /// claim; set once and reused across retries, cleared when the controller
  /// is torn down.
  String? _playClaimKey;

  /// A UUID v4 string, generated without pulling in a package. Suitable only
  /// for identifying a request -- not for anything that needs cryptographic
  /// unpredictability. The RPC rejects stale keys past 24 hours, so a
  /// collision across devices is a non-issue in practice.
  static String _newUuidV4() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));

    // Set the version to 4 and the variant to the RFC 4122 form.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int offset, int length) {
      final buffer = StringBuffer();
      for (var i = 0; i < length; i++) {
        buffer.write(bytes[offset + i].toRadixString(16).padLeft(2, '0'));
      }
      return buffer.toString();
    }

    return '${hex(0, 4)}-${hex(4, 2)}-${hex(6, 2)}-${hex(8, 2)}-${hex(10, 6)}';
  }

  /// Why the server refused the play, when it did. Null for a genuine limit.
  String? _refusalReason;

  bool _playClaimed = false;

  /// What a refused play actually means.
  ///
  /// `register_content_play` answers `allowed: false` for three different
  /// things, and only one of them is a replay limit. Telling a student with an
  /// expired session to "contact your mentor about another look" sends them to
  /// a person who cannot help.
  static PlayerPhase phaseForRefusal(String? reason) =>
      reason == null || reason == 'limit_reached'
      ? PlayerPhase.limitReached
      : PlayerPhase.failed;

  /// Shows the right screen for a refused play.
  void _onPlayRefused() {
    final reason = _refusalReason;

    if (phaseForRefusal(reason) == PlayerPhase.limitReached) {
      _set(() => _phase = PlayerPhase.limitReached);
      return;
    }

    _set(() {
      _phase = PlayerPhase.failed;
      _error = reason == 'no_student'
          ? 'Please sign in again to play this lesson.'
          : 'This lesson is not available right now.';
    });
  }

  /// Decides whether this lesson plays from the device or from the network.
  ///
  /// A downloaded copy wins. It is already paid for, already on the phone and
  /// costs the student nothing to watch, so streaming it again would be a
  /// waste of their data whether or not they have a signal.
  Future<void> _resolveSource() async {
    final local = await _ref.read(localLibraryProvider).find(contentId);

    if (local != null) {
      _playingLocalCopy = true;
      _quality = local.quality ?? kAutoQuality;
      _localPath = local.path;
      return;
    }

    _playingLocalCopy = false;
    _localPath = null;
    _payload = await _ref.read(playbackServiceProvider).getStreaming(contentId);
  }

  String? _localPath;

  // ---------------------------------------------------------------------------
  // The controller itself
  // ---------------------------------------------------------------------------

  /// Builds a controller for the current source and seeks it to [from].
  ///
  /// Every quality switch and every retry goes through here, which is why the
  /// position and the playing state are arguments rather than something it
  /// reads: they have to survive an object being thrown away and replaced.
  Future<void> _attach(Duration from, {required bool autoPlay}) async {
    final previous = _video;
    _video = null;

    if (previous != null) {
      previous.removeListener(_onVideoTick);
      await previous.dispose();
    }

    final controller = _buildController();
    if (controller == null) {
      _set(() {
        _phase = PlayerPhase.failed;
        _error = 'This lesson has no video yet.';
      });
      return;
    }

    try {
      await controller.initialize();
    } catch (err) {
      _log('initialise failed: $err');
      await controller.dispose();
      _onPlaybackBroken();
      return;
    }

    if (_disposed) {
      await controller.dispose();
      return;
    }

    await controller.setPlaybackSpeed(_speed);
    if (from > Duration.zero) await controller.seekTo(from);

    controller.addListener(_onVideoTick);
    _video = controller;
    _retryAttempt = 0;

    _set(() {
      _phase = PlayerPhase.ready;
      _error = null;
    });

    if (autoPlay) await play();
    _showControls();
    _startProgressTimer();
  }

  VideoPlayerController? _buildController() {
    final path = _localPath;
    if (path != null) {
      return VideoPlayerController.file(File(path));
    }

    final payload = _payload;
    if (payload == null) return null;

    // Auto means the HLS ladder. Where there is no playlist -- an external
    // video is sometimes a bare MP4 -- the best rendition we were given is the
    // nearest thing to it.
    final ladder = payload.qualities;
    final url = _quality == kAutoQuality
        ? payload.hls ?? (ladder.isEmpty ? null : payload.mp4[ladder.first])
        : payload.mp4[_quality];

    if (url == null || url.isEmpty) return null;
    return VideoPlayerController.networkUrl(Uri.parse(url));
  }

  void _onVideoTick() {
    final value = _video?.value;
    if (value == null) return;

    if (value.hasError) {
      _onPlaybackBroken();
      return;
    }

    if (value.isCompleted) {
      _onCompleted();
    }

    // The tick is what redraws the scrubber and the clock, so it notifies on
    // every frame the platform reports. Nothing heavier belongs in here.
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Playback controls
  // ---------------------------------------------------------------------------

  Future<void> play() async {
    final controller = _video;
    if (controller == null) return;

    // The play is claimed here, where the student is actually about to watch
    // something, and only the first time for this controller.
    if (!await _ensurePlayClaimed()) {
      _onPlayRefused();
      return;
    }
    if (_disposed) return;

    _cancelAutoNext();
    await controller.play();
    await WakelockPlus.enable();
    _showControls();
    notifyListeners();
  }

  Future<void> pause() async {
    final controller = _video;
    if (controller == null) return;

    await controller.pause();
    await WakelockPlus.disable();
    // A pause is the clearest signal a student is stopping, so the position
    // goes to the server now rather than waiting for the next tick.
    await flushProgress();
    _showControls(sticky: true);
    notifyListeners();
  }

  Future<void> togglePlay() => isPlaying ? pause() : play();

  Future<void> seekTo(Duration target) async {
    final controller = _video;
    if (controller == null) return;

    final total = controller.value.duration;
    var clamped = target;
    if (clamped < Duration.zero) clamped = Duration.zero;
    if (total > Duration.zero && clamped > total) clamped = total;

    await controller.seekTo(clamped);
    _showControls();
    notifyListeners();
  }

  /// Where the student is dragging the scrubber to, while they are dragging.
  ///
  /// It lives here rather than inside the scrubber's own state because the
  /// clock under the scrubber has to show it. It used to be private to the
  /// slider, so the only number on screen during a drag was the live playback
  /// position -- which keeps advancing from where the video still is. On a
  /// 50-minute lesson that means dragging blind.
  Duration? get scrubTarget => _scrubTarget;
  Duration? _scrubTarget;

  /// The time to put on screen: the drag destination if there is one,
  /// otherwise where the video actually is.
  Duration get displayPosition => _scrubTarget ?? position;

  void scrubTo(Duration target) {
    _scrubTarget = target;
    _showControls(sticky: true);
    notifyListeners();
  }

  Future<void> endScrub(Duration target) async {
    _scrubTarget = null;
    await seekTo(target);
  }

  /// A relative seek, with the badge that accumulates while taps keep coming.
  ///
  /// Four quick double-taps should read "−20 seconds", not flash "−5" four
  /// times: the student is looking for a moment, and the total is the useful
  /// number.
  Future<void> nudge(bool forward) async {
    final step = forward ? _seekStep : -_seekStep;

    _pendingSeekBadge += step;
    _seekBadgeForward = forward;
    _seekBadgeVisible = true;

    _seekBadgeTimer?.cancel();
    _seekBadgeTimer = Timer(_seekBadgeLinger, () {
      _set(() {
        _pendingSeekBadge = Duration.zero;
        _seekBadgeVisible = false;
      });
    });

    await seekTo(position + step);
  }

  Future<void> setSpeed(double value) async {
    _speed = value;
    await _video?.setPlaybackSpeed(value);
    _showControls();
    notifyListeners();
  }

  /// Switches quality without the student losing their place.
  ///
  /// video_player cannot change a controller's source, so the controller is
  /// replaced. The position and whether it was playing are captured first and
  /// restored after, which is the whole trick.
  Future<void> setQuality(String value) async {
    final plan = planQualitySwap(
      currentQuality: _quality,
      requestedQuality: value,
      playingLocalCopy: _playingLocalCopy,
      currentPosition: position,
      isPlaying: isPlaying,
    );
    if (plan == null) return;

    _set(() {
      _quality = plan.nextQuality;
      _phase = PlayerPhase.loading;
    });

    await _attach(plan.resumeAt, autoPlay: plan.wasPlaying);
  }

  /// What a quality switch should hand `_attach`, or null if it is a no-op.
  ///
  /// Pulled out of `setQuality` so the capture itself can be tested without
  /// a platform. The two no-op cases (asking for the quality we are already
  /// on; a local copy, which has only one rendition) return null; otherwise
  /// the current position and `isPlaying` are the inputs to the next
  /// `_attach`. The whole point of the function is that the position and
  /// playing-state read happen before `_set` changes `_phase`, so a tested
  /// capture is enough to prove the student does not lose their place.
  static QualitySwap? planQualitySwap({
    required String currentQuality,
    required String requestedQuality,
    required bool playingLocalCopy,
    required Duration currentPosition,
    required bool isPlaying,
  }) {
    if (requestedQuality == currentQuality) return null;
    if (playingLocalCopy) return null;
    return QualitySwap(
      nextQuality: requestedQuality,
      resumeAt: currentPosition,
      wasPlaying: isPlaying,
    );
  }

  void toggleLock() {
    _locked = !_locked;
    // Locked means a hand resting on the screen cannot seek. The button itself
    // has to stay reachable or there is no way back.
    _controlsVisible = true;
    _controlsTimer?.cancel();
    if (!_locked) _showControls();
    notifyListeners();
  }

  /// Enters or leaves fullscreen.
  ///
  /// [fromRotation] records whether the device's orientation put us here or
  /// the student pressed the button, because back means different things in
  /// the two cases: a rotation-driven fullscreen has a portrait layout to drop
  /// back to, while one the student asked for explicitly should give them the
  /// screen they came from.
  Future<void> setFullscreen(bool value, {bool fromRotation = false}) async {
    if (_fullscreen == value) return;
    _fullscreen = value;
    _fullscreenFromRotation = value && fromRotation;

    if (value) {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }

    notifyListeners();
  }

  Future<void> toggleFullscreen() => setFullscreen(!_fullscreen);

  // ---------------------------------------------------------------------------
  // Control visibility
  // ---------------------------------------------------------------------------

  void tapScreen() {
    if (_controlsVisible) {
      _hideControls();
    } else {
      _showControls();
    }
  }

  /// Shows the controls and arms the auto-hide.
  ///
  /// `sticky` leaves them up: while a video is paused there is nothing to get
  /// out of the way of, and controls that vanish over a still frame only make
  /// the student tap again.
  void _showControls({bool sticky = false}) {
    _controlsVisible = true;
    _controlsTimer?.cancel();

    if (!sticky && !_locked) {
      _controlsTimer = Timer(_controlsTimeout, () {
        if (isPlaying) _set(() => _controlsVisible = false);
      });
    }

    notifyListeners();
  }

  void _hideControls() {
    _controlsTimer?.cancel();
    _set(() => _controlsVisible = false);
  }

  void keepControlsAlive() => _showControls();

  // ---------------------------------------------------------------------------
  // Resume
  // ---------------------------------------------------------------------------

  Future<void> resumeFromSaved() async {
    await _attach(Duration(seconds: _resumeFromSeconds), autoPlay: true);
  }

  Future<void> startOver() async {
    _resumeFromSeconds = 0;
    await _attach(Duration.zero, autoPlay: true);
  }

  // ---------------------------------------------------------------------------
  // Progress write-back
  // ---------------------------------------------------------------------------

  void _startProgressTimer() {
    _progressTimer?.cancel();
    _progressTimer = Timer.periodic(_progressInterval, (_) {
      if (isPlaying) unawaited(flushProgress());
    });
  }

  /// Sends the current position, if it has moved since the last time.
  ///
  /// Called on a timer, on pause, on dispose and when the app goes to the
  /// background -- which is the one that matters most, because a student
  /// switching away mid-lesson is the common case and the OS may never give us
  /// another chance.
  Future<void> flushProgress() async {
    final controller = _video;
    final content = _content;
    if (controller == null || content == null) return;

    final current = controller.value.position;
    final total = controller.value.duration;
    if (total <= Duration.zero) return;

    if ((current - _lastWrittenPosition).abs() < const Duration(seconds: 2)) {
      return;
    }
    _lastWrittenPosition = current;

    final percentage =
        (current.inMilliseconds / total.inMilliseconds * 100).clamp(0, 100);

    await _ref.read(progressWriterProvider).write(
          contentItemId: contentId,
          positionSeconds: current.inSeconds,
          progressPercentage: percentage.toDouble(),
        );
  }

  // ---------------------------------------------------------------------------
  // Failure and recovery
  // ---------------------------------------------------------------------------

  /// A stream that has broken mid-playback.
  ///
  /// Mobile data drops for a few seconds all the time, so this retries before
  /// it gives up. If the lesson has been downloaded, it switches to that copy
  /// instead of making the student watch a spinner -- they already have the
  /// file.
  ///
  /// It also re-mints the token, which it used to not do. Streaming URLs last
  /// six hours, so a student who started a lesson in the morning and came back
  /// to it in the evening had a controller holding dead URLs: every segment
  /// 403'd, all three retries re-attached against the identical dead URL, and
  /// the student was told to check a connection that was fine.
  void _onPlaybackBroken() {
    if (_disposed) return;

    final resumeAt = position;

    if (_retryAttempt < maxPlaybackRetries) {
      final delay = retryDelayFor(_retryAttempt);
      _retryAttempt++;

      _retryTimer?.cancel();
      _retryTimer = Timer(delay, () => unawaited(_recover(resumeAt)));

      _set(() => _phase = PlayerPhase.loading);
      return;
    }

    _set(() {
      _phase = PlayerPhase.failed;
      _error = _authFailure ?? 'Playback stopped. Check your connection and try again.';
    });
  }

  /// Set when the last recovery attempt failed for a reason the network cannot
  /// explain, so the final message says that instead of blaming the signal.
  String? _authFailure;

  /// One recovery attempt: the downloaded copy if there is one, otherwise a
  /// fresh token and a fresh player.
  Future<void> _recover(Duration resumeAt) async {
    if (_disposed) return;

    // The file beats anything over the air. It is already paid for and already
    // here, so there is no token to expire and no signal to wait for.
    final local = await _ref.read(localLibraryProvider).find(contentId);
    if (_disposed) return;

    if (local != null && !_playingLocalCopy) {
      _playingLocalCopy = true;
      _localPath = local.path;
      _quality = local.quality ?? kAutoQuality;
      _payload = null;
      await _attach(resumeAt, autoPlay: true);
      return;
    }

    if (!_playingLocalCopy && _shouldRefreshToken()) {
      final service = _ref.read(playbackServiceProvider);
      service.forget(contentId);

      try {
        _payload = await service.getStreaming(contentId);
        _authFailure = null;
      } on PlaybackException catch (failure) {
        if (_disposed) return;

        // A refused token is not a dropped connection, and must not be
        // reported as one. Signing in again or enrolling is something the
        // student can act on; "check your connection" is not.
        if (failure.failure == PlaybackFailure.notSignedIn ||
            failure.failure == PlaybackFailure.notEntitled) {
          _authFailure = failure.message;
          _retryAttempt = _retryDelays.length;
          _set(() {
            _phase = PlayerPhase.failed;
            _error = failure.message;
          });
          return;
        }

        _authFailure = failure.message;
      }
    }

    if (_disposed) return;
    await _attach(resumeAt, autoPlay: true);
  }

  /// Whether the token is worth re-minting before the next attempt.
  ///
  /// Always on the last attempt, and sooner when the payload has run out of
  /// usable life -- which is the case the six-hour TTL actually produces.
  /// Re-minting on every attempt would turn a two-second signal drop into
  /// three Edge Function calls.
  bool _shouldRefreshToken() => shouldRefreshToken(
    payload: _payload,
    attempt: _retryAttempt,
  );

  /// Whether the next recovery attempt should re-mint the token first.
  ///
  /// On the last attempt always, and sooner once the payload has run out of
  /// usable life -- which is the case the six-hour TTL actually produces.
  /// Re-minting on every attempt would turn a two-second signal drop into
  /// three Edge Function calls.
  static bool shouldRefreshToken({
    required PlaybackPayload? payload,
    required int attempt,
  }) {
    if (payload == null) return true;
    if (!payload.isUsable) return true;
    return attempt >= maxPlaybackRetries;
  }

  /// How long to wait before recovery attempt [attempt] (zero-based).
  ///
  /// Clamped rather than indexed, so a caller that has lost count backs off by
  /// the longest delay instead of throwing out of a timer callback.
  static Duration retryDelayFor(int attempt) =>
      _retryDelays[attempt.clamp(0, _retryDelays.length - 1)];

  /// How many recovery attempts a broken stream gets before giving up.
  static int get maxPlaybackRetries => _retryDelays.length;

  /// Retries from the start of the chain: a fresh token, then a fresh player.
  ///
  /// This comes back through [load], which no longer claims a play -- so the
  /// student pressing Retry after a failure is not charged a second replay for
  /// the lesson they have not managed to watch yet.
  Future<void> retry() async {
    _retryAttempt = 0;
    _authFailure = null;
    _ref.read(playbackServiceProvider).forget(contentId);
    await load();
  }

  // ---------------------------------------------------------------------------
  // End of lesson
  // ---------------------------------------------------------------------------

  void _onCompleted() {
    unawaited(WakelockPlus.disable());
    unawaited(flushProgress());

    if (_autoNextTimer != null || nextLesson == null) return;

    _autoNextSeconds = 5;
    _autoNextTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      _set(() {
        _autoNextSeconds--;
        if (_autoNextSeconds <= 0) {
          timer.cancel();
          _autoNextTimer = null;
          _autoNextDue = true;
        }
      });
    });
  }

  /// Stops the countdown. The student has said they are not done here.
  void cancelAutoNext() => _cancelAutoNext();

  /// Called by the screen once it has opened the next lesson.
  void consumeAutoNext() => _autoNextDue = false;

  void _cancelAutoNext() {
    if (_autoNextTimer == null && _autoNextSeconds == 0 && !_autoNextDue) {
      return;
    }
    _autoNextTimer?.cancel();
    _autoNextTimer = null;
    _set(() {
      _autoNextSeconds = 0;
      _autoNextDue = false;
    });
  }

  // ---------------------------------------------------------------------------

  void _log(String message) => logDebug('player', message);

  void _set(VoidCallback change) {
    if (_disposed) return;
    change();
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;

    _seekBadgeTimer?.cancel();
    _controlsTimer?.cancel();
    _progressTimer?.cancel();
    _retryTimer?.cancel();
    _autoNextTimer?.cancel();

    // Fire and forget: dispose cannot await, and losing the last few seconds
    // of a position is a smaller problem than holding the screen on a dead
    // route while a request finishes.
    unawaited(flushProgress());
    unawaited(WakelockPlus.disable());

    final controller = _video;
    _video = null;
    controller?.removeListener(_onVideoTick);
    unawaited(controller?.dispose() ?? Future<void>.value());

    if (_fullscreen) {
      unawaited(SystemChrome.setPreferredOrientations(DeviceOrientation.values));
      unawaited(
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge),
      );
    }

    super.dispose();
  }
}

final playerControllerProvider = ChangeNotifierProvider.autoDispose
    .family<PlayerController, String>((ref, contentId) {
  final controller = PlayerController(ref, contentId);
  // Kicked off here rather than in the constructor so the provider is already
  // registered when the first notification arrives.
  Future.microtask(controller.load);
  return controller;
});
