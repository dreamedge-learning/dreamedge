import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/services/rating_service.dart';

void main() {
  group('describeRatingError', () {
    test('passes through the messages the database words for students', () {
      const limited = 'You have changed your ratings a lot recently. '
          'Please try again in 12 minutes.';
      expect(describeRatingError('PT429', limited), limited);
      expect(
        describeRatingError(
          '42501',
          'Only the stars and the review of a rating can be changed.',
        ),
        'Only the stars and the review of a rating can be changed.',
      );
    });

    test('rewords a row-level security refusal', () {
      expect(
        describeRatingError(
          '42501',
          'new row violates row-level security policy for table "course_ratings"',
        ),
        'You can rate a course once you have finished a lesson in it.',
      );
    });

    test('explains a review that is too long', () {
      expect(
        describeRatingError('23514', 'violates check constraint'),
        'Please keep your review under 500 characters.',
      );
    });

    test('never shows a raw database error', () {
      expect(
        describeRatingError('XX000', 'internal error'),
        'Could not save your rating. Please try again.',
      );
      expect(
        describeRatingError(null, null),
        'Could not save your rating. Please try again.',
      );
    });
  });
}
