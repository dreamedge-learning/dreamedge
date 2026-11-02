import 'dart:async';
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/test.dart';
import '../../core/models/test_question.dart';
import '../../core/providers/test_provider.dart';
import '../../core/services/test_service.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';

/// Live test-taking screen.
///
/// Mirrors the website runner by eye: one question on screen, a nav grid in a
/// drawer, a server-anchored countdown at the top, and autosave every 1.5s
/// after a change plus a 15s safety-net interval. Proctoring is strict -- the
/// app backgrounding, a system dialog taking focus, or a route pop while the
/// paper is live counts as a tab switch and the attempt is auto-submitted.
///
/// The server does all of the gating. This screen asks `start_test_attempt`
/// for an attempt id and a deadline, writes answers through `save_test_answers`,
/// pushes integrity events through `log_exam_event`, and asks
/// `submit_test_attempt` to grade; nothing about correctness is computed here.
class TestRunScreen extends ConsumerStatefulWidget {
  final String testId;

  const TestRunScreen({super.key, required this.testId});

  @override
  ConsumerState<TestRunScreen> createState() => _TestRunScreenState();
}

class _TestRunScreenState extends ConsumerState<TestRunScreen>
    with WidgetsBindingObserver {
  Test? _test;
  List<TestQuestion> _questions = const [];
  Map<String, dynamic> _answers = <String, dynamic>{};
  final Set<String> _flagged = <String>{};

  String? _attemptId;
  DateTime? _expiresAt;
  Duration _clockOffset = Duration.zero;

  int _currentIndex = 0;

  bool _loading = true;
  String? _loadError;
  bool _saving = false;
  DateTime? _savedAt;

  Timer? _tick;
  Timer? _debounce;
  Timer? _autosave;
  Duration _remaining = Duration.zero;

  bool _submitting = false;
  TestSubmissionResult? _result;
  bool _wasAutoSubmitted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tick?.cancel();
    _debounce?.cancel();
    _autosave?.cancel();
    super.dispose();
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  Future<void> _bootstrap() async {
    try {
      final service = ref.read(testServiceProvider);
      final test = await service.getTestById(widget.testId);
      final start = await service.startAttempt(widget.testId);
      final questions = await service.getQuestionsForTest(widget.testId);

      if (!mounted) return;
      setState(() {
        _test = test;
        _questions = questions;
        _attemptId = start.attemptId;
        _expiresAt = start.expiresAt;
        _clockOffset = start.serverNow.difference(DateTime.now().toUtc());
        _answers = Map<String, dynamic>.from(start.answers);
        _loading = false;
      });

      if (start.resumed) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Picked up where you left off.')),
          );
        }
      }

      _startTimer();
      _startAutosave();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = _translateError(err.toString());
      });
    }
  }

  // ---------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------

  void _startTimer() {
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) {
      final deadline = _expiresAt;
      if (deadline == null) return;
      final serverNow = DateTime.now().toUtc().add(_clockOffset);
      final remaining = deadline.difference(serverNow);
      if (!mounted) return;
      setState(() => _remaining = remaining.isNegative
          ? Duration.zero
          : remaining);
      if (remaining.isNegative || remaining.inMilliseconds <= 0) {
        _tick?.cancel();
        _autoSubmit(reason: 'timeout');
      }
    });
  }

  // ---------------------------------------------------------------------
  // Autosave
  // ---------------------------------------------------------------------

  void _startAutosave() {
    _autosave?.cancel();
    _autosave = Timer.periodic(const Duration(seconds: 15), (_) {
      unawaited(_persist());
    });
  }

  void _onAnswerChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 1500), () {
      unawaited(_persist());
    });
  }

  Future<void> _persist() async {
    final id = _attemptId;
    if (id == null) return;
    if (_submitting || _result != null) return;
    setState(() => _saving = true);
    try {
      await ref.read(testServiceProvider).saveAnswers(
            attemptId: id,
            answers: _answers,
          );
      if (!mounted) return;
      setState(() => _savedAt = DateTime.now());
    } catch (_) {
      // A refused save usually means the deadline has passed. The timer
      // will auto-submit on the next tick.
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ---------------------------------------------------------------------
  // Proctoring: app lifecycle -> auto-submit
  // ---------------------------------------------------------------------

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (_attemptId == null || _result != null) return;
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      _autoSubmit(reason: 'visibility_hidden');
    }
  }

  Future<void> _autoSubmit({required String reason}) async {
    if (_submitting || _result != null) return;
    try {
      final id = _attemptId;
      if (id != null) {
        await ref.read(testServiceProvider).logEvent(
              attemptId: id,
              kind: reason == 'timeout' ? 'reload' : 'visibility_hidden',
            );
      }
    } catch (_) {
      // The log entry is nice-to-have; the submit below is what matters.
    }
    await _submit(auto: true);
  }

  // ---------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------

  Future<void> _submit({required bool auto}) async {
    final id = _attemptId;
    if (id == null) return;
    if (_submitting || _result != null) return;

    setState(() {
      _submitting = true;
      _wasAutoSubmitted = auto;
    });

    try {
      // Save first so an auto-submit records whatever is on screen rather
      // than the last autosave.
      try {
        await ref.read(testServiceProvider).saveAnswers(
              attemptId: id,
              answers: _answers,
            );
      } catch (_) {
        // Ignored: the submit below runs regardless.
      }

      final result =
          await ref.read(testServiceProvider).submitAttempt(attemptId: id, auto: auto);
      if (!mounted) return;
      setState(() => _result = result);
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _loadError = _translateError(err.toString());
      });
    }
  }

  Future<bool> _confirmSubmit() async {
    final unanswered = _questions
        .where((q) => _isEmpty(_answers[q.id]))
        .length;
    final message = unanswered > 0
        ? 'You have $unanswered unanswered question${unanswered == 1 ? '' : 's'}. Submit anyway?'
        : 'Submit this attempt? You cannot change your answers after this.';
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Submit test'),
        content: Text(message),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: FilledButton.styleFrom(backgroundColor: AppColors.orange),
              child: const Text('Submit')),
        ],
      ),
    );
    return yes ?? false;
  }

  // ---------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    if (_result != null) {
      return _ResultsPanel(
        test: _test,
        result: _result!,
        auto: _wasAutoSubmitted,
        onBack: () {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go('/');
          }
        },
      );
    }

    if (_loading) {
      return const Scaffold(
        backgroundColor: AppColors.white,
        body: Center(child: CircularProgressIndicator(color: AppColors.orange)),
      );
    }

    if (_loadError != null) {
      return Scaffold(
        backgroundColor: AppColors.white,
        appBar: AppBar(
          backgroundColor: AppColors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded,
                color: AppColors.textPrimary),
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.warning_amber_rounded,
                    size: 48, color: AppColors.warning),
                const SizedBox(height: 12),
                Text(
                  _loadError!,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyMedium,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.pop(),
                  style:
                      FilledButton.styleFrom(backgroundColor: AppColors.orange),
                  child: const Text('Back to tests'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final question = _questions.isNotEmpty ? _questions[_currentIndex] : null;
    final answered =
        _answers.entries.where((e) => !_isEmpty(e.value)).length;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _confirmLeave();
      },
      child: Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          backgroundColor: AppColors.white,
          surfaceTintColor: Colors.transparent,
          elevation: 1,
          titleSpacing: 0,
          title: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _test?.name ?? 'Test',
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyLarge
                          .copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '$answered / ${_questions.length} answered'
                      '${_saving ? ' · Saving…' : _savedAt != null ? ' · Saved' : ''}',
                      style: AppTypography.caption,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _TimerChip(remaining: _remaining),
              const SizedBox(width: 8),
              Builder(
                builder: (context) => IconButton(
                  icon: const Icon(Icons.grid_view_rounded,
                      color: AppColors.textPrimary),
                  onPressed: () => Scaffold.of(context).openEndDrawer(),
                ),
              ),
            ],
          ),
          bottom: const PreferredSize(
            preferredSize: Size.fromHeight(26),
            child: _ProctoringBanner(),
          ),
        ),
        endDrawer: Drawer(
          backgroundColor: AppColors.white,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: _QuestionGrid(
                questions: _questions,
                answers: _answers,
                flagged: _flagged,
                current: _currentIndex,
                onTap: (i) {
                  setState(() => _currentIndex = i);
                  Navigator.of(context).pop();
                },
              ),
            ),
          ),
        ),
        body: question == null
            ? Center(
                child: Text('No questions in this test yet.',
                    style: AppTypography.bodyMedium),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: _QuestionCard(
                  index: _currentIndex,
                  total: _questions.length,
                  question: question,
                  answer: _answers[question.id],
                  flagged: _flagged.contains(question.id),
                  onFlag: () {
                    setState(() {
                      if (_flagged.contains(question.id)) {
                        _flagged.remove(question.id);
                      } else {
                        _flagged.add(question.id);
                      }
                    });
                  },
                  onAnswer: (value) {
                    setState(() => _answers[question.id] = value);
                    _onAnswerChanged();
                  },
                ),
              ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _currentIndex == 0
                        ? null
                        : () => setState(() => _currentIndex--),
                    icon: const Icon(Icons.chevron_left_rounded),
                    label: const Text('Previous'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _currentIndex == _questions.length - 1
                      ? FilledButton.icon(
                          onPressed: _submitting
                              ? null
                              : () async {
                                  if (await _confirmSubmit()) {
                                    await _submit(auto: false);
                                  }
                                },
                          icon: _submitting
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: AppColors.white),
                                )
                              : const Icon(Icons.check_rounded),
                          label: const Text('Submit'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.orange,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                        )
                      : FilledButton.icon(
                          onPressed: () =>
                              setState(() => _currentIndex++),
                          icon: const Icon(Icons.chevron_right_rounded),
                          label: const Text('Next'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.orange,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave the paper?'),
        content: const Text(
          'Leaving the attempt before submitting counts as a violation and '
          'auto-submits what you have so far.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Stay'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Leave & submit'),
          ),
        ],
      ),
    );
    if (leave == true) {
      await _autoSubmit(reason: 'visibility_hidden');
    }
  }

  bool _isEmpty(Object? value) {
    if (value == null) return true;
    if (value is String) return value.trim().isEmpty;
    if (value is List) return value.isEmpty;
    if (value is Map) {
      return value.values.every((v) =>
          v == null || (v is String && v.trim().isEmpty));
    }
    return false;
  }

  String _translateError(String raw) {
    final lower = raw.toLowerCase();
    if (lower.contains('not enrolled')) {
      return 'You are not enrolled in the course this test belongs to.';
    }
    if (lower.contains('attempt limit')) {
      return 'You have used every attempt for this test.';
    }
    if (lower.contains('test not available')) {
      return 'This test is not open at the moment.';
    }
    if (lower.contains('attempt expired')) {
      return 'This attempt has already expired.';
    }
    if (lower.contains('attempt already submitted')) {
      return 'This attempt has already been submitted.';
    }
    return 'Something went wrong. Please try again.';
  }
}

// =========================================================================
// Pieces
// =========================================================================

class _TimerChip extends StatelessWidget {
  final Duration remaining;
  const _TimerChip({required this.remaining});

  @override
  Widget build(BuildContext context) {
    final minutes = remaining.inMinutes;
    final seconds = remaining.inSeconds % 60;
    final danger = remaining.inSeconds <= 60;
    final color = danger ? AppColors.error : AppColors.success;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timer_outlined, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}',
            style: AppTypography.bodySmall.copyWith(
              fontWeight: FontWeight.w700,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProctoringBanner extends StatelessWidget {
  const _ProctoringBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      color: AppColors.warning.withValues(alpha: 0.08),
      child: Text(
        'Leaving this screen or switching apps will auto-submit your attempt.',
        textAlign: TextAlign.center,
        style: AppTypography.caption.copyWith(
          color: AppColors.warning,
          fontWeight: FontWeight.w600,
          fontSize: 11,
        ),
      ),
    );
  }
}

class _QuestionGrid extends StatelessWidget {
  final List<TestQuestion> questions;
  final Map<String, dynamic> answers;
  final Set<String> flagged;
  final int current;
  final ValueChanged<int> onTap;

  const _QuestionGrid({
    required this.questions,
    required this.answers,
    required this.flagged,
    required this.current,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    bool isEmpty(Object? v) {
      if (v == null) return true;
      if (v is String) return v.trim().isEmpty;
      if (v is List) return v.isEmpty;
      if (v is Map) return v.isEmpty;
      return false;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Questions',
          style: AppTypography.bodyLarge
              .copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: GridView.builder(
            gridDelegate:
                const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 5,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1,
            ),
            itemCount: questions.length,
            itemBuilder: (ctx, i) {
              final q = questions[i];
              final answered = !isEmpty(answers[q.id]);
              final isFlagged = flagged.contains(q.id);
              final isCurrent = i == current;

              Color bg;
              Color fg;
              Color border;
              if (isCurrent) {
                bg = AppColors.orange;
                fg = AppColors.white;
                border = AppColors.orange;
              } else if (isFlagged) {
                bg = AppColors.warning.withValues(alpha: 0.1);
                fg = AppColors.warning;
                border = AppColors.warning.withValues(alpha: 0.5);
              } else if (answered) {
                bg = AppColors.success.withValues(alpha: 0.1);
                fg = AppColors.success;
                border = AppColors.success.withValues(alpha: 0.5);
              } else {
                bg = AppColors.white;
                fg = AppColors.textSecondary;
                border = AppColors.border;
              }

              return InkWell(
                onTap: () => onTap(i),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: border),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${i + 1}',
                    style: AppTypography.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700,
                      color: fg,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        _Legend(),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    Widget swatch(Color bg, Color border, String label) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(2),
                border: Border.all(color: border),
              ),
            ),
            const SizedBox(width: 6),
            Text(label, style: AppTypography.caption),
          ],
        );
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        swatch(AppColors.orange, AppColors.orange, 'Current'),
        swatch(AppColors.success.withValues(alpha: 0.1),
            AppColors.success.withValues(alpha: 0.5), 'Answered'),
        swatch(AppColors.warning.withValues(alpha: 0.1),
            AppColors.warning.withValues(alpha: 0.5), 'Flagged'),
        swatch(AppColors.white, AppColors.border, 'Unanswered'),
      ],
    );
  }
}

class _QuestionCard extends StatelessWidget {
  final int index;
  final int total;
  final TestQuestion question;
  final Object? answer;
  final bool flagged;
  final VoidCallback onFlag;
  final ValueChanged<Object?> onAnswer;

  const _QuestionCard({
    required this.index,
    required this.total,
    required this.question,
    required this.answer,
    required this.flagged,
    required this.onFlag,
    required this.onAnswer,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Question ${index + 1} of $total',
                      style: AppTypography.caption.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: onFlag,
                      icon: Icon(
                        flagged ? Icons.flag_rounded : Icons.flag_outlined,
                        size: 16,
                        color: flagged
                            ? AppColors.warning
                            : AppColors.textSecondary,
                      ),
                      label: Text(flagged ? 'Flagged' : 'Flag'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        foregroundColor: flagged
                            ? AppColors.warning
                            : AppColors.textSecondary,
                        side: BorderSide(
                          color: flagged
                              ? AppColors.warning.withValues(alpha: 0.5)
                              : AppColors.border,
                        ),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                        textStyle: AppTypography.caption,
                        minimumSize: const Size(0, 32),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  question.content,
                  style: AppTypography.bodyLarge
                      .copyWith(fontWeight: FontWeight.w600, height: 1.4),
                ),
                if (question.imageUrl != null) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.network(
                      question.imageUrl!,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                  ),
                ],
                if (question.hasHint) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Hint: ${question.hint!}',
                      style: AppTypography.caption,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                _QuestionInput(
                    question: question, answer: answer, onAnswer: onAnswer),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(14)),
            ),
            child: Wrap(
              spacing: 12,
              children: [
                if (question.positiveMarks > 0)
                  Text(
                    '+${_fmtMark(question.positiveMarks)} correct',
                    style: AppTypography.caption,
                  ),
                if (question.negativeMarks > 0)
                  Text(
                    '−${_fmtMark(question.negativeMarks)} wrong',
                    style: AppTypography.caption
                        .copyWith(color: AppColors.error),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _fmtMark(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }
}

class _QuestionInput extends StatelessWidget {
  final TestQuestion question;
  final Object? answer;
  final ValueChanged<Object?> onAnswer;

  const _QuestionInput({
    required this.question,
    required this.answer,
    required this.onAnswer,
  });

  @override
  Widget build(BuildContext context) {
    switch (question.type) {
      case QuestionType.mcqSingle:
      case QuestionType.imageBased:
        return _ChoiceList(
          options: question.options,
          multiple: false,
          selected: answer is num ? [(answer as num).toInt()] : <int>[],
          onChange: (values) =>
              onAnswer(values.isEmpty ? null : values.first),
        );
      case QuestionType.mcqMultiple:
        return _ChoiceList(
          options: question.options,
          multiple: true,
          selected: answer is List
              ? (answer).whereType<num>().map((n) => n.toInt()).toList()
              : <int>[],
          onChange: (values) => onAnswer(values),
        );
      case QuestionType.trueFalse:
        return _ChoiceList(
          options: const [
            QuestionOption(id: '0', text: 'True'),
            QuestionOption(id: '1', text: 'False'),
          ],
          multiple: false,
          selected: answer == 'true'
              ? [0]
              : answer == 'false'
                  ? [1]
                  : <int>[],
          onChange: (values) {
            if (values.isEmpty) {
              onAnswer(null);
            } else {
              onAnswer(values.first == 0 ? 'true' : 'false');
            }
          },
        );
      case QuestionType.shortAnswer:
        return _ShortAnswerInput(
            value: answer is String ? answer as String : '',
            onChange: onAnswer);
      case QuestionType.subjective:
        return _SubjectiveInput(
            value: answer is String ? answer as String : '',
            onChange: onAnswer);
      case QuestionType.matchPair:
        return _MatchPairInput(
          pairs: question.matchPairs,
          current: answer is Map
              ? Map<String, String>.from(
                  (answer).map((k, v) => MapEntry(k.toString(), v.toString())))
              : <String, String>{},
          onChange: onAnswer,
        );
      case QuestionType.unknown:
        return Text('Unsupported question type.',
            style: AppTypography.bodyMedium);
    }
  }
}

class _ChoiceList extends StatelessWidget {
  final List<QuestionOption> options;
  final bool multiple;
  final List<int> selected;
  final ValueChanged<List<int>> onChange;

  const _ChoiceList({
    required this.options,
    required this.multiple,
    required this.selected,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final set = selected.toSet();
    return Column(
      children: [
        for (var i = 0; i < options.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () {
                if (multiple) {
                  final next = Set<int>.from(set);
                  final optionId = int.tryParse(options[i].id) ?? i;
                  if (next.contains(optionId)) {
                    next.remove(optionId);
                  } else {
                    next.add(optionId);
                  }
                  onChange(next.toList()..sort());
                } else {
                  final optionId = int.tryParse(options[i].id) ?? i;
                  onChange([optionId]);
                }
              },
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: set.contains(int.tryParse(options[i].id) ?? i)
                      ? AppColors.orange.withValues(alpha: 0.08)
                      : AppColors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: set.contains(int.tryParse(options[i].id) ?? i)
                        ? AppColors.orange
                        : AppColors.border,
                    width: 1.5,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Bullet(
                      multiple: multiple,
                      selected:
                          set.contains(int.tryParse(options[i].id) ?? i),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        options[i].text,
                        style: AppTypography.bodyMedium
                            .copyWith(height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Bullet extends StatelessWidget {
  final bool multiple;
  final bool selected;
  const _Bullet({required this.multiple, required this.selected});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: multiple ? BoxShape.rectangle : BoxShape.circle,
        borderRadius: multiple ? BorderRadius.circular(4) : null,
        border: Border.all(
          color: selected ? AppColors.orange : AppColors.textSecondary,
          width: 2,
        ),
        color: selected ? AppColors.orange : Colors.transparent,
      ),
      child: selected
          ? const Icon(Icons.check_rounded,
              size: 14, color: AppColors.white)
          : null,
    );
  }
}

class _ShortAnswerInput extends StatelessWidget {
  final String value;
  final ValueChanged<Object?> onChange;
  const _ShortAnswerInput({required this.value, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: value,
      maxLength: 200,
      autocorrect: false,
      enableSuggestions: false,
      style: AppTypography.bodyMedium,
      decoration: InputDecoration(
        hintText: 'Type your answer',
        filled: true,
        fillColor: AppColors.white,
        counterText: '',
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.orange, width: 1.5),
        ),
      ),
      onChanged: (v) => onChange(v),
    );
  }
}

class _SubjectiveInput extends StatelessWidget {
  final String value;
  final ValueChanged<Object?> onChange;
  const _SubjectiveInput({required this.value, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: value,
      maxLength: 5000,
      maxLines: 8,
      style: AppTypography.bodyMedium.copyWith(height: 1.5),
      decoration: InputDecoration(
        hintText: 'Write your answer. A mentor will mark this one.',
        filled: true,
        fillColor: AppColors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.orange, width: 1.5),
        ),
      ),
      onChanged: (v) => onChange(v),
    );
  }
}

class _MatchPairInput extends StatelessWidget {
  final MatchPairOptions? pairs;
  final Map<String, String> current;
  final ValueChanged<Object?> onChange;

  const _MatchPairInput({
    required this.pairs,
    required this.current,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final opts = pairs;
    if (opts == null || opts.isEmpty) {
      return Text('Match question is missing options.',
          style: AppTypography.bodyMedium);
    }
    return Column(
      children: [
        for (var i = 0; i < opts.left.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      opts.left[i].text,
                      style: AppTypography.bodyMedium
                          .copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.arrow_forward_rounded,
                    size: 18, color: AppColors.textSecondary),
                const SizedBox(width: 8),
                Expanded(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border:
                          Border.all(color: AppColors.border, width: 1.5),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: Padding(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 10),
                        child: DropdownButton<String>(
                          value: current[i.toString()],
                          hint: Text('Pick…',
                              style: AppTypography.bodyMedium),
                          isExpanded: true,
                          items: opts.right
                              .map((o) => DropdownMenuItem(
                                    value: o.text,
                                    child: Text(o.text,
                                        overflow: TextOverflow.ellipsis),
                                  ))
                              .toList(),
                          onChanged: (v) {
                            final next = Map<String, String>.from(current);
                            if (v == null) {
                              next.remove(i.toString());
                            } else {
                              next[i.toString()] = v;
                            }
                            onChange(next);
                          },
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ResultsPanel extends StatelessWidget {
  final Test? test;
  final TestSubmissionResult result;
  final bool auto;
  final VoidCallback onBack;

  const _ResultsPanel({
    required this.test,
    required this.result,
    required this.auto,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final badgeColor = result.awaitingReview
        ? AppColors.warning
        : (result.passed ? AppColors.success : AppColors.error);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text(
          'Submitted',
          style: AppTypography.bodyLarge
              .copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        result.awaitingReview
                            ? Icons.hourglass_bottom_rounded
                            : result.passed
                                ? Icons.check_circle_rounded
                                : Icons.close_rounded,
                        color: badgeColor,
                        size: 36,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      result.awaitingReview
                          ? 'Submitted — awaiting review'
                          : result.passed
                              ? 'Nicely done'
                              : 'Submitted',
                      style: AppTypography.bodyLarge.copyWith(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (test != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${test!.name}${auto ? ' · auto-submitted' : ''}',
                        textAlign: TextAlign.center,
                        style: AppTypography.caption,
                      ),
                    ],
                    if (result.showResults) ...[
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(
                              child: _StatTile(
                                  label: 'Score',
                                  value: _fmt(result.score))),
                          const SizedBox(width: 8),
                          Expanded(
                              child: _StatTile(
                                  label: 'Out of',
                                  value: _fmt(result.totalMarks))),
                          const SizedBox(width: 8),
                          Expanded(
                              child: _StatTile(
                                  label: 'Percentage',
                                  value:
                                      '${result.percentage.toStringAsFixed(1)}%')),
                        ],
                      ),
                    ] else ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'Results will be shared once your teacher has '
                          'reviewed them.',
                          textAlign: TextAlign.center,
                          style: AppTypography.caption,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const Spacer(),
              FilledButton(
                onPressed: onBack,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.orange,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Back to tests'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fmt(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(1);
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  const _StatTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(
            label.toUpperCase(),
            style: AppTypography.caption.copyWith(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppTypography.bodyLarge.copyWith(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
