import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/test.dart';
import '../models/test_attempt.dart';
import '../models/test_question.dart';

/// Server-graded result of `submit_test_attempt`.
class TestSubmissionResult {
  final double score;
  final double totalMarks;
  final double percentage;
  final bool passed;
  final bool awaitingReview;
  final bool showResults;

  const TestSubmissionResult({
    required this.score,
    required this.totalMarks,
    required this.percentage,
    required this.passed,
    required this.awaitingReview,
    required this.showResults,
  });

  factory TestSubmissionResult.fromRpc(Map<String, dynamic> json) {
    return TestSubmissionResult(
      score: (json['score'] as num?)?.toDouble() ?? 0,
      totalMarks: (json['total_marks'] as num?)?.toDouble() ?? 0,
      percentage: (json['percentage'] as num?)?.toDouble() ?? 0,
      passed: json['passed'] as bool? ?? false,
      awaitingReview: json['awaiting_review'] as bool? ?? false,
      showResults: json['show_results'] as bool? ?? true,
    );
  }
}

/// What `start_test_attempt` hands back. The server anchors the clock here,
/// and the device uses `serverNow` to compute drift once at the top of the
/// attempt rather than trusting its own clock throughout.
class TestAttemptStart {
  final String attemptId;
  final DateTime startedAt;
  final DateTime expiresAt;
  final DateTime serverNow;
  final Map<String, dynamic> answers;
  final bool resumed;
  final int attemptNumber;

  const TestAttemptStart({
    required this.attemptId,
    required this.startedAt,
    required this.expiresAt,
    required this.serverNow,
    required this.answers,
    required this.resumed,
    required this.attemptNumber,
  });

  factory TestAttemptStart.fromRpc(Map<String, dynamic> json) {
    return TestAttemptStart(
      attemptId: json['attempt_id']?.toString() ?? '',
      startedAt: DateTime.parse(json['started_at'] as String),
      expiresAt: DateTime.parse(json['expires_at'] as String),
      serverNow: DateTime.parse(json['server_now'] as String),
      answers: json['answers'] is Map
          ? Map<String, dynamic>.from(json['answers'] as Map)
          : <String, dynamic>{},
      resumed: json['resumed'] as bool? ?? false,
      attemptNumber: (json['attempt_number'] as num?)?.toInt() ?? 1,
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

  /// Starts (or resumes) an attempt.
  ///
  /// The RPC is the gate: enrolment, publication window, max attempts and
  /// deadline all live inside it. A dangling in-progress attempt comes back
  /// with `resumed = true` so the student picks up where they left off.
  Future<TestAttemptStart> startAttempt(String testId) async {
    final data = await _client.rpc(
      'start_test_attempt',
      params: {'p_test_id': testId},
    );

    final row = _firstRow(data);
    if (row == null) {
      throw Exception('Could not start this test. Please try again.');
    }
    return TestAttemptStart.fromRpc(row);
  }

  /// Writes the student's answers so a reload picks up where they were.
  ///
  /// The RPC refuses writes past the deadline; the caller catches that case
  /// as the signal to submit automatically.
  Future<void> saveAnswers({
    required String attemptId,
    required Map<String, dynamic> answers,
  }) async {
    await _client.rpc(
      'save_test_answers',
      params: {
        'p_attempt_id': attemptId,
        'p_answers': answers,
      },
    );
  }

  /// Appends to `exam_events`. The server decides which kinds advance the
  /// violation counter.
  Future<int> logEvent({
    required String attemptId,
    required String kind,
    Map<String, dynamic>? meta,
  }) async {
    final data = await _client.rpc(
      'log_exam_event',
      params: {
        'p_attempt_id': attemptId,
        'p_kind': kind,
        'p_meta': meta,
      },
    );
    if (data is num) return data.toInt();
    return 0;
  }

  /// Submits for grading. `auto: true` tags the attempt as auto-submitted so
  /// a mentor can tell a timer-triggered submit from a student-chosen one.
  ///
  /// The device never computes a score and never inserts into
  /// `test_attempts` — `submit_test_attempt` grades and closes the row.
  Future<TestSubmissionResult> submitAttempt({
    required String attemptId,
    required bool auto,
  }) async {
    final data = await _client.rpc(
      'submit_test_attempt',
      params: {
        'p_attempt_id': attemptId,
        'p_auto': auto,
      },
    );

    final row = _firstRow(data);
    if (row == null) {
      throw Exception('Could not submit the test. Please try again.');
    }
    return TestSubmissionResult.fromRpc(row);
  }

  /// RPCs that return `setof` arrive as a list; extract the first element.
  Map<String, dynamic>? _firstRow(Object? data) {
    if (data is List && data.isNotEmpty) {
      final first = data.first;
      if (first is Map) return Map<String, dynamic>.from(first);
    }
    if (data is Map) return Map<String, dynamic>.from(data);
    return null;
  }
}
