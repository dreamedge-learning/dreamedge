import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// One inbox entry for the signed-in student.
///
/// `notifications` is an admin broadcast table with no per-user column; the
/// per-student row lives in `student_notifications`. This model is built from
/// a `student_notifications` row with the broadcast embedded, so it carries
/// both ids: [id] for the broadcast and [studentNotificationId] for the
/// read-state row this student may update.
class AppNotification {
  final String id;
  final String studentNotificationId;
  final String title;
  final String body;
  final String? imageUrl;
  final String? route;
  final String type;
  final bool isRead;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.studentNotificationId,
    required this.title,
    required this.body,
    this.imageUrl,
    this.route,
    required this.type,
    required this.isRead,
    required this.createdAt,
  });

  /// Builds from a `student_notifications` row with `notifications(...)`
  /// embedded. Returns null when the broadcast payload is not readable.
  static AppNotification? fromStudentRow(Map<String, dynamic> row) {
    final raw = row['notifications'];
    Map<String, dynamic>? broadcast;
    if (raw is Map) {
      broadcast = Map<String, dynamic>.from(raw);
    } else if (raw is List && raw.isNotEmpty && raw.first is Map) {
      broadcast = Map<String, dynamic>.from(raw.first as Map);
    }
    if (broadcast == null) return null;

    final sentAt = broadcast['sent_at'] as String? ??
        row['created_at'] as String?;

    return AppNotification(
      id: broadcast['id'] as String? ?? row['notification_id'] as String? ?? '',
      studentNotificationId: row['id'] as String,
      title: broadcast['title'] as String? ?? '',
      body: broadcast['message'] as String? ?? '',
      imageUrl: broadcast['thumbnail_url'] as String?,
      route: broadcast['action_url'] as String?,
      type: _typeFor(broadcast),
      isRead: row['is_read'] as bool? ?? false,
      createdAt: sentAt != null
          ? (DateTime.tryParse(sentAt) ?? DateTime.now())
          : DateTime.now(),
    );
  }

  /// `notifications` carries no `type` column; the kind is inferred from what
  /// the broadcast points at.
  static String _typeFor(Map<String, dynamic> broadcast) {
    final explicit = broadcast['type'] as String?;
    if (explicit != null && explicit.isNotEmpty) return explicit;

    final action = (broadcast['action_url'] as String?) ?? '';
    if (action.startsWith('/live')) return 'live_class';
    if (action.startsWith('/doubts')) return 'doubt';
    if (broadcast['course_id'] != null) return 'course_update';
    return 'promo';
  }

  IconData get typeIcon {
    switch (type) {
      case 'live_class':
        return Icons.videocam_outlined;
      case 'enrollment':
        return Icons.school_outlined;
      case 'course_update':
        return Icons.update_outlined;
      case 'doubt':
        return Icons.question_answer_outlined;
      default:
        return Icons.campaign_outlined;
    }
  }

  Color get typeColor {
    switch (type) {
      case 'live_class':
        return const Color(0xFFEF4444);
      case 'enrollment':
        return const Color(0xFF22C55E);
      case 'course_update':
        return const Color(0xFF3B82F6);
      case 'doubt':
        return const Color(0xFF22C55E);
      default:
        return const Color(0xFFF26A21);
    }
  }

  String get formattedTime {
    final now = DateTime.now();
    final diff = now.difference(createdAt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('d MMM').format(createdAt);
  }
}
