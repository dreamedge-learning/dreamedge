class TestAttempt {
  final String id;
  final String studentId;
  final String testId;
  final Map<String, dynamic> answers;
  final double score;
  final double totalMarks;
  final double percentage;
  final int timeTakenSeconds;
  final int attemptNumber;
  final DateTime submittedAt;

  const TestAttempt({
    required this.id,
    required this.studentId,
    required this.testId,
    required this.answers,
    required this.score,
    required this.totalMarks,
    required this.percentage,
    required this.timeTakenSeconds,
    required this.attemptNumber,
    required this.submittedAt,
  });

  bool passedAt(double passPercentage) => percentage >= passPercentage;

  String get formattedTimeTaken {
    final mins = timeTakenSeconds ~/ 60;
    final secs = timeTakenSeconds % 60;
    if (mins == 0) return '${secs}s';
    return '${mins}m ${secs}s';
  }

  factory TestAttempt.fromJson(Map<String, dynamic> json) {
    final rawAnswers = json['answers'];
    final answersMap = <String, dynamic>{};
    if (rawAnswers is Map) {
      for (final entry in rawAnswers.entries) {
        answersMap[entry.key.toString()] = entry.value;
      }
    }
    return TestAttempt(
      id: json['id'] as String,
      studentId: json['student_id'] as String,
      testId: json['test_id'] as String,
      answers: answersMap,
      score: (json['score'] as num?)?.toDouble() ?? 0,
      totalMarks: (json['total_marks'] as num?)?.toDouble() ?? 0,
      percentage: (json['percentage'] as num?)?.toDouble() ?? 0,
      timeTakenSeconds: (json['time_taken_seconds'] as num?)?.toInt() ?? 0,
      attemptNumber: (json['attempt_number'] as num?)?.toInt() ?? 1,
      submittedAt: json['submitted_at'] != null
          ? (DateTime.tryParse(json['submitted_at'] as String) ??
              DateTime.now())
          : DateTime.now(),
    );
  }
}
