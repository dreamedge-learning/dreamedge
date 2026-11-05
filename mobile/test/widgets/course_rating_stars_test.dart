import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/course_rating.dart';
import 'package:mobile/core/providers/course_rating_provider.dart';
import 'package:mobile/core/services/rating_service.dart';
import 'package:mobile/features/learning/widgets/course_rating_stars.dart';

/// Stands in for the database. Each call to [rate] waits on [next], so a test
/// can look at the optimistic paint before deciding how the write ends.
///
/// The completer is made inside the call, which runs in the test's fake-async
/// zone. One made in `setUp` belongs to the real zone, and its completion
/// would wait for a real event loop turn that `pumpAndSettle` never gives.
class _FakeRatingService implements RatingService {
  late Completer<MyCourseRating> next;
  final List<({int stars, String? review})> calls = [];

  @override
  Future<MyCourseRating> rate({
    required String courseId,
    required int stars,
    String? review,
  }) {
    calls.add((stars: stars, review: review));
    next = Completer<MyCourseRating>();
    return next.future;
  }

  @override
  Future<Map<String, MyCourseRating>> myRatings() async => const {};

  @override
  Future<ReviewPage> reviews(String courseId, {int offset = 0}) async =>
      ReviewPage.empty;
}

void main() {
  late _FakeRatingService service;

  setUp(() => service = _FakeRatingService());

  Widget host(MyCourseRating initial) {
    return ProviderScope(
      overrides: [ratingServiceProvider.overrideWithValue(service)],
      child: MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: CourseRatingStars(
              courseId: 'c1',
              courseTitle: 'Class 9 Maths',
              initial: initial,
            ),
          ),
        ),
      ),
    );
  }

  const unrated = MyCourseRating(courseId: 'c1', canRate: true);

  group('CourseRatingStars', () {
    testWidgets('offers five stars and says "Rate" before any rating',
        (tester) async {
      await tester.pumpWidget(host(unrated));

      expect(find.byType(IconButton), findsNWidgets(5));
      expect(find.text('Rate'), findsOneWidget);
      // No review to write until there are stars to hang it on.
      expect(find.text('Write a review'), findsNothing);
    });

    testWidgets('paints an existing rating and offers to edit the review',
        (tester) async {
      await tester.pumpWidget(host(const MyCourseRating(
        courseId: 'c1',
        canRate: true,
        stars: 4,
        review: 'Clear explanations',
      )));

      expect(find.text('4/5'), findsOneWidget);
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(4));
      expect(find.byIcon(Icons.star_outline_rounded), findsOneWidget);
      expect(find.text('Edit your review'), findsOneWidget);
    });

    testWidgets('each star carries a readable semantic label', (tester) async {
      await tester.pumpWidget(host(unrated));

      expect(find.bySemanticsLabel('1 star'), findsOneWidget);
      expect(find.bySemanticsLabel('2 stars'), findsOneWidget);
      expect(find.bySemanticsLabel('5 stars'), findsOneWidget);
    });

    testWidgets('a tap paints at once and keeps what the server saved',
        (tester) async {
      await tester.pumpWidget(host(unrated));

      await tester.tap(find.bySemanticsLabel('3 stars'));
      await tester.pump();

      // Painted before the write settles.
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(3));
      expect(service.calls.single.stars, 3);
      // Only the stars are sent; a review already written is left alone.
      expect(service.calls.single.review, isNull);

      service.next.complete(
        const MyCourseRating(courseId: 'c1', canRate: true, stars: 3),
      );
      await tester.pumpAndSettle();

      expect(find.text('3/5'), findsOneWidget);
      expect(find.text('Write a review'), findsOneWidget);
    });

    testWidgets('a refused write rolls back and says why', (tester) async {
      await tester.pumpWidget(host(const MyCourseRating(
        courseId: 'c1',
        canRate: true,
        stars: 2,
      )));

      await tester.tap(find.bySemanticsLabel('5 stars'));
      await tester.pump();
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(5));

      service.next.completeError(const RatingException(
        'You have changed your ratings a lot recently. '
        'Please try again in 5 minutes.',
      ));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.star_rounded), findsNWidgets(2));
      expect(find.textContaining('Please try again in 5 minutes'),
          findsOneWidget);
    });

    testWidgets('explains why a student who has not started cannot rate',
        (tester) async {
      await tester.pumpWidget(
        host(const MyCourseRating(courseId: 'c1', canRate: false)),
      );

      expect(find.text('Finish a lesson to rate this course.'), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
    });

    testWidgets('shows a lapsed enrolment its rating without the controls',
        (tester) async {
      await tester.pumpWidget(host(const MyCourseRating(
        courseId: 'c1',
        canRate: false,
        stars: 4,
      )));

      expect(find.text('Your rating'), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
    });

    testWidgets('tells the student when their review has been hidden',
        (tester) async {
      await tester.pumpWidget(host(const MyCourseRating(
        courseId: 'c1',
        canRate: true,
        stars: 1,
        review: 'rude words',
        isHidden: true,
        hiddenReason: 'Personal remarks are not allowed.',
      )));

      expect(
        find.textContaining('Personal remarks are not allowed.'),
        findsOneWidget,
      );
    });

    testWidgets('the review sheet sends the stars and the text together',
        (tester) async {
      await tester.pumpWidget(host(const MyCourseRating(
        courseId: 'c1',
        canRate: true,
        stars: 4,
      )));

      await tester.tap(find.text('Write a review'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Loved the examples');
      await tester.tap(find.text('Save review'));
      await tester.pump();

      expect(service.calls.single.stars, 4);
      expect(service.calls.single.review, 'Loved the examples');

      service.next.complete(const MyCourseRating(
        courseId: 'c1',
        canRate: true,
        stars: 4,
        review: 'Loved the examples',
      ));
      await tester.pumpAndSettle();

      expect(find.text('Save review'), findsNothing);
      expect(find.text('Edit your review'), findsOneWidget);
    });
  });
}
