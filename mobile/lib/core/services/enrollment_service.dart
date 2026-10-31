import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/enrollment.dart';

/// Thrown when an action needs a server endpoint that does not exist yet.
class MissingBackendEndpointException implements Exception {
  final String message;
  const MissingBackendEndpointException(this.message);

  @override
  String toString() => message;
}

class EnrollmentService {
  final SupabaseClient _client;

  EnrollmentService(this._client);

  /// `studentId` is `students.id`, not the auth user id.
  Future<List<Enrollment>> getMyEnrollments(String studentId) async {
    final data = await _client
        .from('enrollments')
        .select('*, courses(*)')
        .eq('student_id', studentId)
        .order('purchased_at', ascending: false);

    return (data as List)
        .map((row) => Enrollment.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<Enrollment?> getEnrollment(
    String studentId,
    String courseId,
  ) async {
    final data = await _client
        .from('enrollments')
        .select('*, courses(*)')
        .eq('student_id', studentId)
        .eq('course_id', courseId)
        .maybeSingle();

    if (data == null) return null;
    return Enrollment.fromJson(data);
  }

  /// Free enrolment is a server-side action.
  ///
  /// Row-level security gives students no INSERT policy on `enrollments`, and
  /// the access window comes from `courses.validity_days`, which the server
  /// owns — the device must never pick a `valid_until`. There is currently no
  /// endpoint for this: `supabase/functions` holds only
  /// `create-razorpay-order`, `verify-razorpay-payment` and
  /// `razorpay-webhook`, and the database exposes no free-enrolment RPC.
  ///
  /// TODO(backend): add an `enroll-free-course` Edge Function (or an
  /// `enroll_in_free_course(p_course_id uuid)` SECURITY DEFINER RPC) that
  /// verifies the course is published and priced at 0, derives `valid_until`
  /// from `courses.validity_days`, and inserts the enrolment. Then call it
  /// here instead of throwing.
  Future<Enrollment> enrollInCourse(String courseId) async {
    throw const MissingBackendEndpointException(
      'Free enrolment is not available yet: the server endpoint '
      '(enroll-free-course) has not been deployed. Enrolling from the device '
      'is blocked by row-level security.',
    );
  }
}
