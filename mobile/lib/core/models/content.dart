/// Maps the live `content_items` table.
///
/// Content lives in the hierarchy courses -> subjects -> topics -> content_items.
/// There is no `contents` table.
enum ContentItemType {
  video,
  pdf,
  note,
  ebook,
  pyp,
  quiz,
  unknown;

  /// Values of the `content_type` enum in Postgres.
  static ContentItemType fromString(String? raw) {
    switch (raw) {
      case 'video':
        return ContentItemType.video;
      case 'pdf':
        return ContentItemType.pdf;
      case 'note':
        return ContentItemType.note;
      case 'ebook':
        return ContentItemType.ebook;
      case 'pyp':
        return ContentItemType.pyp;
      case 'quiz':
        return ContentItemType.quiz;
      default:
        return ContentItemType.unknown;
    }
  }

  /// The string Postgres expects back for this type.
  String get wireValue {
    switch (this) {
      case ContentItemType.video:
        return 'video';
      case ContentItemType.pdf:
        return 'pdf';
      case ContentItemType.note:
        return 'note';
      case ContentItemType.ebook:
        return 'ebook';
      case ContentItemType.pyp:
        return 'pyp';
      case ContentItemType.quiz:
        return 'quiz';
      case ContentItemType.unknown:
        return 'note';
    }
  }

  String get label {
    switch (this) {
      case ContentItemType.video:
        return 'Video';
      case ContentItemType.pdf:
        return 'PDF';
      case ContentItemType.note:
        return 'Notes';
      case ContentItemType.ebook:
        return 'E-book';
      case ContentItemType.pyp:
        return 'Previous year paper';
      case ContentItemType.quiz:
        return 'Quiz';
      case ContentItemType.unknown:
        return 'Lesson';
    }
  }
}

class Content {
  final String id;
  final String topicId;
  final ContentItemType type;
  final String title;
  final String? description;

  /// Direct asset URL (video file, PDF, note attachment).
  final String? fileUrl;

  /// Provider-side id for hosted/DRM video, when the video is not a plain URL.
  final String? videoId;

  final int durationSeconds;
  final bool isPaid;
  final bool isDownloadable;
  final bool isPrintable;
  final int? playLimit;

  /// content_status enum: draft / published / archived.
  final String status;
  final int weight;
  final Map<String, dynamic> metadata;

  const Content({
    required this.id,
    required this.topicId,
    required this.type,
    required this.title,
    this.description,
    this.fileUrl,
    this.videoId,
    required this.durationSeconds,
    required this.isPaid,
    required this.isDownloadable,
    required this.isPrintable,
    this.playLimit,
    required this.status,
    required this.weight,
    this.metadata = const {},
  });

  bool get isPublished => status == 'published';

  bool get isVideo => type == ContentItemType.video;

  /// Free preview content. The live column is `is_paid`.
  bool get isFree => !isPaid;

  /// Playable URL for the video player, when the asset is a plain network URL.
  String? get videoUrl {
    final url = fileUrl;
    if (url == null || url.isEmpty) return null;
    if (!url.startsWith('http')) return null;
    return url;
  }

  bool get hasVideo => isVideo && videoUrl != null;

  /// A hosted video we have an id for but no direct URL — needs a provider SDK.
  bool get hasHostedVideo =>
      isVideo && videoUrl == null && (videoId?.isNotEmpty ?? false);

  int get durationMinutes => durationSeconds ~/ 60;

  String get formattedDuration {
    if (durationSeconds <= 0) return '—';
    if (durationSeconds < 60) return '${durationSeconds}s';
    final totalMinutes = durationSeconds ~/ 60;
    if (totalMinutes < 60) return '$totalMinutes min';
    final hours = totalMinutes ~/ 60;
    final mins = totalMinutes % 60;
    if (mins == 0) return '$hours hr';
    return '$hours hr $mins min';
  }

  factory Content.fromJson(Map<String, dynamic> json) {
    final rawMeta = json['metadata'];
    final meta = <String, dynamic>{};
    if (rawMeta is Map) {
      for (final entry in rawMeta.entries) {
        meta[entry.key.toString()] = entry.value;
      }
    }

    return Content(
      id: json['id'] as String,
      topicId: json['topic_id'] as String,
      type: ContentItemType.fromString(json['type'] as String?),
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      fileUrl: json['file_url'] as String?,
      videoId: json['video_id'] as String?,
      durationSeconds: (json['duration_seconds'] as num?)?.toInt() ?? 0,
      isPaid: json['is_paid'] as bool? ?? true,
      isDownloadable: json['is_downloadable'] as bool? ?? false,
      isPrintable: json['is_printable'] as bool? ?? false,
      playLimit: (json['play_limit'] as num?)?.toInt(),
      status: json['status'] as String? ?? 'draft',
      weight: (json['weight'] as num?)?.toInt() ?? 0,
      metadata: meta,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'topic_id': topicId,
      'type': type.wireValue,
      'title': title,
      'description': description,
      'file_url': fileUrl,
      'video_id': videoId,
      'duration_seconds': durationSeconds,
      'is_paid': isPaid,
      'is_downloadable': isDownloadable,
      'is_printable': isPrintable,
      'play_limit': playLimit,
      'status': status,
      'weight': weight,
      'metadata': metadata,
    };
  }
}

/// Maps the live `student_progress` table.
class ContentProgress {
  final String id;
  final String studentId;
  final String contentItemId;
  final String status;
  final double progressPercentage;
  final int lastPositionSeconds;
  final DateTime? completedAt;

  const ContentProgress({
    required this.id,
    required this.studentId,
    required this.contentItemId,
    required this.status,
    required this.progressPercentage,
    required this.lastPositionSeconds,
    this.completedAt,
  });

  bool get isCompleted => status == 'completed';

  factory ContentProgress.fromJson(Map<String, dynamic> json) {
    return ContentProgress(
      id: json['id'] as String,
      studentId: json['student_id'] as String,
      contentItemId: json['content_item_id'] as String,
      status: json['status'] as String? ?? 'not_started',
      progressPercentage:
          (json['progress_percentage'] as num?)?.toDouble() ?? 0,
      lastPositionSeconds:
          (json['last_position_seconds'] as num?)?.toInt() ?? 0,
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
    );
  }
}
