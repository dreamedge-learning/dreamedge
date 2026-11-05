import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/topic.dart';

void main() {
  group('Topic', () {
    final completeJson = {
      'id': 't-001',
      'subject_id': 'sub-001',
      'name': 'Linear Equations',
      'slug': 'linear-equations',
      'description': 'Solving linear equations in one variable',
      'weight': 1,
      'is_visible': true,
      'created_at': '2026-10-01T00:00:00Z',
      'content_items': [
        {'count': 5},
      ],
    };

    test('fromJson parses a complete row', () {
      final topic = Topic.fromJson(completeJson);

      expect(topic.id, 't-001');
      expect(topic.subjectId, 'sub-001');
      expect(topic.name, 'Linear Equations');
      expect(topic.slug, 'linear-equations');
      expect(topic.description, 'Solving linear equations in one variable');
      expect(topic.weight, 1);
      expect(topic.isVisible, true);
      expect(topic.contentCount, 5);
      expect(topic.createdAt, DateTime.utc(2026, 10, 1));
    });

    test('fromJson fills in the optional columns', () {
      final topic = Topic.fromJson({
        'id': 't-002',
        'subject_id': 'sub-001',
        'name': 'Quadratic Equations',
      });

      expect(topic.description, isNull);
      expect(topic.slug, '');
      expect(topic.weight, 0);
      expect(topic.isVisible, true);
      expect(topic.createdAt, isNull);
    });

    test('contentCount is 0 when the query did not ask for the aggregate', () {
      final topic = Topic.fromJson({
        'id': 't-003',
        'subject_id': 'sub-001',
        'name': 'Polynomials',
      });

      expect(topic.contentCount, 0);
    });

    test('toJson round-trips the columns the table owns', () {
      final json = Topic.fromJson(completeJson).toJson();

      expect(json['id'], 't-001');
      expect(json['subject_id'], 'sub-001');
      expect(json['name'], 'Linear Equations');
      expect(json['slug'], 'linear-equations');
      expect(json['description'], 'Solving linear equations in one variable');
      expect(json['weight'], 1);
      expect(json['is_visible'], true);
      expect(json.containsKey('content_items'), false);
    });
  });

  group('Topic (folder)', () {
    Map<String, dynamic> row({String? parent}) => {
          'id': 't-2',
          'subject_id': 's-1',
          'parent_topic_id': parent,
          'name': 'Concept videos',
          'slug': 'concept-videos',
          'weight': 2,
          'is_visible': true,
          'content_items': [
            {'count': 4},
          ],
        };

    test('a top-level folder has no parent', () {
      final topic = Topic.fromJson(row());
      expect(topic.parentTopicId, isNull);
      expect(topic.subjectId, 's-1');
    });

    test('a subfolder keeps its parent and its root subject', () {
      final topic = Topic.fromJson(row(parent: 't-1'));
      expect(topic.parentTopicId, 't-1');
      expect(topic.subjectId, 's-1');
      expect(topic.contentCount, 4);
    });

    test('the parent survives the offline cache round trip', () {
      // Cached folders are stored as toJson() and read back with fromJson();
      // losing the parent there would flatten the tree when offline.
      final cached = Topic.fromJson(Topic.fromJson(row(parent: 't-1')).toJson());
      expect(cached.parentTopicId, 't-1');
    });

    test('a row from before nesting existed still parses', () {
      final legacy = row()..remove('parent_topic_id');
      expect(Topic.fromJson(legacy).parentTopicId, isNull);
    });
  });
}
