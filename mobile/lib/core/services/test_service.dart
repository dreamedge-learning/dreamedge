import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/test.dart';
import '../models/test_attempt.dart';
import '../models/test_question.dart';

/// Server-graded result of `submit_test_attempt`.
class TestSubmissionResult {
  final String attemptId;
  final int attemptNumber;
  final double score;
  final double totalMarks;
  final double percentage;
  final bool passed;

  const TestSubmissionResult({
    required this.attemptId,
    required this.attemptNumber,
    required this.score,
    required this.totalMarks,
    required this.percentage,
    required this.passed,
  });

  factory TestSubmissionResult.fromRpc(Map<String, dynamic> json) {
    return TestSubmissionResult(
      attemptId: json['attempt_id']?.toString() ?? '',
      attemptNumber: (json['attempt_number'] as num?)?.toInt() ?? 1,
      score: (json['score'] as num?)?.toDouble() ?? 0,
      totalMarks: (json['total_marks'] as num?)?.toDouble() ?? 0,
      percentage: (json['percentage'] as num?)?.toDouble() ?? 0,
      passed: json['passed'] as bool? ?? false,
    );
  }
}

class TestService {
  final SupabaseClient _client;

  TestService(this._client);

  /// Returns all published tests for the courses the student is enrolled in.
  Future<List<Test>> getTestsForStudent(String studentId) async {
    final enrollments = await _client
        .from('enrollments')
        .select('course_id')
        .eq('student_id', studentId)
        .eq('status', 'active');

    final courseIds = (enrollments as List)
        .map((e) => (e as Map)['course_id'] as String)
        .toList();
    if (courseIds.isEmpty) return [];

    final data = await _client
        .from('tests')
        .select()
        .inFilter('course_id', courseIds)
        .eq('status', 'published')
        .order('start_time', ascending: true);

    return (data as List)
        .map((row) => Test.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<List<Test>> getTestsForCourse(String courseId) async {
    final data = await _client
        .from('tests')
        .select()
        .eq('course_id', courseId)
        .eq('status', 'published')
        .order('start_time', ascending: true);

    return (data as List)
        .map((row) => Test.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<Test> getTestById(String id) async {
    final data = await _client.from('tests').select().eq('id', id).single();
    return Test.fromJson(data);
  }

  /// Questions for a test, with the answer key stripped server-side.
  ///
  /// Students have no read access to `questions` — that table holds the answer
  /// key — so this goes through `get_test_questions(p_test_id)`.
  Future<List<TestQuestion>> getQuestionsForTest(String testId) async {
    final data = await _client.rpc(
      'get_test_questions',
      params: {'p_test_id': testId},
    );

    if (data is! List) return [];

    final questions = data
        .whereType<Map>()
        .map((row) => TestQuestion.fromRpc(
              Map<String, dynamic>.from(row),
              testId: testId,
            ))
        .toList();

    questions.sort((a, b) => a.weight.compareTo(b.weight));
    return questions;
  }

  Future<List<TestAttempt>> getAttemptsForStudent(String studentId) async {
    final data = await _client
        .from('test_attempts')
        .select()
        .eq('student_id', studentId)
        .order('submitted_at', ascending: false);

    return (data as List)
        .map((row) => TestAttempt.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<List<TestAttempt>> getAttemptsForTest(
    String studentId,
    String testId,
  ) async {
    final data = await _client
        .from('test_attempts')
        .select()
        .eq('student_id', studentId)
        .eq('test_id', testId)
        .order('attempt_number', ascending: false);

    return (data as List)
        .map((row) => TestAttempt.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<TestAttempt> getAttemptById(String attemptId) async {
    final data = await _client
        .from('test_attempts')
        .select()
        .eq('id', attemptId)
        .single();
    return TestAttempt.fromJson(data);
  }

  /// Submits answers for server-side grading.
  ///
  /// The device never computes a score and never inserts into
  /// `test_attempts` — `submit_test_attempt` grades, records the attempt and
  /// enforces the attempt limit.
  ///
  /// `answers` is keyed by question id. The value is an option id for
  /// mcq_single, a list of option ids for mcq_multiple, 'true'/'false' for
  /// true_false, free text for short_answer/subjective, or a list of
  /// `{'left': ..., 'right': ...}` maps for match_pair.
  Future<TestSubmissionResult> submitAttempt({
    required String testId,
    required Map<String, dynamic> answers,
    required DateTime startedAt,
  }) async {
    final data = await _client.rpc(
      'submit_test_attempt',
      params: {
        'p_test_id': testId,
        'p_answers': answers,
        'p_started_at': startedAt.toUtc().toIso8601String(),
      },
    );

    if (data is! Map) {
      throw Exception('Could not submit the test. Please try again.');
    }

    final result = Map<String, dynamic>.from(data);
    if (result['ok'] != true) {
      final message = result['error']?.toString();
      throw Exception(message == null || message.isEmpty
          ? 'Could not submit the test. Please try again.'
          : message);
    }

    return TestSubmissionResult.fromRpc(result);
  }
}
