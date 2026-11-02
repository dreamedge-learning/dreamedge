import 'package:intl/intl.dart';

/// A class the mentors run on a schedule and the student can either join
/// live, watch the recording of, or wait for.
///
/// Fields match the live_classes table in the admin schema. The old shape of
/// this model carried a `thumbnail_url` column that does not exist and read
/// `instructor_name` as a flat field even though the service pulls it through
/// a join on admin_users; both have been corrected so the fromJson matches
/// what the service actually returns.
class LiveClass {
  final String id;
  final String? courseId;
  final String title;
  final String? description;
  final String instructorName;
  final String? instructorAvatarUrl;
  final DateTime scheduledAt;
  final int durationMinutes;

  /// The DB enum: `scheduled`, `live`, `ended`, `cancelled`.
  final String status;

  /// `in_app`, `zoom`, `google_meet`, `youtube`. Drives the join flow.
  final String platform;

  /// Where the student goes when they tap Join. For `in_app`, an HLS url the
  /// client can stream; for the other platforms, the external meeting link.
  final String? meetingUrl;

  /// A short-form recording URL for a class that has ended, when the admin
  /// has attached one. Prefer `rewatchContentId` for a proper lesson link.
  final String? recordingUrl;

  /// When the admin has uploaded the edited recording as a content item,
  /// this points at it so the detail screen can offer the course player
  /// instead of a bare URL.
  final String? rewatchContentId;

  /// `courses.thumbnail_url` from the join. Live classes have no thumbnail of
  /// their own.
  final String? thumbnailUrl;

  final DateTime createdAt;
  final DateTime updatedAt;

  const LiveClass({
    required this.id,
    this.courseId,
    required this.title,
    this.description,
    required this.instructorName,
    this.instructorAvatarUrl,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.status,
    required this.platform,
    this.meetingUrl,
    this.recordingUrl,
    this.rewatchContentId,
    this.thumbnailUrl,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isLive => status == 'live';
  bool get isScheduled => status == 'scheduled';

  /// Matches the DB's `ended` value. The old `isCompleted` read `'completed'`
  /// and so was always false against real rows -- the past-classes list
  /// stayed empty forever.
  bool get isEnded => status == 'ended';
  bool get isCancelled => status == 'cancelled';

  /// Alias kept for the one or two call sites that still read the old name.
  bool get isCompleted => isEnded;

  bool get isInApp => platform == 'in_app';

  bool get hasRecording =>
      (recordingUrl != null && recordingUrl!.isNotEmpty) ||
      (rewatchContentId != null && rewatchContentId!.isNotEmpty);

  bool get canJoin => isLive && meetingUrl != null && meetingUrl!.isNotEmpty;

  String get formattedDate =>
      DateFormat('EEE, d MMM yyyy').format(scheduledAt);

  String get formattedTime => DateFormat('h:mm a').format(scheduledAt);

  String get formattedDuration {
    final hours = durationMinutes ~/ 60;
    final mins = durationMinutes % 60;
    if (hours > 0 && mins > 0) return '${hours}h ${mins}m';
    if (hours > 0) return '${hours}h';
    return '${mins}m';
  }

  DateTime get endTime =>
      scheduledAt.add(Duration(minutes: durationMinutes));

  bool get isToday {
    final now = DateTime.now();
    return scheduledAt.year == now.year &&
        scheduledAt.month == now.month &&
        scheduledAt.day == now.day;
  }

  bool get isUpcoming =>
      scheduledAt.isAfter(DateTime.now()) && isScheduled;

  String get countdown {
    final diff = scheduledAt.difference(DateTime.now());
    if (diff.isNegative) return 'Started';
    if (diff.inDays > 0) return 'In ${diff.inDays}d';
    if (diff.inHours > 0) return 'In ${diff.inHours}h';
    if (diff.inMinutes > 0) return 'In ${diff.inMinutes}m';
    return 'Starting soon';
  }

  factory LiveClass.fromJson(Map<String, dynamic> json) {
    // Teachers come through a join on `admin_users`, which Supabase hands back
    // as either a map or a single-element list depending on how the select is
    // written. Flatten both shapes here so callers do not need to know.
    final rawTeacher = json['teacher'];
    final teacher = rawTeacher is Map
        ? Map<String, dynamic>.from(rawTeacher)
        : (rawTeacher is List && rawTeacher.isNotEmpty && rawTeacher.first is Map
            ? Map<String, dynamic>.from(rawTeacher.first as Map)
            : null);

    final rawCourse = json['course'];
    final course = rawCourse is Map
        ? Map<String, dynamic>.from(rawCourse)
        : (rawCourse is List && rawCourse.isNotEmpty && rawCourse.first is Map
            ? Map<String, dynamic>.from(rawCourse.first as Map)
            : null);

    return LiveClass(
      id: json['id'] as String,
      courseId: json['course_id'] as String?,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      instructorName:
          teacher?['full_name'] as String? ?? 'Dream Edge mentor',
      instructorAvatarUrl: teacher?['avatar_url'] as String?,
      scheduledAt: DateTime.parse(
        json['scheduled_at'] as String? ?? DateTime.now().toIso8601String(),
      ),
      durationMinutes: (json['duration_minutes'] as num?)?.toInt() ?? 60,
      status: json['status'] as String? ?? 'scheduled',
      platform: json['platform'] as String? ?? 'in_app',
      meetingUrl: json['meeting_url'] as String?,
      recordingUrl: json['recording_url'] as String?,
      rewatchContentId: json['rewatch_content_id'] as String?,
      thumbnailUrl: course?['thumbnail_url'] as String?,
      createdAt: DateTime.parse(
        json['created_at'] as String? ?? DateTime.now().toIso8601String(),
      ),
      updatedAt: DateTime.parse(
        json['updated_at'] as String? ?? DateTime.now().toIso8601String(),
      ),
    );
  }
}
