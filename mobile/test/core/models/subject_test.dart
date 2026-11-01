import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/subject.dart';

void main() {
  group('Subject', () {
    // Shaped like a real PostgREST row: the live `subjects` table plus the
    // embedded `topics(count)` aggregate the course screen asks for.
    final completeJson = {
      'id': 'sub-001',
      'course_id': 'c-001',
      'name': 'Algebra',
      'slug': 'algebra',
      'color_code': '#6366f1',
      'weight': 1,
      'is_visible': true,
      'created_at': '2026-10-01T00:00:00Z',
      'topics': [
        {'count': 8},
      ],
    };

    test('fromJson parses a complete row', () {
      final subject = Subject.fromJson(completeJson);

      expect(subject.id, 'sub-001');
      expect(subject.courseId, 'c-001');
      expect(subject.name, 'Algebra');
      expect(subject.slug, 'algebra');
      expect(subject.colorCode, '#6366f1');
      expect(subject.weight, 1);
      expect(subject.isVisible, true);
      expect(subject.topicCount, 8);
      expect(subject.createdAt, DateTime.utc(2026, 10, 1));
    });

    test('fromJson fills in the optional columns', () {
      final subject = Subject.fromJson({
        'id': 'sub-002',
        'course_id': 'c-001',
        'name': 'Geometry',
      });

      expect(subject.slug, '');
      expect(subject.colorCode, isNull);
      expect(subject.createdAt, isNull);
      expect(subject.weight, 0);
      // Visible unless the row says otherwise: a subject with no flag set is
      // one nobody has hidden.
      expect(subject.isVisible, true);
    });

    test('topicCount is 0 when the query did not ask for the aggregate', () {
      final subject = Subject.fromJson({
        'id': 'sub-003',
        'course_id': 'c-001',
        'name': 'Trigonometry',
      });

      expect(subject.topicCount, 0);
    });

    test('embeddedCount reads every shape PostgREST returns', () {
      expect(embeddedCount(null), 0);
      expect(embeddedCount(7), 7);
      expect(
        embeddedCount({'count': 4}),
        4,
      );
      expect(
        embeddedCount([
          {'count': 3},
        ]),
        3,
      );
      expect(embeddedCount(const <Object>[]), 0);
    });

    test('toJson round-trips the columns the table owns', () {
      final json = Subject.fromJson(completeJson).toJson();

      expect(json['id'], 'sub-001');
      expect(json['course_id'], 'c-001');
      expect(json['name'], 'Algebra');
      expect(json['slug'], 'algebra');
      expect(json['color_code'], '#6366f1');
      expect(json['weight'], 1);
      expect(json['is_visible'], true);
      // The count is an aggregate of another table, not a column here, so it
      // must not be written back.
      expect(json.containsKey('topics'), false);
    });
  });
}
