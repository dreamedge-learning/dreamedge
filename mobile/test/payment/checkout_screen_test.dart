import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:mobile/core/models/course.dart';
import 'package:mobile/core/models/order.dart';
import 'package:mobile/core/providers/course_provider.dart';
import 'package:mobile/core/providers/payment_provider.dart';
import 'package:mobile/core/services/payment_service.dart';
import 'package:mobile/features/payments/checkout_screen.dart';

class _FakePaymentService implements PaymentService {
  bool createOrderCalled = false;
  bool verifyPaymentCalled = false;

  @override
  Future<Map<String, dynamic>> createRazorpayOrder({
    required String courseId,
  }) async {
    createOrderCalled = true;
    return {
      'order_id': 'test-order-id',
      'razorpay_order_id': 'order_test_123',
      'amount': 999.0,
      'currency': 'INR',
      'key_id': 'rzp_test_xxx',
      'prefill': {
        'name': 'Test User',
        'email': 'test@example.com',
        'contact': '9999999999',
      },
    };
  }

  @override
  Future<Map<String, dynamic>> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) async {
    verifyPaymentCalled = true;
    return {'enrolled': true, 'order_id': orderId};
  }

  @override
  Future<bool> isEnrolled(String courseId) async => false;

  @override
  Future<List<CourseOrder>> getOrderHistory() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  late _FakePaymentService fakeService;

  setUp(() {
    fakeService = _FakePaymentService();
  });

  Widget buildTestWidget() {
    return ProviderScope(
      overrides: [
        paymentServiceProvider.overrideWithValue(fakeService),
        courseDetailProvider('test-course-id').overrideWith((ref) async {
          return Course(
            id: 'test-course-id',
            categoryId: 'cat-1',
            title: 'Maths Foundation',
            targetClass: '8',
            price: 999,
            originalPrice: 1499,
            status: 'published',
            isFeatured: false,
            enrollmentCount: 150,
            totalLessons: 24,
            durationMinutes: 720,
            validityDays: 365,
            createdAt: DateTime(2026, 10, 1),
            updatedAt: DateTime(2026, 10, 1),
          );
        }),
      ],
      child: const MaterialApp(
        home: CheckoutScreen(courseId: 'test-course-id'),
      ),
    );
  }

  testWidgets('displays course price on pay button', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Pay ₹999'), findsOneWidget);
  });

  testWidgets('pay button is enabled when not processing', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    final payButton = find.widgetWithText(ElevatedButton, 'Pay ₹999');
    expect(payButton, findsOneWidget);

    final button = tester.widget<ElevatedButton>(payButton);
    expect(button.onPressed, isNotNull);
  });

  testWidgets('shows order summary section', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Order Summary'), findsOneWidget);
    expect(find.text('Course Price'), findsOneWidget);
    expect(find.text('Discount'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
  });

  testWidgets('shows course name from provider, not from nav state',
      (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Maths Foundation'), findsOneWidget);
  });

  testWidgets('shows discount amount when course has discount',
      (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('-₹500'), findsOneWidget);
  });
}
