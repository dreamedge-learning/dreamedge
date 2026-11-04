import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/course_rating_provider.dart';
import '../../../core/providers/supabase_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// A 1-5 star control for an enrolled course.
///
/// Writes directly to `course_ratings` as the signed-in student; RLS is the
/// real gate. The inserts use UPSERT on the composite primary key
/// (`student_id`, `course_id`) so re-rating a course rewrites the single row
/// rather than piling up duplicates, and the aggregate trigger on the table
/// updates `courses.rating_avg` / `rating_count` server-side.
///
/// Optimistic: the painted stars update on tap, and a server failure rolls
/// the painted value back and surfaces the error under the row.
class CourseRatingStars extends ConsumerStatefulWidget {
  final String courseId;
  final int? initialStars;
  final String courseTitle;

  const CourseRatingStars({
    super.key,
    required this.courseId,
    required this.courseTitle,
    this.initialStars,
  });

  @override
  ConsumerState<CourseRatingStars> createState() => _CourseRatingStarsState();
}

class _CourseRatingStarsState extends ConsumerState<CourseRatingStars> {
  // The last value accepted by the server, painted when nothing is being
  // written. On submit it's set to the chosen value optimistically and
  // reverted if the write fails.
  int? _applied;
  bool _pending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _applied = widget.initialStars;
  }

  Future<void> _rate(int stars) async {
    if (_pending) return;
    final previous = _applied;
    setState(() {
      _applied = stars;
      _error = null;
      _pending = true;
    });

    final client = ref.read(supabaseClientProvider);
    try {
      // RLS needs the student's own `students.id`. We don't persist it in
      // this widget: a rating is an infrequent gesture, one extra round-trip
      // is cheaper than keeping a dangling cache in sync with sign-in state.
      final userId = client.auth.currentUser?.id;
      if (userId == null) {
        throw const PostgrestException(message: 'Not signed in', code: '401');
      }
      final row = await client
          .from('students')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
      final studentId = row?['id'] as String?;
      if (studentId == null) {
        throw const PostgrestException(
          message: 'No student profile',
          code: 'no_student',
        );
      }

      await client.from('course_ratings').upsert(
        {
          'student_id': studentId,
          'course_id': widget.courseId,
          'stars': stars,
        },
        onConflict: 'student_id,course_id',
      );

      // Reset the shared cache so a re-mount of this list (or a visit to
      // another screen that reads the same provider) starts from the value
      // the server now holds, not the widget's remembered state.
      ref.invalidate(myCourseRatingsProvider);

      if (!mounted) return;
      setState(() {
        _pending = false;
      });
    } on PostgrestException catch (e) {
      if (!mounted) return;
      setState(() {
        _applied = previous;
        _pending = false;
        // 42501 is Postgres' RLS refusal. The two legitimate causes from
        // the UI are "the course isn't theirs" or "the enrolment has
        // expired"; either way the student needs the same guidance.
        _error = e.code == '42501'
            ? "You can only rate a course you're currently enrolled in."
            : 'Could not save your rating.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _applied = previous;
        _pending = false;
        _error = 'Could not save your rating.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final applied = _applied ?? 0;
    final error = _error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          container: true,
          label: 'Rate ${widget.courseTitle}',
          value: _applied != null ? '${_applied!} out of 5 stars' : 'Not rated',
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var n = 1; n <= 5; n++)
                _StarButton(
                  filled: n <= applied,
                  disabled: _pending,
                  // Each star carries its own label so a screen reader
                  // can read "3 stars" instead of "button, button, button".
                  semanticLabel: '$n ${n == 1 ? 'star' : 'stars'}',
                  onTap: () => _rate(n),
                ),
              const SizedBox(width: 6),
              Text(
                _applied != null ? '${_applied!}/5' : 'Rate',
                style: AppTypography.caption.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 4),
          Text(
            error,
            style: AppTypography.caption.copyWith(color: AppColors.error),
          ),
        ],
      ],
    );
  }
}

class _StarButton extends StatelessWidget {
  final bool filled;
  final bool disabled;
  final String semanticLabel;
  final VoidCallback onTap;

  const _StarButton({
    required this.filled,
    required this.disabled,
    required this.semanticLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: !disabled,
      label: semanticLabel,
      child: IconButton(
        onPressed: disabled ? null : onTap,
        splashRadius: 18,
        padding: const EdgeInsets.all(2),
        constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
        icon: Icon(
          filled ? Icons.star_rounded : Icons.star_outline_rounded,
          size: 22,
          color: filled ? AppColors.golden : AppColors.gray,
        ),
      ),
    );
  }
}
