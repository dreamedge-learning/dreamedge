import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/course_rating.dart';
import '../services/rating_service.dart';
import 'supabase_provider.dart';

final ratingServiceProvider = Provider<RatingService>((ref) {
  return RatingService(ref.watch(supabaseClientProvider));
});

/// The student's own rating for every enrolled course, and whether each may
/// be rated yet, keyed by course id. One call for the whole My Learning list
/// beats a round trip per card, which would make the stars arrive long after
/// the thumbnails.
///
/// Watches the session so signing out or switching accounts never shows the
/// previous student's stars.
final myCourseRatingsProvider =
    FutureProvider<Map<String, MyCourseRating>>((ref) async {
  final session = ref.watch(currentSessionProvider);
  if (session == null) return const {};
  return ref.watch(ratingServiceProvider).myRatings();
});

/// The first page of a course's written reviews, for the course screen.
final courseReviewsProvider =
    FutureProvider.autoDispose.family<ReviewPage, String>((ref, courseId) {
  return ref.watch(ratingServiceProvider).reviews(courseId);
});
