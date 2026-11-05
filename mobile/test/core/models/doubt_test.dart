import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/doubt.dart';

void main() {
  group('DoubtStatus', () {
    test('maps every value of doubts_status_check', () {
      expect(DoubtStatus.fromString('open'), DoubtStatus.open);
      expect(DoubtStatus.fromString('answered'), DoubtStatus.answered);
      expect(DoubtStatus.fromString('closed'), DoubtStatus.closed);
    });

    test('an unknown status reads as waiting, not as settled', () {
      expect(DoubtStatus.fromString('escalated'), DoubtStatus.open);
      expect(DoubtStatus.fromString(null), DoubtStatus.open);
    });
  });

  group('Doubt.fromJson', () {
    // Shaped like the row DoubtService selects: a doubt with the lesson and
    // course embedded under their aliases and two replies, out of order.
    final row = {
      'id': 'dbt-001',
      'content_item_id': 'ct-001',
      'status': 'answered',
      'body': 'Why is the LCM used here?',
      'image_path': 'user-1/abc.jpg',
      'created_at': '2026-11-05T09:00:00Z',
      'updated_at': '2026-11-05T11:00:00Z',
      'content_item': {'title': 'Adding Rational Numbers'},
      'course': {'title': 'Class 8 Maths'},
      'doubt_replies': [
        {
          'id': 'rep-002',
          'author_kind': 'student',
          'author_name': 'Asha',
          'body': 'Thank you!',
          'image_path': null,
          'created_at': '2026-11-05T11:00:00Z',
        },
        {
          'id': 'rep-001',
          'author_kind': 'admin',
          'author_name': 'Rahul Sir',
          'body': 'So both fractions share a denominator.',
          'image_path': 'staff/admin-1/def.webp',
          'created_at': '2026-11-05T10:00:00Z',
        },
      ],
    };

    test('parses the doubt and its embeds', () {
      final doubt = Doubt.fromJson(row);

      expect(doubt.id, 'dbt-001');
      expect(doubt.contentItemId, 'ct-001');
      expect(doubt.status, DoubtStatus.answered);
      expect(doubt.body, 'Why is the LCM used here?');
      expect(doubt.imagePath, 'user-1/abc.jpg');
      expect(doubt.lessonTitle, 'Adding Rational Numbers');
      expect(doubt.courseTitle, 'Class 8 Maths');
      expect(doubt.createdAt, DateTime.utc(2026, 11, 5, 9));
      expect(doubt.updatedAt, DateTime.utc(2026, 11, 5, 11));
      expect(doubt.isClosed, isFalse);
    });

    test('orders replies oldest first and tells teacher from student', () {
      final replies = Doubt.fromJson(row).replies;

      expect(replies.map((r) => r.id), ['rep-001', 'rep-002']);
      expect(replies.first.fromTeacher, isTrue);
      expect(replies.first.authorName, 'Rahul Sir');
      expect(replies.first.imagePath, 'staff/admin-1/def.webp');
      expect(replies.last.fromTeacher, isFalse);
      expect(replies.last.imagePath, isNull);
    });

    test('puts the question first in the conversation', () {
      final messages = Doubt.fromJson(row).messagesFor('Asha');

      expect(messages, hasLength(3));
      expect(messages.first.id, 'dbt-001');
      expect(messages.first.fromTeacher, isFalse);
      expect(messages.first.authorName, 'Asha');
      expect(messages.first.imagePath, 'user-1/abc.jpg');
    });

    test('reads a to-one embed sent as a one-element list', () {
      final doubt = Doubt.fromJson({
        ...row,
        'content_item': [
          {'title': 'Listed Lesson'},
        ],
        'course': <Map<String, dynamic>>[],
      });

      expect(doubt.lessonTitle, 'Listed Lesson');
      expect(doubt.courseTitle, isNull);
    });

    test('survives a lesson the student can no longer read', () {
      // An expired enrolment hides the lesson row, so the embed is null --
      // the doubt itself must still render.
      final doubt = Doubt.fromJson({
        'id': 'dbt-002',
        'content_item_id': 'ct-009',
        'status': 'open',
        'body': 'A question from last term',
        'image_path': '',
        'created_at': '2026-06-01T08:00:00Z',
        'content_item': null,
        'course': null,
      });

      expect(doubt.lessonTitle, isNull);
      expect(doubt.courseTitle, isNull);
      expect(doubt.imagePath, isNull);
      expect(doubt.replies, isEmpty);
      // No updated_at: falls back to when it was asked.
      expect(doubt.updatedAt, doubt.createdAt);
    });
  });

  group('formatDoubtTime', () {
    final now = DateTime.utc(2026, 11, 5, 12);

    test('reads as relative time within a week', () {
      expect(formatDoubtTime(now, now: now), 'Just now');
      expect(
        formatDoubtTime(now.subtract(const Duration(minutes: 5)), now: now),
        '5m ago',
      );
      expect(
        formatDoubtTime(now.subtract(const Duration(hours: 3)), now: now),
        '3h ago',
      );
      expect(
        formatDoubtTime(now.subtract(const Duration(days: 2)), now: now),
        '2d ago',
      );
    });

    test('falls back to a date after a week', () {
      final old = DateTime.utc(2026, 10, 1, 12);
      expect(formatDoubtTime(old, now: now), contains('Oct'));
    });
  });
}
