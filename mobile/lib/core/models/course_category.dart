/// Maps the live `course_categories` table:
/// id, name, slug, thumbnail_url, description, weight, is_visible, created_at.
class CourseCategory {
  final String id;
  final String name;
  final String slug;
  final String? description;
  final String? thumbnailUrl;
  final int weight;
  final bool isVisible;
  final DateTime? createdAt;

  const CourseCategory({
    required this.id,
    required this.name,
    required this.slug,
    this.description,
    this.thumbnailUrl,
    required this.weight,
    required this.isVisible,
    this.createdAt,
  });

  factory CourseCategory.fromJson(Map<String, dynamic> json) {
    return CourseCategory(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      description: json['description'] as String?,
      thumbnailUrl: json['thumbnail_url'] as String?,
      weight: (json['weight'] as num?)?.toInt() ?? 0,
      isVisible: json['is_visible'] as bool? ?? true,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'description': description,
      'thumbnail_url': thumbnailUrl,
      'weight': weight,
      'is_visible': isVisible,
      'created_at': createdAt?.toIso8601String(),
    };
  }
}
