import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/app_notification.dart';

/// Reads the student inbox.
///
/// `notifications` is the admin broadcast table — it has no `user_id` and its
/// `is_read` flag is not per-student. Every read and write here goes through
/// `student_notifications` (id, student_id, notification_id, is_read, read_at,
/// created_at), which is the only one of the two a student may touch.
class NotificationInboxService {
  final SupabaseClient _client;
  NotificationInboxService(this._client);

  static const String _broadcastColumns =
      'id, title, message, thumbnail_url, action_url, course_id, target_type, '
      'sent_at';

  /// Resolves `students.id` for the signed-in auth user.
  Future<String?> _currentStudentId() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return null;

    final row = await _client
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

    return row?['id'] as String?;
  }

  Future<List<AppNotification>> getNotifications({int limit = 30}) async {
    final studentId = await _currentStudentId();
    if (studentId == null) return [];

    final data = await _client
        .from('student_notifications')
        .select(
          'id, notification_id, is_read, read_at, created_at, '
          'notifications($_broadcastColumns)',
        )
        .eq('student_id', studentId)
        .order('created_at', ascending: false)
        .limit(limit);

    final out = <AppNotification>[];
    for (final row in data as List) {
      final parsed =
          AppNotification.fromStudentRow(row as Map<String, dynamic>);
      // Rows whose broadcast payload is not readable are skipped rather than
      // rendered as blank tiles.
      if (parsed != null) out.add(parsed);
    }
    return out;
  }

  /// Marks one inbox row read. Takes `student_notifications.id`, not the
  /// broadcast id.
  Future<void> markAsRead(String studentNotificationId) async {
    await _client
        .from('student_notifications')
        .update({
          'is_read': true,
          'read_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', studentNotificationId);
  }

  Future<void> markAllAsRead() async {
    final studentId = await _currentStudentId();
    if (studentId == null) return;

    await _client
        .from('student_notifications')
        .update({
          'is_read': true,
          'read_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('student_id', studentId)
        .eq('is_read', false);
  }

  Future<int> getUnreadCount() async {
    final studentId = await _currentStudentId();
    if (studentId == null) return 0;

    final data = await _client
        .from('student_notifications')
        .select('id')
        .eq('student_id', studentId)
        .eq('is_read', false);

    return (data as List).length;
  }
}
