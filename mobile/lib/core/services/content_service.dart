import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/content.dart';

/// Reads the content hierarchy: courses -> subjects -> topics -> content_items.
///
/// There is no `contents` table; everything here goes through `content_items`
/// and per-student state through `student_progress`.
class ContentService {
  final SupabaseClient _client;

  ContentService(this._client);

  static const String _table = 'content_items';

  /// Published content for a topic, in admin-defined order (`weight`).
  ///
  /// RLS returns free items to anyone and paid items only to students with an
  /// active enrolment in the owning course.
  Future<List<Content>> getContentsByTopic(String topicId) async {
    final data = await _client
        .from(_table)
        .select()
        .eq('topic_id', topicId)
        .eq('status', 'published')
        .order('weight', ascending: true);

    return (data as List)
        .map((e) => Content.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Content> getContentById(String id) async {
    final data = await _client.from(_table).select().eq('id', id).single();
    return Content.fromJson(data);
  }

  /// Free (`is_paid = false`) published videos, newest first.
  Future<List<Content>> getFreeContents({int limit = 10}) async {
    final data = await _client
        .from(_table)
        .select()
        .eq('is_paid', false)
        .eq('status', 'published')
        .eq('type', 'video')
        .order('created_at', ascending: false)
        .limit(limit);

    return (data as List)
        .map((e) => Content.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Every published content item under a subject, grouped by topic order.
  Future<List<Content>> getContentsBySubject(String subjectId) async {
    final topics = await _client
        .from('topics')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('is_visible', true)
        .order('weight', ascending: true);

    final topicIds = (topics as List)
        .map((e) => (e as Map)['id'] as String)
        .toList();
    if (topicIds.isEmpty) return [];

    final data = await _client
        .from(_table)
        .select()
        .inFilter('topic_id', topicIds)
        .eq('status', 'published')
        .order('weight', ascending: true);

    return (data as List)
        .map((e) => Content.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// This student's progress rows for the given content items.
  Future<Map<String, ContentProgress>> getProgressFor(
    String studentId,
    List<String> contentItemIds,
  ) async {
    if (contentItemIds.isEmpty) return {};

    final data = await _client
        .from('student_progress')
        .select()
        .eq('student_id', studentId)
        .inFilter('content_item_id', contentItemIds);

    final result = <String, ContentProgress>{};
    for (final row in data as List) {
      final progress = ContentProgress.fromJson(row as Map<String, dynamic>);
      result[progress.contentItemId] = progress;
    }
    return result;
  }

  /// Upserts this student's progress on one content item.
  ///
  /// `student_progress` is unique on (student_id, content_item_id) and students
  /// hold their own insert/update policy, so this stays a client-side write.
  Future<void> saveProgress({
    required String studentId,
    required String contentItemId,
    required double progressPercentage,
    required int lastPositionSeconds,
  }) async {
    final completed = progressPercentage >= 95;

    await _client.from('student_progress').upsert(
      {
        'student_id': studentId,
        'content_item_id': contentItemId,
        'status': completed ? 'completed' : 'in_progress',
        'progress_percentage': progressPercentage,
        'last_position_seconds': lastPositionSeconds,
        if (completed) 'completed_at': DateTime.now().toUtc().toIso8601String(),
      },
      onConflict: 'student_id,content_item_id',
    );
  }
}
