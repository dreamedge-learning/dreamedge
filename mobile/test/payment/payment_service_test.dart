import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/order.dart';
import 'package:mobile/core/services/payment_service.dart';

class _ContractVerifier implements PaymentService {
  @override
  Future<Map<String, dynamic>> createRazorpayOrder({
    required String courseId,
  }) async =>
      {};

  @override
  Future<Map<String, dynamic>> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) async =>
      {};

  @override
  Future<bool> isEnrolled(String courseId) async => false;

  @override
  Future<List<CourseOrder>> getOrderHistory() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('PaymentService contract', () {
    test('can be implemented without direct DB write methods', () {
      final verifier = _ContractVerifier();
      expect(verifier, isA<PaymentService>());
      expect(() => (verifier as dynamic).completeOrder, throwsNoSuchMethodError);
      expect(() => (verifier as dynamic).failOrder, throwsNoSuchMethodError);
      expect(() => (verifier as dynamic).enrollUser, throwsNoSuchMethodError);
    });
  });

  group('CourseOrder model', () {
    test('fromJson parses all DB columns correctly', () {
      final json = <String, dynamic>{
        'id': '123e4567-e89b-12d3-a456-426614174000',
        'student_id': '223e4567-e89b-12d3-a456-426614174000',
        'course_id': '323e4567-e89b-12d3-a456-426614174000',
        'amount': 1499.00,
        'discount_amount': 500.00,
        'final_amount': 999.00,
        'payment_method': 'razorpay',
        'status': 'completed',
        'razorpay_order_id': 'order_test_123',
        'razorpay_payment_id': 'pay_test_456',
        'razorpay_signature': 'sig_test_789',
        'invoice_url': 'https://example.com/invoice.pdf',
        'invoice_number': 'DE-2026-0001',
        'referral_code_used': null,
        'remarks': null,
        'created_at': '2026-10-21T10:00:00Z',
        'updated_at': '2026-10-21T10:01:00Z',
        'courses': <String, dynamic>{
          'title': 'Maths Foundation',
          'thumbnail_url': 'https://example.com/thumb.jpg',
        },
      };

      final order = CourseOrder.fromJson(json);

      expect(order.id, '123e4567-e89b-12d3-a456-426614174000');
      expect(order.studentId, '223e4567-e89b-12d3-a456-426614174000');
      expect(order.courseId, '323e4567-e89b-12d3-a456-426614174000');
      expect(order.amount, 1499.0);
      expect(order.discountAmount, 500.0);
      expect(order.finalAmount, 999.0);
      expect(order.paymentMethod, 'razorpay');
      expect(order.status, 'completed');
      expect(order.isCompleted, isTrue);
      expect(order.razorpayOrderId, 'order_test_123');
      expect(order.razorpayPaymentId, 'pay_test_456');
      expect(order.invoiceUrl, 'https://example.com/invoice.pdf');
      expect(order.invoiceNumber, 'DE-2026-0001');
      expect(order.courseName, 'Maths Foundation');
      expect(order.courseThumbnailUrl, 'https://example.com/thumb.jpg');
      expect(order.formattedAmount, contains('999'));
      expect(order.statusLabel, 'Paid');
    });

    test('fromJson handles null optional fields', () {
      final json = <String, dynamic>{
        'id': 'abc',
        'student_id': 'def',
        'course_id': 'ghi',
        'amount': 500,
        'discount_amount': null,
        'final_amount': 500,
        'payment_method': null,
        'status': 'pending',
        'razorpay_order_id': null,
        'razorpay_payment_id': null,
        'razorpay_signature': null,
        'invoice_url': null,
        'invoice_number': null,
        'referral_code_used': null,
        'remarks': null,
        'created_at': '2026-10-21T10:00:00Z',
        'updated_at': '2026-10-21T10:01:00Z',
      };

      final order = CourseOrder.fromJson(json);

      expect(order.discountAmount, 0.0);
      expect(order.paymentMethod, 'razorpay');
      expect(order.status, 'pending');
      expect(order.isPending, isTrue);
      expect(order.courseName, isNull);
      expect(order.invoiceUrl, isNull);
    });

    test('status helpers work correctly', () {
      CourseOrder makeOrder(String status) => CourseOrder.fromJson({
            'id': 'x',
            'student_id': 'y',
            'course_id': 'z',
            'amount': 100,
            'final_amount': 100,
            'status': status,
            'created_at': '2026-10-21T10:00:00Z',
            'updated_at': '2026-10-21T10:00:00Z',
          });

      expect(makeOrder('pending').isPending, isTrue);
      expect(makeOrder('completed').isCompleted, isTrue);
      expect(makeOrder('failed').isFailed, isTrue);
      expect(makeOrder('refunded').isRefunded, isTrue);
      expect(makeOrder('completed').statusLabel, 'Paid');
      expect(makeOrder('failed').statusLabel, 'Failed');
    });
  });
}
