import '../models/course.dart';
import '../models/subject.dart';
import '../models/topic.dart';
import '../offline/connectivity_service.dart';
import '../offline/offline_store.dart';
import '../services/course_service.dart';

/// Courses, read cache-first.
///
/// Every method here follows the same shape: hand back what is already on the
/// device so something draws immediately, then go and ask the server and hand
/// back the fresher answer. A student opening the app on a train sees their
/// courses at once rather than a spinner that resolves into an error when the
/// tunnel ends.
///
/// The repository sits above [CourseService] rather than replacing it. The
/// service stays the network layer and knows nothing about caching, which
/// keeps one description of what the server looks like.
class CourseRepository {
  CourseRepository({
    required this.service,
    required this.store,
    required this.connectivity,
  });

  final CourseService service;
  final OfflineStore store;
  final ConnectivityService connectivity;

  /// Cache, then network.
  ///
  /// The stream emits once when there is something cached and once more when
  /// the server answers. Where the cache is empty it emits only the server's
  /// answer, so a first run still shows a loading state rather than an empty
  /// list that turns into content.
  Stream<List<Course>> watchCourses({
    String? categoryId,
    String? targetClass,
    String? searchQuery,
  }) async* {
    final filtered =
        categoryId != null ||
        targetClass != null ||
        (searchQuery != null && searchQuery.isNotEmpty);

    // A filter is a question only the server can answer: the cache holds whole
    // rows, not the result of a text search. Offline, the filter is applied to
    // what is cached, which is the honest best effort.
    final cached = await store.cachedCourses();
    final locally = filtered
        ? _applyFilter(cached, categoryId, targetClass, searchQuery)
        : cached;

    if (locally.isNotEmpty) yield locally;

    if (!connectivity.isOnline) {
      if (locally.isEmpty) yield const [];
      return;
    }

    try {
      final fresh = await service.getCourses(
        categoryId: categoryId,
        targetClass: targetClass,
        searchQuery: searchQuery,
      );
      await store.cacheCourses(fresh);
      yield fresh;
    } catch (error) {
      // Something cached is better than an error screen. With nothing cached
      // the caller does need to know.
      if (locally.isEmpty) rethrow;
    }
  }

  Stream<List<Course>> watchFeaturedCourses() async* {
    final cached = await store.cachedCourses();
    final featured = cached.where((course) => course.isFeatured).toList();

    if (featured.isNotEmpty) yield featured;

    if (!connectivity.isOnline) {
      if (featured.isEmpty) yield const [];
      return;
    }

    try {
      final fresh = await service.getFeaturedCourses();
      await store.cacheCourses(fresh);
      yield fresh;
    } catch (error) {
      if (featured.isEmpty) rethrow;
    }
  }

  /// One course, best available.
  ///
  /// A single value rather than a stream, because the detail screen and the
  /// checkout both want one answer they can act on, and a price that changes
  /// under a student halfway through buying would be worse than a stale one.
  Future<Course> course(String id) async {
    if (connectivity.isOnline) {
      try {
        final fresh = await service.getCourseById(id);
        await store.cacheCourses([fresh]);
        return fresh;
      } catch (error) {
        final cached = await store.cachedCourse(id);
        if (cached != null) return cached;
        rethrow;
      }
    }

    final cached = await store.cachedCourse(id);
    if (cached != null) return cached;
    throw StateError('This course has not been opened on this device yet.');
  }

  Stream<List<Subject>> watchSubjects(String courseId) async* {
    final cached = await store.cachedSubjects(courseId);
    if (cached.isNotEmpty) yield cached;

    if (!connectivity.isOnline) {
      if (cached.isEmpty) yield const [];
      return;
    }

    try {
      final fresh = await service.getSubjects(courseId);
      await store.cacheSubjects(courseId, fresh);
      yield fresh;
    } catch (error) {
      if (cached.isEmpty) rethrow;
    }
  }

  Stream<List<Topic>> watchTopics(String subjectId) async* {
    final cached = await store.cachedTopics(subjectId);
    if (cached.isNotEmpty) yield cached;

    if (!connectivity.isOnline) {
      if (cached.isEmpty) yield const [];
      return;
    }

    try {
      final fresh = await service.getTopics(subjectId);
      await store.cacheTopics(subjectId, fresh);
      yield fresh;
    } catch (error) {
      if (cached.isEmpty) rethrow;
    }
  }

  List<Course> _applyFilter(
    List<Course> courses,
    String? categoryId,
    String? targetClass,
    String? searchQuery,
  ) {
    final needle = searchQuery?.trim().toLowerCase();

    return courses.where((course) {
      if (categoryId != null && course.categoryId != categoryId) {
        return false;
      }
      if (targetClass != null && course.targetClass != targetClass) {
        return false;
      }
      if (needle != null && needle.isNotEmpty) {
        return course.title.toLowerCase().contains(needle);
      }
      return true;
    }).toList();
  }
}
