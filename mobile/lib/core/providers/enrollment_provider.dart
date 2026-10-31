import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/enrollment.dart';
import '../services/enrollment_service.dart';
import 'supabase_provider.dart';

final enrollmentServiceProvider = Provider<EnrollmentService>((ref) {
  return EnrollmentService(ref.watch(supabaseClientProvider));
});

/// `students.id` for the signed-in user.
///
/// Every student-scoped table (`enrollments`, `test_attempts`,
/// `student_progress`, `student_notifications`) keys on `students.id`, which is
/// not the auth user id — so this has to be resolved from `students.user_id`.
final currentStudentIdProvider = FutureProvider<String?>((ref) async {
  final session = ref.watch(currentSessionProvider);
  if (session == null) return null;

  final client = ref.watch(supabaseClientProvider);
  final row = await client
      .from('students')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle();

  return row?['id'] as String?;
});

final myEnrollmentsProvider = FutureProvider<List<Enrollment>>((ref) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  if (studentId == null) return [];
  return ref.watch(enrollmentServiceProvider).getMyEnrollments(studentId);
});

final courseEnrollmentProvider =
    FutureProvider.family<Enrollment?, String>((ref, courseId) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  if (studentId == null) return null;
  return ref
      .watch(enrollmentServiceProvider)
      .getEnrollment(studentId, courseId);
});
