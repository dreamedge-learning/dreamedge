import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/content.dart';
import 'package:mobile/features/lessons/widgets/lesson_tile.dart';

void main() {
  group('LessonTile', () {
    // The tile now carries a download button, which reads providers, so the
    // tree needs a scope around it.
    Widget wrap(Widget child) => ProviderScope(
      child: MaterialApp(home: Scaffold(body: child)),
    );

    Content makeContent({
      bool isFree = false,
      String title = 'Introduction to Algebra',
      int durationMinutes = 45,
    }) {
      // The live column names. `is_paid` is the stored flag and `isFree` is
      // the getter over it, so a free lesson is one that is not paid.
      return Content.fromJson({
        'id': 'ct-001',
        'topic_id': 't-001',
        'type': 'video',
        'title': title,
        'duration_seconds': durationMinutes * 60,
        'weight': 1,
        'is_paid': !isFree,
        'status': 'published',
      });
    }

    testWidgets('renders lesson number in CircleAvatar', (tester) async {
      await tester.pumpWidget(
        wrap(LessonTile(content: makeContent(), index: 2, onTap: () {})),
      );

      expect(find.text('3'), findsOneWidget);
      expect(find.byType(CircleAvatar), findsOneWidget);
    });

    testWidgets('renders lesson title', (tester) async {
      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(title: 'Quadratic Equations'),
            index: 0,
            onTap: () {},
          ),
        ),
      );

      expect(find.text('Quadratic Equations'), findsOneWidget);
    });

    testWidgets('renders duration text', (tester) async {
      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(durationMinutes: 30),
            index: 0,
            onTap: () {},
          ),
        ),
      );

      expect(find.text('30 min'), findsOneWidget);
    });

    testWidgets('shows FREE badge when isFree is true', (tester) async {
      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(isFree: true),
            index: 0,
            onTap: () {},
          ),
        ),
      );

      expect(find.text('FREE'), findsOneWidget);
    });

    testWidgets('does not show FREE badge when isFree is false', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(isFree: false),
            index: 0,
            onTap: () {},
          ),
        ),
      );

      expect(find.text('FREE'), findsNothing);
    });

    testWidgets('shows play icon for free lessons', (tester) async {
      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(isFree: true),
            index: 0,
            onTap: () {},
          ),
        ),
      );

      expect(find.byIcon(Icons.play_circle_fill_rounded), findsOneWidget);
    });

    testWidgets('shows lock icon for paid lessons', (tester) async {
      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(isFree: false),
            index: 0,
            onTap: () {},
          ),
        ),
      );

      expect(find.byIcon(Icons.lock_outline_rounded), findsOneWidget);
    });

    testWidgets('onTap callback fires', (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        wrap(
          LessonTile(
            content: makeContent(),
            index: 0,
            onTap: () => tapped = true,
          ),
        ),
      );

      await tester.tap(find.byType(InkWell));
      expect(tapped, true);
    });
  });
}
