enum QuestionType {
  mcqSingle,
  mcqMultiple,
  trueFalse,
  shortAnswer,
  matchPair,
  subjective,
  imageBased,
  unknown;

  static QuestionType fromString(String? raw) {
    switch (raw) {
      case 'mcq_single':
        return QuestionType.mcqSingle;
      case 'mcq_multiple':
        return QuestionType.mcqMultiple;
      case 'true_false':
        return QuestionType.trueFalse;
      case 'short_answer':
        return QuestionType.shortAnswer;
      case 'match_pair':
        return QuestionType.matchPair;
      case 'subjective':
        return QuestionType.subjective;
      case 'image_based':
        return QuestionType.imageBased;
      default:
        return QuestionType.unknown;
    }
  }

  String get label {
    switch (this) {
      case QuestionType.mcqSingle:
        return 'Single choice';
      case QuestionType.mcqMultiple:
        return 'Multiple choice';
      case QuestionType.trueFalse:
        return 'True / False';
      case QuestionType.shortAnswer:
        return 'Short answer';
      case QuestionType.matchPair:
        return 'Match the pairs';
      case QuestionType.subjective:
        return 'Subjective';
      case QuestionType.imageBased:
        return 'Image-based';
      case QuestionType.unknown:
        return 'Question';
    }
  }

  /// True when the server grades this type automatically. The device never
  /// grades anything, so this is presentation only.
  bool get isAutoGraded =>
      this == QuestionType.mcqSingle ||
      this == QuestionType.mcqMultiple ||
      this == QuestionType.trueFalse ||
      this == QuestionType.shortAnswer ||
      this == QuestionType.matchPair;
}

/// One selectable option, as returned by `get_test_questions`.
///
/// The RPC strips `is_correct`: the answer key never reaches the device.
class QuestionOption {
  final String id;
  final String text;

  const QuestionOption({required this.id, required this.text});

  factory QuestionOption.fromJson(Map<String, dynamic> json) {
    return QuestionOption(
      id: json['id']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
    );
  }
}

/// One side of a match-the-pairs question. The right-hand column arrives
/// pre-shuffled from the server.
class MatchPairOptions {
  final List<QuestionOption> left;
  final List<QuestionOption> right;

  const MatchPairOptions({required this.left, required this.right});

  bool get isEmpty => left.isEmpty || right.isEmpty;

  factory MatchPairOptions.fromJson(Map<String, dynamic> json) {
    return MatchPairOptions(
      left: _parseSide(json['left']),
      right: _parseSide(json['right']),
    );
  }

  static List<QuestionOption> _parseSide(Object? raw) {
    if (raw is! List) return const [];
    final out = <QuestionOption>[];
    for (final item in raw) {
      if (item is Map) {
        final map = Map<String, dynamic>.from(item);
        final text = map['text']?.toString() ?? map['value']?.toString() ?? '';
        out.add(QuestionOption(
          id: map['id']?.toString() ?? text,
          text: text,
        ));
      } else if (item != null) {
        final text = item.toString();
        out.add(QuestionOption(id: text, text: text));
      }
    }
    return out;
  }
}

/// A question as the student sees it.
///
/// Built from `get_test_questions(p_test_id)`, never from a direct select on
/// `questions` — students have no read access to that table, and it holds the
/// answer key.
class TestQuestion {
  final String id;
  final String testId;
  final QuestionType type;
  final String content;

  /// Options for mcq / true-false types. Empty for other types.
  final List<QuestionOption> options;

  /// Columns for a match_pair question. Null for other types.
  final MatchPairOptions? matchPairs;

  final double positiveMarks;
  final double negativeMarks;
  final String difficulty;
  final String? imageUrl;
  final String? hint;
  final int weight;

  const TestQuestion({
    required this.id,
    required this.testId,
    required this.type,
    required this.content,
    required this.options,
    this.matchPairs,
    required this.positiveMarks,
    required this.negativeMarks,
    required this.difficulty,
    this.imageUrl,
    this.hint,
    required this.weight,
  });

  bool get hasHint => hint != null && hint!.trim().isNotEmpty;

  /// `test_id` is not part of the RPC payload, so it is passed in by the
  /// service that made the call.
  factory TestQuestion.fromRpc(
    Map<String, dynamic> json, {
    required String testId,
  }) {
    final type = QuestionType.fromString(json['type'] as String?);
    final rawOptions = json['options'];

    final options = <QuestionOption>[];
    MatchPairOptions? matchPairs;

    if (type == QuestionType.matchPair && rawOptions is Map) {
      matchPairs = MatchPairOptions.fromJson(
        Map<String, dynamic>.from(rawOptions),
      );
    } else if (rawOptions is List) {
      for (final item in rawOptions) {
        if (item is Map) {
          options.add(QuestionOption.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }

    return TestQuestion(
      id: json['id'] as String,
      testId: testId,
      type: type,
      content: json['content'] as String? ?? '',
      options: options,
      matchPairs: matchPairs,
      positiveMarks: (json['positive_marks'] as num?)?.toDouble() ?? 1,
      negativeMarks: (json['negative_marks'] as num?)?.toDouble() ?? 0,
      difficulty: json['difficulty'] as String? ?? 'medium',
      imageUrl: json['image_url'] as String?,
      hint: json['hint'] as String?,
      weight: (json['weight'] as num?)?.toInt() ?? 0,
    );
  }
}
