import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/live_class.dart';

/// Reads from `live_classes`. The teacher name and the course thumbnail come
/// through PostgREST embeds (`admin_users` + `courses`) rather than flat
/// columns — the old shape of this service selected `instructor_name` and
/// `thumbnail_url` directly, both of which do not exist on the table, so
/// every row came back without a teacher or a cover.
class LiveClassService {
  LiveClassService(this._client);

  final SupabaseClient _client;

  /// What we read on every live-class query. Keeping it one constant means
  /// the model's fromJson can rely on the same shape everywhere.
  static const String _select = '''
    id, course_id, title, description, scheduled_at, duration_minutes,
    platform, meeting_url, status, recording_url, rewatch_content_id,
    created_at, updated_at,
    course:courses(id, title, slug, thumbnail_url),
    teacher:admin_users(id, full_name, avatar_url)
  ''';

  Future<List<LiveClass>> getUpcomingClasses() async {
    final now = DateTime.now().toIso8601String();
    final data = await _client
        .from('live_classes')
        .select(_select)
        .gte('scheduled_at', now)
        .inFilter('status', ['scheduled', 'live'])
        .order('scheduled_at', ascending: true)
        .limit(20);

    return (data as List)
        .map((e) => LiveClass.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<LiveClass>> getTodayClasses() async {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day).toIso8601String();
    final endOfDay =
        DateTime(now.year, now.month, now.day, 23, 59, 59).toIso8601String();

    final data = await _client
        .from('live_classes')
        .select(_select)
        .gte('scheduled_at', startOfDay)
        .lte('scheduled_at', endOfDay)
        .order('scheduled_at', ascending: true);

    return (data as List)
        .map((e) => LiveClass.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Classes that have finished. The DB enum is `ended`, not `completed` --
  /// the previous shape of this filter always returned an empty list.
  Future<List<LiveClass>> getPastClasses({int limit = 20}) async {
    final data = await _client
        .from('live_classes')
        .select(_select)
        .eq('status', 'ended')
        .order('scheduled_at', ascending: false)
        .limit(limit);

    return (data as List)
        .map((e) => LiveClass.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LiveClass?> getLiveClassById(String id) async {
    final data = await _client
        .from('live_classes')
        .select(_select)
        .eq('id', id)
        .maybeSingle();

    if (data == null) return null;
    return LiveClass.fromJson(data);
  }

  Future<List<LiveClass>> getClassesByCourse(String courseId) async {
    final data = await _client
        .from('live_classes')
        .select(_select)
        .eq('course_id', courseId)
        .order('scheduled_at', ascending: false);

    return (data as List)
        .map((e) => LiveClass.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
