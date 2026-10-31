class Test {
  final String id;
  /// Nullable live: `tests.course_id` is `on delete set null`.
  final String? courseId;
  final String? topicId;
  final String name;
  final String? description;
  final String? instructions;
  final int durationMinutes;
  final double totalMarks;
  final int maxAttempts;
  final bool shuffleQuestions;
  final bool shuffleOptions;
  final double passPercentage;
  final bool showResultsImmediately;
  final bool showSolutions;
  final bool certificateEnabled;
  final String status;
  final DateTime? startTime;
  final DateTime? endTime;

  const Test({
    required this.id,
    this.courseId,
    this.topicId,
    required this.name,
    this.description,
    this.instructions,
    required this.durationMinutes,
    required this.totalMarks,
    required this.maxAttempts,
    required this.shuffleQuestions,
    required this.shuffleOptions,
    required this.passPercentage,
    required this.showResultsImmediately,
    required this.showSolutions,
    required this.certificateEnabled,
    required this.status,
    this.startTime,
    this.endTime,
  });

  bool get isPublished => status == 'published';

  bool get isAvailableNow {
    final now = DateTime.now();
    if (startTime != null && now.isBefore(startTime!)) return false;
    if (endTime != null && now.isAfter(endTime!)) return false;
    return isPublished;
  }

  bool get isUpcoming =>
      startTime != null && DateTime.now().isBefore(startTime!);

  bool get isExpired =>
      endTime != null && DateTime.now().isAfter(endTime!);

  factory Test.fromJson(Map<String, dynamic> json) {
    return Test(
      id: json['id'] as String,
      courseId: json['course_id'] as String?,
      topicId: json['topic_id'] as String?,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      instructions: json['instructions'] as String?,
      durationMinutes: (json['duration_minutes'] as num?)?.toInt() ?? 30,
      totalMarks: (json['total_marks'] as num?)?.toDouble() ?? 0,
      maxAttempts: (json['max_attempts'] as num?)?.toInt() ?? 1,
      shuffleQuestions: json['shuffle_questions'] as bool? ?? false,
      shuffleOptions: json['shuffle_options'] as bool? ?? false,
      passPercentage: (json['pass_percentage'] as num?)?.toDouble() ?? 33,
      showResultsImmediately:
          json['show_results_immediately'] as bool? ?? true,
      showSolutions: json['show_solutions'] as bool? ?? true,
      certificateEnabled: json['certificate_enabled'] as bool? ?? false,
      status: json['status'] as String? ?? 'draft',
      startTime: json['start_time'] != null
          ? DateTime.parse(json['start_time'] as String)
          : null,
      endTime: json['end_time'] != null
          ? DateTime.parse(json['end_time'] as String)
          : null,
    );
  }
}
