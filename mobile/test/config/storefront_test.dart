import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/config/storefront.dart';
import 'package:mobile/core/models/course.dart';
import 'package:mobile/features/home/widgets/course_card.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  group('Storefront', () {
    test('an Android build sells', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      expect(Storefront.canSell, isTrue);
    });

    test('an iOS build does not', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      expect(Storefront.canSell, isFalse);
    });
  });

  group('CourseCard price', () {
    Course course({required num price}) => Course.fromJson({
          'id': 'c-1',
          'title': 'Class 8 Maths',
          'price': price,
          'original_price': price == 0 ? null : 999,
          'status': 'published',
        });

    Widget wrap(Widget child) => MaterialApp(
          home: Scaffold(body: SingleChildScrollView(child: child)),
        );

    testWidgets('shows the price where the app sells', (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      await tester.pumpWidget(wrap(CourseCard(course: course(price: 799), onTap: () {})));
      expect(find.text('₹799'), findsOneWidget);
      debugDefaultTargetPlatformOverride = null;
    });

    testWidgets('shows no price for a paid course on iOS', (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await tester.pumpWidget(wrap(CourseCard(course: course(price: 799), onTap: () {})));
      expect(find.textContaining('₹'), findsNothing);
      debugDefaultTargetPlatformOverride = null;
    });

    testWidgets('still labels a free course on iOS', (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await tester.pumpWidget(wrap(CourseCard(course: course(price: 0), onTap: () {})));
      expect(find.text('Free'), findsOneWidget);
      debugDefaultTargetPlatformOverride = null;
    });
  });
}
