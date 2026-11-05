import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/course_rating.dart';

/// Mirrors the database's `course_ratings_review_length`.
const int reviewMaxLength = 500;

/// Reviews per page on the course screen.
const int reviewsPageSize = 10;

/// A refusal worded for the student.
class RatingException implements Exception {
  final String message;

  const RatingException(this.message);

  @override
  String toString() => message;
}

/// Reads and writes course ratings as the signed-in student.
///
/// Everything here runs with the student's own token, so the database decides
/// what is allowed: who may rate which course, how often, and what they may
/// change. This class only shapes the requests and turns a refusal into a
/// sentence.
class RatingService {
  final SupabaseClient _client;

  RatingService(this._client);

  /// The student's rating for every active enrolment, keyed by course.
  Future<Map<String, MyCourseRating>> myRatings() async {
    if (_client.auth.currentUser == null) return const {};
    final rows = await _client.rpc('my_course_ratings') as List<dynamic>;
    final out = <String, MyCourseRating>{};
    for (final row in rows) {
      if (row is! Map<String, dynamic>) continue;
      final rating = MyCourseRating.fromJson(row);
      if (rating.courseId.isNotEmpty) out[rating.courseId] = rating;
    }
    return out;
  }

  /// Saves the student's stars for a course, and the review when [review] is
  /// given. Leaving [review] out keeps whatever review is already there; an
  /// empty string clears it.
  Future<MyCourseRating> rate({
    required String courseId,
    required int stars,
    String? review,
  }) async {
    final studentId = await _studentId();
    try {
      final row = await _client
          .from('course_ratings')
          .upsert(
            {
              // Overwritten from the session by the database; sent because
              // the upsert's conflict target needs it.
              'student_id': studentId,
              'course_id': courseId,
              'stars': stars,
              if (review != null) 'review': review.trim(),
            },
            onConflict: 'student_id,course_id',
          )
          .select('stars, review, is_hidden, hidden_reason')
          .single();
      return MyCourseRating.fromJson(row, courseId: courseId);
    } on PostgrestException catch (e) {
      throw RatingException(describeRatingError(e.code, e.message));
    }
  }

  /// One page of a course's public written reviews.
  Future<ReviewPage> reviews(String courseId, {int offset = 0}) async {
    final rows = await _client.rpc(
      'course_reviews',
      params: {
        'p_course_id': courseId,
        'p_limit': reviewsPageSize,
        'p_offset': offset,
      },
    ) as List<dynamic>;
    return ReviewPage.fromRows(rows);
  }

  Future<String> _studentId() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw const RatingException('Please sign in again to continue.');
    }

    final row = await _client
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

    final id = row?['id'] as String?;
    if (id == null) {
      throw const RatingException('Your student account could not be found.');
    }
    return id;
  }
}

/// Turns a refusal from `course_ratings` into something a student can act on.
///
/// The database words its own refusals for a person (the rate limit, a field
/// that cannot change), so those pass straight through. A row-level security
/// refusal has a message written for developers, and the only way a real
/// student meets one is rating a course they have not started or no longer
/// have.
String describeRatingError(String? code, String? message) {
  switch (code) {
    case 'PT429':
    case '22023':
    case 'P0002':
      return (message == null || message.isEmpty)
          ? 'Could not save your rating. Please try again.'
          : message;
    case '42501':
      if (message != null &&
          message.isNotEmpty &&
          !message.contains('row-level security')) {
        return message;
      }
      return 'You can rate a course once you have finished a lesson in it.';
    case '23514':
      return 'Please keep your review under $reviewMaxLength characters.';
    default:
      return 'Could not save your rating. Please try again.';
  }
}
