import 'course.dart';

class Enrollment {
  final String id;
  final String studentId;
  final String courseId;
  /// Nullable: not every enrolment row carries a purchase timestamp.
  final DateTime? purchasedAt;
  final DateTime? validUntil;
  final String? paymentId;
  final String status;
  final DateTime? createdAt;
  final Course? course;

  Enrollment({
    required this.id,
    required this.studentId,
    required this.courseId,
    this.purchasedAt,
    this.validUntil,
    this.paymentId,
    required this.status,
    this.createdAt,
    this.course,
  });

  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
  bool get isExpired => status == 'expired';

  factory Enrollment.fromJson(Map<String, dynamic> json) {
    Course? course;
    if (json['courses'] is Map<String, dynamic>) {
      course = Course.fromJson(json['courses'] as Map<String, dynamic>);
    }

    return Enrollment(
      id: json['id'] as String,
      studentId: json['student_id'] as String,
      courseId: json['course_id'] as String,
      purchasedAt: json['purchased_at'] != null
          ? DateTime.tryParse(json['purchased_at'] as String)
          : null,
      validUntil: json['valid_until'] != null
          ? DateTime.parse(json['valid_until'] as String)
          : null,
      paymentId: json['payment_id'] as String?,
      status: json['status'] as String? ?? 'active',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      course: course,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'student_id': studentId,
      'course_id': courseId,
      'purchased_at': purchasedAt?.toIso8601String(),
      'valid_until': validUntil?.toIso8601String(),
      'payment_id': paymentId,
      'status': status,
    };
  }
}
