/// Where a download has got to.
enum DownloadStatus {
  /// Waiting for a slot, or for Wi-Fi to come back.
  queued,

  /// Bytes are arriving.
  downloading,

  /// Stopped by the student, or by the Wi-Fi-only rule.
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

/// One content item saved, or being saved, to this device.
class DownloadRecord {
  final String contentItemId;
  final String? courseId;
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
  final String? error;
  final int attempts;

  /// When this copy stops being playable without reconnecting. Null for
  /// something with no enrolment behind it.
  final DateTime? licenceExpiresAt;

  final DateTime createdAt;
  final DateTime? completedAt;

  const DownloadRecord({
    required this.contentItemId,
    this.courseId,
    this.topicId,
    required this.title,
    required this.type,
    this.quality,
    this.localPath,
    required this.bytesTotal,
    required this.bytesDone,
    required this.status,
    this.error,
    required this.attempts,
    this.licenceExpiresAt,
    required this.createdAt,
    this.completedAt,
  });

  bool get isVideo => type == 'video';

  double get fraction {
    if (bytesTotal <= 0) return 0;
    return (bytesDone / bytesTotal).clamp(0.0, 1.0);
  }

  bool get isLicenceValid =>
      licenceExpiresAt == null || DateTime.now().isBefore(licenceExpiresAt!);

  /// Playable right now: the bytes are all here and the licence still stands.
  bool get isPlayable =>
      status == DownloadStatus.done && localPath != null && isLicenceValid;

  factory DownloadRecord.fromRow(Map<String, Object?> row) {
    DateTime? millis(Object? value) {
      if (value is! int) return null;
      return DateTime.fromMillisecondsSinceEpoch(value);
    }

    return DownloadRecord(
      contentItemId: row['content_item_id'] as String,
      courseId: row['course_id'] as String?,
      topicId: row['topic_id'] as String?,
      title: row['title'] as String? ?? '',
      type: row['type'] as String? ?? 'video',
      quality: row['quality'] as String?,
      localPath: row['local_path'] as String?,
      bytesTotal: (row['bytes_total'] as int?) ?? 0,
      bytesDone: (row['bytes_done'] as int?) ?? 0,
      status: DownloadStatus.fromName(row['status'] as String?),
      error: row['error'] as String?,
      attempts: (row['attempts'] as int?) ?? 0,
      licenceExpiresAt: millis(row['licence_expires_at']),
      createdAt:
          millis(row['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      completedAt: millis(row['completed_at']),
    );
  }

  Map<String, Object?> toRow() {
    return {
      'content_item_id': contentItemId,
      'course_id': courseId,
      'topic_id': topicId,
      'title': title,
      'type': type,
      'quality': quality,
      'local_path': localPath,
      'bytes_total': bytesTotal,
      'bytes_done': bytesDone,
      'status': status.name,
      'error': error,
      'attempts': attempts,
      'licence_expires_at': licenceExpiresAt?.millisecondsSinceEpoch,
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
    String? error,
    bool clearError = false,
    int? attempts,
    DateTime? licenceExpiresAt,
    DateTime? completedAt,
  }) {
    return DownloadRecord(
      contentItemId: contentItemId,
      courseId: courseId,
      topicId: topicId,
      title: title,
      type: type,
      quality: quality ?? this.quality,
      localPath: localPath ?? this.localPath,
      bytesTotal: bytesTotal ?? this.bytesTotal,
      bytesDone: bytesDone ?? this.bytesDone,
      status: status ?? this.status,
      error: clearError ? null : (error ?? this.error),
      attempts: attempts ?? this.attempts,
      licenceExpiresAt: licenceExpiresAt ?? this.licenceExpiresAt,
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
