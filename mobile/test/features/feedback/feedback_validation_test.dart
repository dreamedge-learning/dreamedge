import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/feedback/feedback_category.dart';

void main() {
  group('validateFeedbackMessage', () {
    test('rejects null', () {
      expect(validateFeedbackMessage(null), isNotNull);
    });

    test('rejects a message shorter than the minimum', () {
      expect(validateFeedbackMessage('short'), contains('10 characters'));
    });

    test(
        'rejects a message made of whitespace that would otherwise look long enough',
        () {
      // The policy's own check is length-based on the trimmed value, so a
      // 50-space string is not a message.
      expect(validateFeedbackMessage('   ' * 20), isNotNull);
    });

    test('accepts a message exactly at the minimum', () {
      expect(validateFeedbackMessage('x' * feedbackMessageMin), isNull);
    });

    test('accepts a message exactly at the maximum', () {
      expect(validateFeedbackMessage('x' * feedbackMessageMax), isNull);
    });

    test('rejects a message past the maximum', () {
      expect(
        validateFeedbackMessage('x' * (feedbackMessageMax + 1)),
        contains('under $feedbackMessageMax'),
      );
    });

    test('mirrors the database bounds', () {
      // Constants of record for both sides of the fence. If this fails the
      // migration and this file have gone out of sync.
      expect(feedbackMessageMin, 10);
      expect(feedbackMessageMax, 2000);
    });
  });

  group('FeedbackCategory', () {
    test('every category has a stable storage key', () {
      final keys = FeedbackCategory.values.map((c) => c.key).toSet();
      expect(keys, {
        'content',
        'app_problem',
        'website_problem',
        'payment',
        'suggestion',
        'other',
      });
    });

    test('every category has a non-empty label', () {
      for (final c in FeedbackCategory.values) {
        expect(c.label, isNotEmpty);
      }
    });
  });
}
