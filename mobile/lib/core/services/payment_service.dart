import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/order.dart';

class PaymentService {
  final SupabaseClient _supabase = Supabase.instance.client;

  Future<String> _currentStudentId() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');

    final row = await _supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

    return row['id'] as String;
  }

  Future<Map<String, dynamic>> createRazorpayOrder({
    required String courseId,
  }) async {
    final response = await _supabase.functions.invoke(
      'create-razorpay-order',
      body: {'course_id': courseId},
    );

    if (response.status != 200) {
      final body = response.data;
      final message = body is Map
          ? body['error'] ?? 'Order creation failed'
          : 'Order creation failed';
      throw Exception(message.toString());
    }

    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) async {
    final response = await _supabase.functions.invoke(
      'verify-razorpay-payment',
      body: {
        'order_id': orderId,
        'razorpay_order_id': razorpayOrderId,
        'razorpay_payment_id': razorpayPaymentId,
        'razorpay_signature': razorpaySignature,
      },
    );

    if (response.status != 200) {
      final body = response.data;
      final message = body is Map
          ? body['error'] ?? 'Verification failed'
          : 'Verification failed';
      throw Exception(message.toString());
    }

    return response.data as Map<String, dynamic>;
  }

  Future<bool> isEnrolled(String courseId) async {
    final studentId = await _currentStudentId();

    final response = await _supabase
        .from('enrollments')
        .select('id')
        .eq('student_id', studentId)
        .eq('course_id', courseId)
        .eq('status', 'active')
        .maybeSingle();

    return response != null;
  }

  Future<List<CourseOrder>> getOrderHistory() async {
    final studentId = await _currentStudentId();

    final response = await _supabase
        .from('orders')
        .select('*, courses(title, thumbnail_url)')
        .eq('student_id', studentId)
        .order('created_at', ascending: false);

    return (response as List)
        .map((row) => CourseOrder.fromJson(row as Map<String, dynamic>))
        .toList();
  }
}
