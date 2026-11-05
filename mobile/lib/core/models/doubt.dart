import 'package:intl/intl.dart';

/// Where a doubt stands. Mirrors the `doubts_status_check` constraint.
enum DoubtStatus {
  open,
  answered,
  closed;

  /// An unknown value reads as open: a doubt the app cannot classify is
  /// better shown as waiting than hidden or shown as settled.
  static DoubtStatus fromString(String? raw) {
    switch (raw) {
      case 'answered':
        return DoubtStatus.answered;
      case 'closed':
        return DoubtStatus.closed;
      default:
        return DoubtStatus.open;
    }
  }

  /// Written for the student, matching the website's wording.
  String get label {
    switch (this) {
      case DoubtStatus.open:
        return 'Waiting for a teacher';
      case DoubtStatus.answered:
        return 'Answered';
      case DoubtStatus.closed:
        return 'Closed';
    }
  }
}

/// One entry in a doubt's conversation: the opening question or a reply.
class DoubtMessage {
  final String id;
  final bool fromTeacher;
  final String authorName;
  final String body;

  /// Object path in the private `doubt-images` bucket. The address to show
  /// it is signed when the message is drawn, never stored.
  final String? imagePath;
  final DateTime createdAt;

  const DoubtMessage({
    required this.id,
    required this.fromTeacher,
    required this.authorName,
    required this.body,
    this.imagePath,
    required this.createdAt,
  });

  /// From a `doubt_replies` row.
  factory DoubtMessage.fromReplyJson(Map<String, dynamic> json) {
    return DoubtMessage(
      id: json['id'] as String,
      fromTeacher: json['author_kind'] == 'admin',
      authorName: json['author_name'] as String? ?? '',
      body: json['body'] as String? ?? '',
      imagePath: _nonEmpty(json['image_path']),
      createdAt: _parseDate(json['created_at']),
    );
  }
}

/// A student's question on a lesson, with every reply to it.
///
/// Built from a `doubts` row with the lesson, course and replies embedded.
/// The embeds are optional: the student loses read access to a lesson whose
/// enrolment has lapsed, and the doubt must still render without its title.
class Doubt {
  final String id;
  final String contentItemId;
  final DoubtStatus status;
  final String body;
  final String? imagePath;
  final String? lessonTitle;
  final String? courseTitle;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// Oldest first.
  final List<DoubtMessage> replies;

  const Doubt({
    required this.id,
    required this.contentItemId,
    required this.status,
    required this.body,
    this.imagePath,
    this.lessonTitle,
    this.courseTitle,
    required this.createdAt,
    required this.updatedAt,
    this.replies = const [],
  });

  bool get isClosed => status == DoubtStatus.closed;

  /// The question and its replies as one conversation, oldest first.
  List<DoubtMessage> messagesFor(String studentName) => [
        DoubtMessage(
          id: id,
          fromTeacher: false,
          authorName: studentName,
          body: body,
          imagePath: imagePath,
          createdAt: createdAt,
        ),
        ...replies,
      ];

  factory Doubt.fromJson(Map<String, dynamic> json) {
    final rawReplies = json['doubt_replies'];
    final replies = <DoubtMessage>[];
    if (rawReplies is List) {
      for (final row in rawReplies) {
        if (row is Map) {
          replies.add(
            DoubtMessage.fromReplyJson(Map<String, dynamic>.from(row)),
          );
        }
      }
    }
    replies.sort((a, b) => a.createdAt.compareTo(b.createdAt));

    final createdAt = _parseDate(json['created_at']);

    return Doubt(
      id: json['id'] as String,
      contentItemId: json['content_item_id'] as String? ?? '',
      status: DoubtStatus.fromString(json['status'] as String?),
      body: json['body'] as String? ?? '',
      imagePath: _nonEmpty(json['image_path']),
      lessonTitle: _embedded(json['content_item'], 'title'),
      courseTitle: _embedded(json['course'], 'title'),
      createdAt: createdAt,
      updatedAt: json['updated_at'] != null
          ? _parseDate(json['updated_at'])
          : createdAt,
      replies: replies,
    );
  }
}

/// Short relative time for lists and bubbles: "Just now", "5m ago", "3d ago",
/// then a date. Takes `now` so it can be tested.
String formatDoubtTime(DateTime time, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(time);
  if (diff.inMinutes < 1) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return DateFormat('d MMM').format(time.toLocal());
}

DateTime _parseDate(Object? raw) {
  if (raw is String) {
    return DateTime.tryParse(raw) ?? DateTime.fromMillisecondsSinceEpoch(0);
  }
  return DateTime.fromMillisecondsSinceEpoch(0);
}

String? _nonEmpty(Object? raw) {
  if (raw is String && raw.isNotEmpty) return raw;
  return null;
}

/// PostgREST sends a to-one embed as an object, but older clients and some
/// relationship shapes give a one-element list. Both are read.
String? _embedded(Object? raw, String key) {
  Object? row = raw;
  if (row is List) row = row.isEmpty ? null : row.first;
  if (row is Map) return _nonEmpty(row[key]);
  return null;
}
