import 'subject.dart' show embeddedCount;

/// Maps the live `topics` table:
/// id, subject_id, name, slug, description, weight, is_visible, created_at.
class Topic {
  final String id;
  final String subjectId;
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
      'name': name,
      'slug': slug,
      'description': description,
      'weight': weight,
      'is_visible': isVisible,
      'created_at': createdAt?.toIso8601String(),
    };
  }
}
