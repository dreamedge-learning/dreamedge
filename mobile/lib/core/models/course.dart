class Course {
  final String id;
  final String categoryId;
  final String title;
  final String? subtitle;
  final String? description;
  final String? thumbnailUrl;
  final String targetClass;
  final double price;
  final double? originalPrice;
  final String status;
  final bool isFeatured;
  final int enrollmentCount;
  final int totalLessons;
  final int durationMinutes;

  /// Server-owned access window for a purchase. Never computed on the device.
  final int validityDays;

  /// Students' average, one decimal, from visible ratings only. Null until
  /// somebody has rated the course. Written by the database, never here.
  final double? ratingAvg;
  final int ratingCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Course({
    required this.id,
    required this.categoryId,
    required this.title,
    this.subtitle,
    this.description,
    this.thumbnailUrl,
    required this.targetClass,
    required this.price,
    this.originalPrice,
    required this.status,
    required this.isFeatured,
    required this.enrollmentCount,
    required this.totalLessons,
    required this.durationMinutes,
    required this.validityDays,
    this.ratingAvg,
    this.ratingCount = 0,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get hasDiscount => originalPrice != null && originalPrice! > price;

  String get formattedPrice => '₹${price.toInt()}';

  String get formattedOriginalPrice =>
      originalPrice != null ? '₹${originalPrice!.toInt()}' : '';

  String get formattedDuration {
    final hours = durationMinutes ~/ 60;
    final mins = durationMinutes % 60;
    if (hours > 0 && mins > 0) return '${hours}h ${mins}m';
    if (hours > 0) return '${hours}h';
    return '${mins}m';
  }

  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      id: json['id'] as String,
      categoryId: json['category_id'] as String? ?? '',
      title: json['title'] as String? ?? json['name'] as String? ?? '',
      subtitle: json['subtitle'] as String?,
      description: json['description'] as String?,
      thumbnailUrl: json['thumbnail_url'] as String? ?? json['thumbnail'] as String?,
      targetClass: json['class'] as String? ?? json['target_class'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      originalPrice: (json['original_price'] as num?)?.toDouble(),
      status: json['status'] as String? ?? 'draft',
      isFeatured: json['is_featured'] as bool? ?? false,
      enrollmentCount: (json['student_count'] as num?)?.toInt() ?? (json['enrollment_count'] as num?)?.toInt() ?? 0,
      totalLessons: (json['total_lessons'] as num?)?.toInt() ?? 0,
      durationMinutes: (json['duration_minutes'] as num?)?.toInt() ??
          (((json['duration_hours'] as num?)?.toDouble() ?? 0) * 60).round(),
      validityDays: (json['validity_days'] as num?)?.toInt() ?? 365,
      // numeric(2,1) arrives as a number or, through some paths, a string.
      ratingAvg: switch (json['rating_avg']) {
        final num n => n.toDouble(),
        final String s => double.tryParse(s),
        _ => null,
      },
      ratingCount: (json['rating_count'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(
          json['created_at'] as String? ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(
          json['updated_at'] as String? ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'category_id': categoryId,
      'title': title,
      'subtitle': subtitle,
      'description': description,
      'thumbnail_url': thumbnailUrl,
      'class': targetClass,
      'price': price,
      'original_price': originalPrice,
      'status': status,
      'is_featured': isFeatured,
      'student_count': enrollmentCount,
      'total_lessons': totalLessons,
      'duration_minutes': durationMinutes,
      'validity_days': validityDays,
      'rating_avg': ratingAvg,
      'rating_count': ratingCount,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}
