import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/course.dart';
import '../models/course_category.dart';
import '../models/subject.dart';
import '../models/topic.dart';
import '../services/course_service.dart';
import 'offline_provider.dart';
import 'supabase_provider.dart';

final courseServiceProvider = Provider<CourseService>((ref) {
  final client = ref.watch(supabaseClientProvider);
  return CourseService(client);
});

final categoriesProvider = FutureProvider<List<CourseCategory>>((ref) {
  return ref.watch(courseServiceProvider).getCategories();
});

/// The course lists are streams, not futures.
///
/// A repository emits what is cached and then what the server says, so the
/// screen draws immediately and corrects itself a moment later. `AsyncValue`
/// behaves the same either way, so `when(...)` in the screens is unchanged.
final featuredCoursesProvider = StreamProvider<List<Course>>((ref) {
  return ref.watch(courseRepositoryProvider).watchFeaturedCourses();
});

final allCoursesProvider = StreamProvider<List<Course>>((ref) {
  return ref.watch(courseRepositoryProvider).watchCourses();
});

final coursesProvider = StreamProvider.family<List<Course>, CourseFilter>((
  ref,
  filter,
) {
  return ref
      .watch(courseRepositoryProvider)
      .watchCourses(
        categoryId: filter.categoryId,
        targetClass: filter.targetClass,
        searchQuery: filter.searchQuery,
      );
});

/// One course stays a future: the detail screen and the checkout each want a
/// single answer to act on, and a price that changed under a student halfway
/// through buying would be worse than a slightly stale one.
final courseDetailProvider = FutureProvider.family<Course, String>((ref, id) {
  return ref.watch(courseRepositoryProvider).course(id);
});

final subjectsProvider = StreamProvider.family<List<Subject>, String>((
  ref,
  courseId,
) {
  return ref.watch(courseRepositoryProvider).watchSubjects(courseId);
});

final topicsProvider = StreamProvider.family<List<Topic>, String>((
  ref,
  subjectId,
) {
  return ref.watch(courseRepositoryProvider).watchTopics(subjectId);
});

class CourseFilter {
  final String? categoryId;
  final String? targetClass;
  final String? searchQuery;

  const CourseFilter({this.categoryId, this.targetClass, this.searchQuery});

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CourseFilter &&
          categoryId == other.categoryId &&
          targetClass == other.targetClass &&
          searchQuery == other.searchQuery;

  @override
  int get hashCode => Object.hash(categoryId, targetClass, searchQuery);
}
