import 'package:intl/intl.dart';

class CourseOrder {
  final String id;
  final String studentId;
  final String courseId;
  final double amount;
  final double discountAmount;
  final double finalAmount;
  final String paymentMethod;
  final String status;
  final String? razorpayOrderId;
  final String? razorpayPaymentId;
  final String? razorpaySignature;
  final String? invoiceUrl;
  final String? invoiceNumber;
  final String? referralCodeUsed;
  final String? remarks;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? courseName;
  final String? courseThumbnailUrl;

  const CourseOrder({
    required this.id,
    required this.studentId,
    required this.courseId,
    required this.amount,
    required this.discountAmount,
    required this.finalAmount,
    required this.paymentMethod,
    required this.status,
    this.razorpayOrderId,
    this.razorpayPaymentId,
    this.razorpaySignature,
    this.invoiceUrl,
    this.invoiceNumber,
    this.referralCodeUsed,
    this.remarks,
    required this.createdAt,
    required this.updatedAt,
    this.courseName,
    this.courseThumbnailUrl,
  });

  factory CourseOrder.fromJson(Map<String, dynamic> json) {
    final courseData = json['courses'] as Map<String, dynamic>?;

    return CourseOrder(
      id: json['id'] as String,
      studentId: json['student_id'] as String,
      courseId: json['course_id'] as String,
      amount: (json['amount'] as num).toDouble(),
      discountAmount: (json['discount_amount'] as num? ?? 0).toDouble(),
      finalAmount: (json['final_amount'] as num).toDouble(),
      paymentMethod: json['payment_method'] as String? ?? 'razorpay',
      status: json['status'] as String? ?? 'pending',
      razorpayOrderId: json['razorpay_order_id'] as String?,
      razorpayPaymentId: json['razorpay_payment_id'] as String?,
      razorpaySignature: json['razorpay_signature'] as String?,
      invoiceUrl: json['invoice_url'] as String?,
      invoiceNumber: json['invoice_number'] as String?,
      referralCodeUsed: json['referral_code_used'] as String?,
      remarks: json['remarks'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      courseName: courseData?['title'] as String?,
      courseThumbnailUrl: courseData?['thumbnail_url'] as String?,
    );
  }

  bool get isPending => status == 'pending';
  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isRefunded => status == 'refunded';

  String get formattedAmount {
    final formatter =
        NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
    return formatter.format(finalAmount);
  }

  String get formattedDate {
    return DateFormat('dd MMM yyyy, hh:mm a').format(createdAt.toLocal());
  }

  String get statusLabel {
    switch (status) {
      case 'completed':
        return 'Paid';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  }
}
