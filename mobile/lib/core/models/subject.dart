/// Maps the live `subjects` table:
/// id, course_id, name, slug, color_code, weight, is_visible, created_at.
class Subject {
  final String id;
  final String courseId;
  final String name;
  final String slug;
  final String? colorCode;
  final int weight;
  final bool isVisible;
  final DateTime? createdAt;

  /// Count of child topics, when the query asked for `topics(count)`.
  final int topicCount;

  const Subject({
    required this.id,
    required this.courseId,
    required this.name,
    required this.slug,
    this.colorCode,
    required this.weight,
    required this.isVisible,
    this.createdAt,
    required this.topicCount,
  });

  factory Subject.fromJson(Map<String, dynamic> json) {
    return Subject(
      id: json['id'] as String,
      courseId: json['course_id'] as String,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      colorCode: json['color_code'] as String?,
      weight: (json['weight'] as num?)?.toInt() ?? 0,
      isVisible: json['is_visible'] as bool? ?? true,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      topicCount: _embeddedCount(json['topics']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'course_id': courseId,
      'name': name,
      'slug': slug,
      'color_code': colorCode,
      'weight': weight,
      'is_visible': isVisible,
      'created_at': createdAt?.toIso8601String(),
    };
  }
}

/// PostgREST returns an embedded aggregate as `[{"count": n}]`.
int embeddedCount(Object? raw) => _embeddedCount(raw);

int _embeddedCount(Object? raw) {
  if (raw is num) return raw.toInt();
  if (raw is Map) return (raw['count'] as num?)?.toInt() ?? 0;
  if (raw is List && raw.isNotEmpty) {
    final first = raw.first;
    if (first is Map) return (first['count'] as num?)?.toInt() ?? 0;
  }
  return 0;
}
