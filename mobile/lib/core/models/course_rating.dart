/// The signed-in student's own rating for one enrolled course, and whether
/// they may rate it yet.
///
/// `canRate` comes from the database, which applies the same rule when the
/// rating is written: an unexpired enrolment and at least one finished lesson.
class MyCourseRating {
  final String courseId;
  final bool canRate;
  final int? stars;
  final String? review;
  final bool isHidden;
  final String? hiddenReason;

  const MyCourseRating({
    required this.courseId,
    required this.canRate,
    this.stars,
    this.review,
    this.isHidden = false,
    this.hiddenReason,
  });

  /// One row of `my_course_ratings`, or the row `course_ratings` returns
  /// after a write (which has no `can_rate`, because a write that succeeded
  /// is proof of it).
  factory MyCourseRating.fromJson(
    Map<String, dynamic> json, {
    String? courseId,
  }) {
    final review = json['review'] as String?;
    return MyCourseRating(
      courseId: courseId ?? json['course_id'] as String? ?? '',
      canRate: json['can_rate'] as bool? ?? true,
      stars: (json['stars'] as num?)?.toInt(),
      review: review == null || review.trim().isEmpty ? null : review,
      isHidden: json['is_hidden'] as bool? ?? false,
      hiddenReason: json['hidden_reason'] as String?,
    );
  }

  MyCourseRating copyWith({int? stars}) {
    return MyCourseRating(
      courseId: courseId,
      canRate: canRate,
      stars: stars ?? this.stars,
      review: review,
      isHidden: isHidden,
      hiddenReason: hiddenReason,
    );
  }
}

/// One review as the course page shows it: a first name and last initial,
/// never anything that identifies or reaches the student.
class PublicReview {
  final String reviewerName;
  final int stars;
  final String review;
  final DateTime? reviewedAt;

  const PublicReview({
    required this.reviewerName,
    required this.stars,
    required this.review,
    this.reviewedAt,
  });

  factory PublicReview.fromJson(Map<String, dynamic> json) {
    return PublicReview(
      reviewerName: json['reviewer_name'] as String? ?? 'A student',
      stars: (json['stars'] as num?)?.toInt() ?? 0,
      review: json['review'] as String? ?? '',
      reviewedAt: json['reviewed_at'] != null
          ? DateTime.tryParse(json['reviewed_at'] as String)
          : null,
    );
  }
}

/// A page of a course's written reviews and how many there are in all.
class ReviewPage {
  final List<PublicReview> reviews;
  final int total;

  const ReviewPage({required this.reviews, required this.total});

  static const empty = ReviewPage(reviews: [], total: 0);

  factory ReviewPage.fromRows(List<dynamic> rows) {
    final reviews = <PublicReview>[];
    var total = 0;
    for (final row in rows) {
      if (row is! Map<String, dynamic>) continue;
      reviews.add(PublicReview.fromJson(row));
      total = (row['total_count'] as num?)?.toInt() ?? total;
    }
    return ReviewPage(reviews: reviews, total: total);
  }
}
