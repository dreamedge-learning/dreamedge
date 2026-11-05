import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/course_rating.dart';
import '../../../core/providers/course_rating_provider.dart';
import '../../../core/services/rating_service.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../../../shared/widgets/star_row.dart';

/// The student's 1-5 star rating for an enrolled course, and an optional
/// written review.
///
/// Tapping a star saves it straight away: the stars paint on tap and roll
/// back with the server's reason if the write is refused. The review is
/// written in a bottom sheet, because a text box on every card would crowd
/// My Learning for something most students do once.
///
/// A student who has not finished a lesson yet is told why they cannot rate,
/// rather than shown stars that fail when tapped; one whose enrolment has
/// lapsed keeps seeing the rating they gave, without the controls. Nothing
/// here links to a purchase, so it is the same on every store.
class CourseRatingStars extends ConsumerStatefulWidget {
  final String courseId;
  final String courseTitle;
  final MyCourseRating initial;

  const CourseRatingStars({
    super.key,
    required this.courseId,
    required this.courseTitle,
    required this.initial,
  });

  @override
  ConsumerState<CourseRatingStars> createState() => _CourseRatingStarsState();
}

class _CourseRatingStarsState extends ConsumerState<CourseRatingStars> {
  late MyCourseRating _rating;
  bool _pending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _rating = widget.initial;
  }

  @override
  void didUpdateWidget(CourseRatingStars oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A fresh read from the server wins, unless a write of ours is still in
    // flight and about to report its own result.
    if (!_pending && !identical(oldWidget.initial, widget.initial)) {
      _rating = widget.initial;
    }
  }

  Future<void> _rate(int stars) async {
    if (_pending) return;
    final previous = _rating;
    setState(() {
      _rating = _rating.copyWith(stars: stars);
      _error = null;
      _pending = true;
    });

    try {
      final saved = await ref
          .read(ratingServiceProvider)
          .rate(courseId: widget.courseId, stars: stars);
      if (!mounted) return;
      _refreshShared();
      setState(() {
        _rating = saved;
        _pending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _rating = previous;
        _pending = false;
        _error = e is RatingException
            ? e.message
            : 'Could not save your rating. Please try again.';
      });
    }
  }

  /// Other screens read the same ratings and the course's reviews; the next
  /// visit should start from what the server now holds.
  void _refreshShared() {
    ref.invalidate(myCourseRatingsProvider);
    ref.invalidate(courseReviewsProvider(widget.courseId));
  }

  Future<void> _openReviewSheet() async {
    final saved = await showModalBottomSheet<MyCourseRating>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => ReviewSheet(
        courseId: widget.courseId,
        courseTitle: widget.courseTitle,
        rating: _rating,
      ),
    );
    if (saved == null || !mounted) return;
    _refreshShared();
    setState(() {
      _rating = saved;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final stars = _rating.stars;

    if (!_rating.canRate) {
      if (stars != null) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            StarRow(value: stars, size: 16),
            const SizedBox(width: 6),
            Text(
              'Your rating',
              style: AppTypography.caption.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
        );
      }
      return Text(
        'Finish a lesson to rate this course.',
        style: AppTypography.caption.copyWith(color: AppColors.textSecondary),
      );
    }

    final error = _error;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          container: true,
          label: 'Rate ${widget.courseTitle}',
          value: stars != null ? '$stars out of 5 stars' : 'Not rated',
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var n = 1; n <= 5; n++)
                _StarButton(
                  filled: n <= (stars ?? 0),
                  disabled: _pending,
                  // Each star carries its own label so a screen reader
                  // reads "3 stars" instead of "button, button, button".
                  semanticLabel: '$n ${n == 1 ? 'star' : 'stars'}',
                  onTap: () => _rate(n),
                ),
              const SizedBox(width: 6),
              if (_pending)
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.5),
                )
              else
                Text(
                  stars != null ? '$stars/5' : 'Rate',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
        ),
        if (stars != null)
          TextButton.icon(
            onPressed: _pending ? null : _openReviewSheet,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              minimumSize: const Size(0, 32),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              foregroundColor: AppColors.textSecondary,
            ),
            icon: const Icon(Icons.edit_note_rounded, size: 18),
            label: Text(
              _rating.review != null ? 'Edit your review' : 'Write a review',
              style: AppTypography.caption,
            ),
          ),
        if (_rating.isHidden)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              _rating.hiddenReason != null
                  ? 'Your review is hidden from the course page: '
                      '${_rating.hiddenReason}'
                  : 'Your review is hidden from the course page.',
              style: AppTypography.caption.copyWith(
                color: AppColors.textSecondary,
              ),
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

/// Writes or edits the review, with the stars alongside so a student who
/// changes their mind while writing can change both at once. Pops with the
/// saved rating, or nothing when dismissed.
class ReviewSheet extends ConsumerStatefulWidget {
  final String courseId;
  final String courseTitle;
  final MyCourseRating rating;

  const ReviewSheet({
    super.key,
    required this.courseId,
    required this.courseTitle,
    required this.rating,
  });

  @override
  ConsumerState<ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends ConsumerState<ReviewSheet> {
  late int _stars;
  late final TextEditingController _text;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _stars = widget.rating.stars ?? 5;
    _text = TextEditingController(text: widget.rating.review ?? '');
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await ref.read(ratingServiceProvider).rate(
            courseId: widget.courseId,
            stars: _stars,
            review: _text.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(saved);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e is RatingException
            ? e.message
            : 'Could not save your review. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final error = _error;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Review ${widget.courseTitle}', style: AppTypography.heading3),
            const SizedBox(height: 6),
            Text(
              'Your review appears on the course page under your first name '
              'and the initial of your surname. Leave the box empty to keep '
              'just the stars.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                for (var n = 1; n <= 5; n++)
                  _StarButton(
                    filled: n <= _stars,
                    disabled: _saving,
                    size: 30,
                    semanticLabel: '$n ${n == 1 ? 'star' : 'stars'}',
                    onTap: () => setState(() => _stars = n),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _text,
              enabled: !_saving,
              minLines: 3,
              maxLines: 6,
              maxLength: reviewMaxLength,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'What helped you most? What could be better?',
                border: OutlineInputBorder(),
              ),
            ),
            if (error != null) ...[
              const SizedBox(height: 4),
              Text(
                error,
                style: AppTypography.caption.copyWith(color: AppColors.error),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save review'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StarButton extends StatelessWidget {
  final bool filled;
  final bool disabled;
  final double size;
  final String semanticLabel;
  final VoidCallback onTap;

  const _StarButton({
    required this.filled,
    required this.disabled,
    required this.semanticLabel,
    required this.onTap,
    this.size = 22,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: !disabled,
      label: semanticLabel,
      child: IconButton(
        onPressed: disabled ? null : onTap,
        padding: const EdgeInsets.all(2),
        constraints: BoxConstraints(minWidth: size + 10, minHeight: size + 10),
        icon: Icon(
          filled ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: filled ? AppColors.golden : AppColors.gray,
        ),
      ),
    );
  }
}
