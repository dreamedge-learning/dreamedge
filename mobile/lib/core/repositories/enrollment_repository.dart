import '../models/enrollment.dart';
import '../offline/connectivity_service.dart';
import '../offline/offline_store.dart';
import '../services/enrollment_service.dart';

/// Enrolments, read cache-first.
///
/// These are cached for a reason beyond drawing My Learning quickly:
/// entitlement has to be answerable with the radio off. A downloaded lesson
/// that could not be told apart from one the student never bought would leave
/// the app either locking paid content it should play, or playing content it
/// should not.
class EnrollmentRepository {
  EnrollmentRepository({
    required this.service,
    required this.store,
    required this.connectivity,
  });

  final EnrollmentService service;
  final OfflineStore store;
  final ConnectivityService connectivity;

  Stream<List<Enrollment>> watchMine(String studentId) async* {
    final cached = await store.cachedEnrollments();
    if (cached.isNotEmpty) yield cached;

    if (!connectivity.isOnline) {
      if (cached.isEmpty) yield const [];
      return;
    }

    try {
      final fresh = await service.getMyEnrollments(studentId);
      await store.cacheEnrollments(fresh);
      yield fresh;
    } catch (error) {
      if (cached.isEmpty) rethrow;
    }
  }

  /// Refreshes the cache without anything watching.
  ///
  /// Called on reconnect alongside the licence sweep, so that the entitlement
  /// the app believes in offline is the one the server last confirmed rather
  /// than whatever it was the last time somebody opened My Learning.
  Future<void> refresh(String studentId) async {
    if (!connectivity.isOnline) return;
    try {
      final fresh = await service.getMyEnrollments(studentId);
      await store.cacheEnrollments(fresh);
    } catch (_) {
      // The cached copy stands until the next attempt.
    }
  }

  Future<Enrollment?> forCourse(String studentId, String courseId) async {
    if (connectivity.isOnline) {
      try {
        return await service.getEnrollment(studentId, courseId);
      } catch (_) {
        // Fall through to the cache.
      }
    }

    final cached = await store.cachedEnrollments();
    for (final enrollment in cached) {
      if (enrollment.courseId == courseId) return enrollment;
    }
    return null;
  }
}
