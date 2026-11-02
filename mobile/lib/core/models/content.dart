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

  /// An external link, and nothing else. A video we host has no stored URL:
  /// its playable address is signed per request and expires.
  final String? fileUrl;

  /// Provider-side id for hosted/DRM video, when the video is not a plain URL.
  final String? videoId;

  /// 'none', 'bunny' (hosted on Bunny Stream) or 'external'.
  final String videoProvider;

  /// Bunny's handle for the video. The playable URL is derived from it.
  final String? bunnyVideoGuid;

  /// 'none', 'processing', 'ready' or 'failed' -- mirrors Bunny's transcode.
  final String videoStatus;

  final String? videoThumbnailUrl;

  /// Resolution labels Bunny finished encoding, e.g. ['360p', '720p'].
  final List<String> videoResolutions;

  /// Days a downloaded copy keeps working before the student must reconnect.
  final int offlineLicenseDays;

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
    this.videoProvider = 'none',
    this.bunnyVideoGuid,
    this.videoStatus = 'none',
    this.videoThumbnailUrl,
    this.videoResolutions = const [],
    this.offlineLicenseDays = 30,
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

  /// The external link on the item, when there is one.
  ///
  /// This is never the address of a video we host. Those are served from a
  /// token-authenticated CDN, so the URL is minted per request by
  /// `PlaybackService` and is dead within hours -- which is the point.
  String? get videoUrl {
    final url = fileUrl;
    if (url == null || url.isEmpty) return null;
    if (!url.startsWith('http')) return null;
    return url;
  }

  bool get isBunnyVideo => videoProvider == 'bunny';
  bool get isExternalVideo => videoProvider == 'external';

  bool get isVideoReady => videoStatus == 'ready';
  bool get isVideoProcessing => videoStatus == 'processing';
  bool get isVideoFailed => videoStatus == 'failed';

  /// Whether there is something to play right now.
  ///
  /// A video still transcoding is deliberately not playable: Bunny has no
  /// playlist for it yet, and offering a play button would only produce an
  /// error the student cannot act on.
  bool get hasVideo =>
      isVideo &&
      ((isBunnyVideo && isVideoReady) || (isExternalVideo && videoUrl != null));

  /// A document the reader can open. Quizzes are not one; everything else is.
  bool get isReadable =>
      type == ContentItemType.pdf ||
      type == ContentItemType.note ||
      type == ContentItemType.ebook ||
      type == ContentItemType.pyp;

  /// Only a video we host has MP4 renditions, so only it can be saved for
  /// offline use. An external video has neither renditions nor a token.
  ///
  /// Quizzes are excluded by both arms and deliberately so: tests are
  /// online-only. They are scored server-side, so a downloaded one could be
  /// re-attempted with nothing recording it. Downloaded videos and documents
  /// are the whole of the offline surface for now.
  bool get canDownload =>
      isDownloadable &&
      (isReadable || (isVideo && isBunnyVideo && isVideoReady));

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
      videoProvider: json['video_provider'] as String? ?? 'none',
      bunnyVideoGuid: json['bunny_video_guid'] as String?,
      videoStatus: json['video_status'] as String? ?? 'none',
      videoThumbnailUrl: json['video_thumbnail_url'] as String?,
      videoResolutions: _stringList(json['video_resolutions']),
      offlineLicenseDays:
          (json['offline_license_days'] as num?)?.toInt() ?? 30,
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
      'video_provider': videoProvider,
      'bunny_video_guid': bunnyVideoGuid,
      'video_status': videoStatus,
      'video_thumbnail_url': videoThumbnailUrl,
      'video_resolutions': videoResolutions,
      'offline_license_days': offlineLicenseDays,
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

/// Postgres hands a `text[]` back as a plain list; anything else is a row we
/// do not understand and an empty ladder is safer than a half-read one.
List<String> _stringList(Object? raw) {
  if (raw is! List) return const [];
  return raw.map((value) => value.toString()).toList(growable: false);
}

/// What the server hands back when asked for a playable video.
///
/// Comes from the `video-playback-token` Edge Function, which checks the
/// paywall and then signs URLs that expire. Nothing here is worth storing: by
/// the time the app is next opened these addresses are refused by the CDN.
class PlaybackPayload {
  /// 'bunny' or 'external'.
  final String provider;

  /// The adaptive stream. Null for a download-only payload.
  final String? hls;

  /// Per-resolution MP4 URLs, keyed by height as a string: {'480': url}.
  ///
  /// This is what the quality menu offers beyond Auto, and what an offline
  /// download fetches. Empty when the Bunny library has MP4 fallback off, or
  /// for an external video.
  final Map<String, String> mp4;

  final String? thumbnail;
  final int? durationSeconds;
  final bool isDownloadable;
  final int offlineLicenseDays;

  /// When the enrolment runs out, or null if it never does. The offline
  /// licence can never outlive it.
  final DateTime? validUntil;

  /// When these URLs stop working.
  final DateTime expiresAt;

  /// The server's own clock when it answered.
  ///
  /// Every licence this payload leads to is measured from here rather than
  /// from `DateTime.now()`. A licence measured by the device clock is a
  /// licence the student renews in their date settings.
  final DateTime serverNow;

  const PlaybackPayload({
    required this.provider,
    this.hls,
    this.mp4 = const {},
    this.thumbnail,
    this.durationSeconds,
    required this.isDownloadable,
    required this.offlineLicenseDays,
    this.validUntil,
    required this.expiresAt,
    required this.serverNow,
  });

  /// Resolution heights, highest first, as the quality menu lists them.
  List<String> get qualities {
    final heights = mp4.keys.toList()
      ..sort((a, b) => (int.tryParse(b) ?? 0).compareTo(int.tryParse(a) ?? 0));
    return heights;
  }

  /// Five minutes of headroom, so a payload is never handed out with just
  /// enough life left to start a request and not finish it.
  bool get isUsable =>
      DateTime.now().isBefore(expiresAt.subtract(const Duration(minutes: 5)));

  factory PlaybackPayload.fromJson(Map<String, dynamic> json) {
    final rawMp4 = json['mp4'];
    final mp4 = <String, String>{};
    if (rawMp4 is Map) {
      for (final entry in rawMp4.entries) {
        final value = entry.value;
        if (value is String && value.isNotEmpty) {
          mp4[entry.key.toString()] = value;
        }
      }
    }

    final expires = json['expiresAt'] as String?;
    final rawServerNow = json['serverNow'] as String?;
    final serverNow = rawServerNow == null
        ? null
        : DateTime.tryParse(rawServerNow);

    return PlaybackPayload(
      provider: json['provider'] as String? ?? 'none',
      hls: json['hls'] as String?,
      mp4: mp4,
      thumbnail: json['thumbnail'] as String?,
      durationSeconds: (json['durationSeconds'] as num?)?.toInt(),
      isDownloadable: json['isDownloadable'] as bool? ?? false,
      offlineLicenseDays:
          (json['offlineLicenseDays'] as num?)?.toInt() ?? 30,
      validUntil: json['validUntil'] != null
          ? DateTime.tryParse(json['validUntil'] as String)
          : null,
      // A payload with no expiry is not a licence to play forever; treat it as
      // already spent so the next request replaces it.
      expiresAt: expires != null
          ? DateTime.tryParse(expires) ?? DateTime.now()
          : DateTime.now(),
      // An answer that carried no server clock falls back to the device's.
      // That is a weaker anchor, but refusing to play a lesson because the
      // function has not been redeployed yet would be worse, and the expiry
      // above still caps how long such a payload is usable.
      serverNow: (serverNow ?? DateTime.now()).toUtc(),
    );
  }
}
