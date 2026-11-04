import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/learning/widgets/course_rating_stars.dart';

/// Widget-level test for the star control. Server round-trips are not
/// exercised here (the Supabase client is uninitialised in a test harness),
/// so this focuses on the parts a user actually interacts with: the painted
/// value, the per-star labels and the "Rate" / "n/5" indicator.
void main() {
  Widget host(Widget child) {
    return ProviderScope(
      child: MaterialApp(
        home: Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)),
      ),
    );
  }

  group('CourseRatingStars', () {
    testWidgets('renders five star buttons', (tester) async {
      await tester.pumpWidget(
        host(const CourseRatingStars(
          courseId: 'c1',
          courseTitle: 'Class 9 Maths',
          initialStars: null,
        )),
      );

      // Five IconButton wrappers, one per star.
      expect(find.byType(IconButton), findsNWidgets(5));
    });

    testWidgets('shows "Rate" when the student has not rated yet',
        (tester) async {
      await tester.pumpWidget(
        host(const CourseRatingStars(
          courseId: 'c1',
          courseTitle: 'Class 9 Maths',
          initialStars: null,
        )),
      );

      expect(find.text('Rate'), findsOneWidget);
      expect(find.text('3/5'), findsNothing);
    });

    testWidgets('paints the initial rating when one exists', (tester) async {
      await tester.pumpWidget(
        host(const CourseRatingStars(
          courseId: 'c1',
          courseTitle: 'Class 9 Maths',
          initialStars: 4,
        )),
      );

      // The caption switches from "Rate" to "4/5" when a rating is present.
      expect(find.text('4/5'), findsOneWidget);
      expect(find.text('Rate'), findsNothing);

      // Four filled stars, one outline.
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(4));
      expect(find.byIcon(Icons.star_outline_rounded), findsOneWidget);
    });

    testWidgets('each star carries a readable semantic label',
        (tester) async {
      await tester.pumpWidget(
        host(const CourseRatingStars(
          courseId: 'c1',
          courseTitle: 'Class 9 Maths',
          initialStars: null,
        )),
      );

      // The first star says "1 star" (singular); the rest say "n stars".
      expect(find.bySemanticsLabel('1 star'), findsOneWidget);
      expect(find.bySemanticsLabel('2 stars'), findsOneWidget);
      expect(find.bySemanticsLabel('5 stars'), findsOneWidget);
    });

    testWidgets('tapping a star paints up to that star optimistically',
        (tester) async {
      await tester.pumpWidget(
        host(const CourseRatingStars(
          courseId: 'c1',
          courseTitle: 'Class 9 Maths',
          initialStars: null,
        )),
      );

      // Tap the third star. We use the semantics label so the test does not
      // depend on the position of the IconButton in a Row that may reflow.
      await tester.tap(find.bySemanticsLabel('3 stars'));
      await tester.pump();

      // Three filled, two outline -- paint happens before the network call
      // settles, which is the whole point of optimistic UI.
      expect(find.byIcon(Icons.star_rounded), findsNWidgets(3));
      expect(find.byIcon(Icons.star_outline_rounded), findsNWidgets(2));
      expect(find.text('3/5'), findsOneWidget);
    });
  });
}
