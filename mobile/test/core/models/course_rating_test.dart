import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/course.dart';
import 'package:mobile/core/models/course_rating.dart';

void main() {
  group('MyCourseRating.fromJson', () {
    test('reads a row of my_course_ratings', () {
      final rating = MyCourseRating.fromJson({
        'course_id': 'c1',
        'can_rate': true,
        'stars': 4,
        'review': 'Clear and patient',
        'is_hidden': false,
        'hidden_reason': null,
      });

      expect(rating.courseId, 'c1');
      expect(rating.canRate, isTrue);
      expect(rating.stars, 4);
      expect(rating.review, 'Clear and patient');
      expect(rating.isHidden, isFalse);
    });

    test('an enrolment not yet rated has no stars', () {
      final rating = MyCourseRating.fromJson({
        'course_id': 'c1',
        'can_rate': false,
        'stars': null,
        'review': null,
        'is_hidden': false,
      });

      expect(rating.canRate, isFalse);
      expect(rating.stars, isNull);
    });

    test('a row returned by a write takes the course id it was given', () {
      final rating = MyCourseRating.fromJson(
        {'stars': 5, 'review': '  ', 'is_hidden': true, 'hidden_reason': 'x'},
        courseId: 'c2',
      );

      expect(rating.courseId, 'c2');
      // A successful write is proof the student may rate.
      expect(rating.canRate, isTrue);
      expect(rating.review, isNull);
      expect(rating.isHidden, isTrue);
    });
  });

  group('ReviewPage.fromRows', () {
    test('reads the reviews and the total every row carries', () {
      final page = ReviewPage.fromRows([
        {
          'reviewer_name': 'Rahul S.',
          'stars': 5,
          'review': 'Best maths teacher',
          'reviewed_at': '2026-11-04T10:00:00Z',
          'total_count': 12,
        },
        {
          'reviewer_name': 'Priya',
          'stars': 3,
          'review': 'Good',
          'reviewed_at': null,
          'total_count': 12,
        },
      ]);

      expect(page.total, 12);
      expect(page.reviews, hasLength(2));
      expect(page.reviews.first.reviewerName, 'Rahul S.');
      expect(page.reviews.first.reviewedAt, isNotNull);
      expect(page.reviews.last.reviewedAt, isNull);
    });

    test('an empty page has nothing in all', () {
      final page = ReviewPage.fromRows(const []);
      expect(page.reviews, isEmpty);
      expect(page.total, 0);
    });
  });

  group('Course rating fields', () {
    Map<String, dynamic> base() => {
          'id': 'c1',
          'title': 'Class 8 Maths',
          'created_at': '2026-11-01T00:00:00Z',
          'updated_at': '2026-11-01T00:00:00Z',
        };

    test('an unrated course has no average', () {
      final course = Course.fromJson({
        ...base(),
        'rating_avg': null,
        'rating_count': 0,
      });
      expect(course.ratingAvg, isNull);
      expect(course.ratingCount, 0);
    });

    test('reads the average whether it arrives as a number or a string', () {
      expect(
        Course.fromJson({...base(), 'rating_avg': 4.3, 'rating_count': 7})
            .ratingAvg,
        4.3,
      );
      expect(
        Course.fromJson({...base(), 'rating_avg': '4.5', 'rating_count': 2})
            .ratingAvg,
        4.5,
      );
    });
  });
}
