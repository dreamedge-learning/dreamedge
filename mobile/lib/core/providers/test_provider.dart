import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/test.dart';
import '../models/test_attempt.dart';
import '../models/test_question.dart';
import '../services/test_service.dart';
import 'enrollment_provider.dart';
import 'supabase_provider.dart';

final testServiceProvider = Provider<TestService>((ref) {
  return TestService(ref.watch(supabaseClientProvider));
});

/// All published tests available to the current student across their enrolled courses.
final testListProvider = FutureProvider<List<Test>>((ref) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  if (studentId == null) return [];
  return ref.watch(testServiceProvider).getTestsForStudent(studentId);
});

/// All of the current student's test attempts, newest first.
final myTestAttemptsProvider = FutureProvider<List<TestAttempt>>((ref) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  if (studentId == null) return [];
  return ref.watch(testServiceProvider).getAttemptsForStudent(studentId);
});

/// Attempts the current student has made on a given test (newest first).
final attemptsForTestProvider =
    FutureProvider.family<List<TestAttempt>, String>((ref, testId) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  if (studentId == null) return [];
  return ref.watch(testServiceProvider).getAttemptsForTest(studentId, testId);
});

final testByIdProvider = FutureProvider.family<Test, String>((ref, id) {
  return ref.watch(testServiceProvider).getTestById(id);
});

/// Questions with the answer key stripped, straight from `get_test_questions`.
final questionsForTestProvider =
    FutureProvider.family<List<TestQuestion>, String>((ref, testId) {
  return ref.watch(testServiceProvider).getQuestionsForTest(testId);
});

final attemptByIdProvider =
    FutureProvider.family<TestAttempt, String>((ref, id) {
  return ref.watch(testServiceProvider).getAttemptById(id);
});
