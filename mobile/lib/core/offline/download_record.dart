import 'server_clock.dart';

/// Where a download has got to.
enum DownloadStatus {
  /// Waiting for a slot, or for Wi-Fi to come back.
  queued,

  /// Bytes are arriving.
  downloading,

  /// Stopped. [DownloadRecord.pausedReason] says by whom.
  paused,

  /// On the device and playable.
  done,

  /// Gave up after retrying. The file, if any, is partial.
  failed,

  /// The licence lapsed or the enrolment ended. The file has been removed.
  expired;

  static DownloadStatus fromName(String? raw) {
    for (final value in DownloadStatus.values) {
      if (value.name == raw) return value;
    }
    return DownloadStatus.queued;
  }

  bool get isActive =>
      this == DownloadStatus.queued || this == DownloadStatus.downloading;
}

/// Who stopped a paused download.
///
/// The two cannot be the same state. A student who paused to save data meant
/// it, and the next connectivity event must not undo them; a row parked
/// because the connection went metered is waiting to be picked back up the
/// moment Wi-Fi returns. One `paused` with no reason made every reconnect
/// restart a download the student had deliberately stopped.
enum PauseReason {
  /// The student pressed pause.
  student,

  /// The Wi-Fi-only rule parked it: no connection, or a metered one.
  network;

  static PauseReason? fromName(String? raw) {
    for (final value in PauseReason.values) {
      if (value.name == raw) return value;
    }
    return null;
  }
}

/// One content item saved, or being saved, to this device.
class DownloadRecord {
  final String contentItemId;

  /// Which student this copy belongs to.
  ///
  /// Not decoration. A download is a paid thing sitting on a device that may
  /// be shared, so every read of it is filtered on this and the player checks
  /// it again before opening the file.
  final String studentId;

  final String? courseId;
  final String? courseName;
  final String? subjectId;
  final String? subjectName;
  final String? topicId;
  final String title;

  /// 'video' or the document type, so the Downloads screen can group and the
  /// reader knows what it is opening.
  final String type;

  /// The rendition height for a video, e.g. '480'. Null for a document.
  final String? quality;

  /// Absolute path, inside the app's private support directory. Null until
  /// the first byte has somewhere to go.
  final String? localPath;

  final int bytesTotal;
  final int bytesDone;
  final DownloadStatus status;

  /// Only meaningful while [status] is [DownloadStatus.paused].
  final PauseReason? pausedReason;

  final String? error;
  final int attempts;

  /// When this copy stops being playable without reconnecting. Null for
  /// something with no enrolment behind it.
  ///
  /// Set from the server's own clock, never the device's.
  final DateTime? licenceExpiresAt;

  /// How many days the licence was granted for, as the server stated it.
  final int? licenceDays;

  /// The server's time at the last successful check on this copy.
  ///
  /// Together with [licenceDays] this is the backstop: a device that stops
  /// checking in runs out of licence even if the stored expiry says otherwise.
  final DateTime? lastVerifiedAt;

  final DateTime createdAt;
  final DateTime? completedAt;

  const DownloadRecord({
    required this.contentItemId,
    required this.studentId,
    this.courseId,
    this.courseName,
    this.subjectId,
    this.subjectName,
    this.topicId,
    required this.title,
    required this.type,
    this.quality,
    this.localPath,
    required this.bytesTotal,
    required this.bytesDone,
    required this.status,
    this.pausedReason,
    this.error,
    required this.attempts,
    this.licenceExpiresAt,
    this.licenceDays,
    this.lastVerifiedAt,
    required this.createdAt,
    this.completedAt,
  });

  bool get isVideo => type == 'video';

  double get fraction {
    if (bytesTotal <= 0) return 0;
    return (bytesDone / bytesTotal).clamp(0.0, 1.0);
  }

  /// Whether the licence still stands, against the server's clock.
  ///
  /// [reading] rather than `DateTime.now()`, because the device clock is the
  /// student's to set and a licence decided by it is not a licence at all.
  bool isLicenceValidAt(ClockReading reading) {
    if (licenceExpiresAt == null && licenceDays == null) return true;
    return reading.licenceStands(
      expiresAt: licenceExpiresAt,
      lastVerifiedAt: lastVerifiedAt,
      licenceDays: licenceDays,
    );
  }

  /// Playable right now: the bytes are all here and the licence still stands.
  bool isPlayableAt(ClockReading reading) =>
      status == DownloadStatus.done &&
      localPath != null &&
      isLicenceValidAt(reading);

  /// Parked by the Wi-Fi-only rule, so a reconnect may pick it up again.
  bool get isAutoPaused =>
      status == DownloadStatus.paused && pausedReason == PauseReason.network;

  factory DownloadRecord.fromRow(Map<String, Object?> row) {
    DateTime? millis(Object? value) {
      if (value is! int) return null;
      return DateTime.fromMillisecondsSinceEpoch(value);
    }

    return DownloadRecord(
      contentItemId: row['content_item_id'] as String,
      studentId: row['student_id'] as String? ?? '',
      courseId: row['course_id'] as String?,
      courseName: row['course_name'] as String?,
      subjectId: row['subject_id'] as String?,
      subjectName: row['subject_name'] as String?,
      topicId: row['topic_id'] as String?,
      title: row['title'] as String? ?? '',
      type: row['type'] as String? ?? 'video',
      quality: row['quality'] as String?,
      localPath: row['local_path'] as String?,
      bytesTotal: (row['bytes_total'] as int?) ?? 0,
      bytesDone: (row['bytes_done'] as int?) ?? 0,
      status: DownloadStatus.fromName(row['status'] as String?),
      pausedReason: PauseReason.fromName(row['paused_reason'] as String?),
      error: row['error'] as String?,
      attempts: (row['attempts'] as int?) ?? 0,
      licenceExpiresAt: millis(row['licence_expires_at']),
      licenceDays: row['licence_days'] as int?,
      lastVerifiedAt: millis(row['last_verified_at']),
      createdAt:
          millis(row['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      completedAt: millis(row['completed_at']),
    );
  }

  Map<String, Object?> toRow() {
    return {
      'content_item_id': contentItemId,
      'student_id': studentId,
      'course_id': courseId,
      'course_name': courseName,
      'subject_id': subjectId,
      'subject_name': subjectName,
      'topic_id': topicId,
      'title': title,
      'type': type,
      'quality': quality,
      'local_path': localPath,
      'bytes_total': bytesTotal,
      'bytes_done': bytesDone,
      'status': status.name,
      'paused_reason': pausedReason?.name,
      'error': error,
      'attempts': attempts,
      'licence_expires_at': licenceExpiresAt?.millisecondsSinceEpoch,
      'licence_days': licenceDays,
      'last_verified_at': lastVerifiedAt?.millisecondsSinceEpoch,
      'created_at': createdAt.millisecondsSinceEpoch,
      'completed_at': completedAt?.millisecondsSinceEpoch,
    };
  }

  DownloadRecord copyWith({
    String? quality,
    String? localPath,
    int? bytesTotal,
    int? bytesDone,
    DownloadStatus? status,
    PauseReason? pausedReason,
    String? error,
    bool clearError = false,
    int? attempts,
    DateTime? licenceExpiresAt,
    int? licenceDays,
    DateTime? lastVerifiedAt,
    DateTime? completedAt,
  }) {
    return DownloadRecord(
      contentItemId: contentItemId,
      studentId: studentId,
      courseId: courseId,
      courseName: courseName,
      subjectId: subjectId,
      subjectName: subjectName,
      topicId: topicId,
      title: title,
      type: type,
      quality: quality ?? this.quality,
      localPath: localPath ?? this.localPath,
      bytesTotal: bytesTotal ?? this.bytesTotal,
      bytesDone: bytesDone ?? this.bytesDone,
      status: status ?? this.status,
      pausedReason: pausedReason ?? this.pausedReason,
      error: clearError ? null : (error ?? this.error),
      attempts: attempts ?? this.attempts,
      licenceExpiresAt: licenceExpiresAt ?? this.licenceExpiresAt,
      licenceDays: licenceDays ?? this.licenceDays,
      lastVerifiedAt: lastVerifiedAt ?? this.lastVerifiedAt,
      createdAt: createdAt,
      completedAt: completedAt ?? this.completedAt,
    );
  }
}

/// A watched position that has not reached the server yet.
class QueuedProgress {
  final int id;
  final String contentItemId;
  final int positionSeconds;
  final double progressPercentage;
  final String status;
  final DateTime queuedAt;

  const QueuedProgress({
    required this.id,
    required this.contentItemId,
    required this.positionSeconds,
    required this.progressPercentage,
    required this.status,
    required this.queuedAt,
  });

  factory QueuedProgress.fromRow(Map<String, Object?> row) {
    return QueuedProgress(
      id: row['id'] as int,
      contentItemId: row['content_item_id'] as String,
      positionSeconds: (row['position_seconds'] as int?) ?? 0,
      progressPercentage: (row['progress_percentage'] as num?)?.toDouble() ?? 0,
      status: row['status'] as String? ?? 'in_progress',
      queuedAt: DateTime.fromMillisecondsSinceEpoch(
        (row['queued_at'] as int?) ?? 0,
      ),
    );
  }
}

/// One attachment saved as part of a lesson's download.
///
/// Belongs to the lesson's [DownloadRecord], which carries the licence; a
/// saved file is only readable while that record is.
class SavedFile {
  final String contentItemId;
  final String fileId;
  final String name;

  /// Lower-cased, without the dot. Kept so the reader knows a PDF from an
  /// image with no network to ask.
  final String extension;

  final String localPath;
  final int bytes;
  final int weight;

  const SavedFile({
    required this.contentItemId,
    required this.fileId,
    required this.name,
    required this.extension,
    required this.localPath,
    required this.bytes,
    required this.weight,
  });

  factory SavedFile.fromRow(Map<String, Object?> row) {
    return SavedFile(
      contentItemId: row['content_item_id'] as String,
      fileId: row['file_id'] as String,
      name: row['name'] as String? ?? '',
      extension: row['extension'] as String? ?? '',
      localPath: row['local_path'] as String,
      bytes: (row['bytes'] as num?)?.toInt() ?? 0,
      weight: (row['weight'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, Object?> toRow(String studentId) => {
        'content_item_id': contentItemId,
        'student_id': studentId,
        'file_id': fileId,
        'name': name,
        'extension': extension,
        'local_path': localPath,
        'bytes': bytes,
        'weight': weight,
      };
}
