import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/course.dart';
import '../models/course_category.dart';
import '../models/subject.dart';
import '../models/topic.dart';

/// Reads courses and the syllabus hierarchy.
///
/// Live column names: `courses.title` / `courses.class`,
/// `subjects.weight`, `topics.weight`, `course_categories.is_visible`
/// and `course_categories.weight`.
class CourseService {
  final SupabaseClient _client;

  CourseService(this._client);

  Future<List<Course>> getCourses({
    String? categoryId,
    String? targetClass,
    String? searchQuery,
    int limit = 20,
    int offset = 0,
  }) async {
    var query = _client.from('courses').select().eq('status', 'published');

    if (categoryId != null) query = query.eq('category_id', categoryId);
    if (targetClass != null) query = query.eq('class', targetClass);
    if (searchQuery != null && searchQuery.isNotEmpty) {
      query = query.ilike('title', '%$searchQuery%');
    }

    final data = await query
        .order('is_featured', ascending: false)
        .order('created_at', ascending: false)
        .range(offset, offset + limit - 1);
    return (data as List)
        .map((e) => Course.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Course>> getFeaturedCourses() async {
    final data = await _client
        .from('courses')
        .select()
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', ascending: false)
        .limit(6);
    return (data as List)
        .map((e) => Course.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Course> getCourseById(String id) async {
    final data =
        await _client.from('courses').select().eq('id', id).single();
    return Course.fromJson(data);
  }

  /// Visible subjects of a course, ordered by `weight`, with a topic count.
  Future<List<Subject>> getSubjects(String courseId) async {
    final data = await _client
        .from('subjects')
        .select('*, topics(count)')
        .eq('course_id', courseId)
        .eq('is_visible', true)
        .order('weight', ascending: true);
    return (data as List)
        .map((e) => Subject.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Visible topics of a subject, ordered by `weight`, with a content count.
  Future<List<Topic>> getTopics(String subjectId) async {
    final data = await _client
        .from('topics')
        .select('*, content_items(count)')
        .eq('subject_id', subjectId)
        .eq('is_visible', true)
        .order('weight', ascending: true);
    return (data as List)
        .map((e) => Topic.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CourseCategory>> getCategories() async {
    final data = await _client
        .from('course_categories')
        .select()
        .eq('is_visible', true)
        .order('weight', ascending: true);
    return (data as List)
        .map((e) => CourseCategory.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
