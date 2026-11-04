import 'subject.dart' show embeddedCount;

/// Maps the live `topics` table -- a folder:
/// id, subject_id, parent_topic_id, name, slug, description, weight,
/// is_visible, created_at.
///
/// Folders nest. [parentTopicId] is null for a folder directly under its
/// subject; [subjectId] is always the root subject, at any depth.
class Topic {
  final String id;
  final String subjectId;
  final String? parentTopicId;
  final String name;
  final String slug;
  final String? description;
  final int weight;
  final bool isVisible;
  final DateTime? createdAt;

  /// Count of child content items, when the query asked for
  /// `content_items(count)`.
  final int contentCount;

  const Topic({
    required this.id,
    required this.subjectId,
    this.parentTopicId,
    required this.name,
    required this.slug,
    this.description,
    required this.weight,
    required this.isVisible,
    this.createdAt,
    required this.contentCount,
  });

  factory Topic.fromJson(Map<String, dynamic> json) {
    return Topic(
      id: json['id'] as String,
      subjectId: json['subject_id'] as String,
      parentTopicId: json['parent_topic_id'] as String?,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      description: json['description'] as String?,
      weight: (json['weight'] as num?)?.toInt() ?? 0,
      isVisible: json['is_visible'] as bool? ?? true,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      contentCount: embeddedCount(json['content_items']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'subject_id': subjectId,
      'parent_topic_id': parentTopicId,
      'name': name,
      'slug': slug,
      'description': description,
      'weight': weight,
      'is_visible': isVisible,
      'created_at': createdAt?.toIso8601String(),
    };
  }
}
