import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/models/course_rating.dart';
import '../../../core/providers/course_rating_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../../../shared/widgets/star_row.dart';

/// The course screen's ratings summary and written reviews.
///
/// The summary counts every visible rating; the list holds only the ones
/// that came with words, which is why the two numbers can differ. Reviews
/// are plain text widgets, so nothing a student types is ever interpreted.
/// Nothing here links to a purchase, so it is the same on every store.
class CourseReviewsSection extends ConsumerStatefulWidget {
  final String courseId;
  final double? ratingAvg;
  final int ratingCount;

  const CourseReviewsSection({
    super.key,
    required this.courseId,
    required this.ratingAvg,
    required this.ratingCount,
  });

  @override
  ConsumerState<CourseReviewsSection> createState() =>
      _CourseReviewsSectionState();
}

class _CourseReviewsSectionState extends ConsumerState<CourseReviewsSection> {
  /// Pages fetched with "Show more", after the first one the provider holds.
  final List<PublicReview> _more = [];
  int? _total;
  bool _loadingMore = false;
  String? _moreError;

  Future<void> _loadMore(int loaded) async {
    setState(() {
      _loadingMore = true;
      _moreError = null;
    });
    try {
      final page = await ref
          .read(ratingServiceProvider)
          .reviews(widget.courseId, offset: loaded);
      if (!mounted) return;
      setState(() {
        _more.addAll(page.reviews);
        // An empty page means a review was hidden since the first page
        // loaded, so the list ended early.
        _total = page.reviews.isEmpty ? loaded : page.total;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingMore = false;
        _moreError = 'Could not load more reviews.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final firstPage = ref.watch(courseReviewsProvider(widget.courseId));
    final avg = widget.ratingAvg;
    final hasRatings = avg != null && widget.ratingCount > 0;

    return firstPage.when(
      loading: () => hasRatings ? _summary(avg) : const SizedBox.shrink(),
      // A course page without its reviews is still a course page.
      error: (_, _) => hasRatings ? _summary(avg) : const SizedBox.shrink(),
      data: (page) {
        final reviews = [...page.reviews, ..._more];
        final total = _total ?? page.total;
        if (!hasRatings && reviews.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hasRatings) _summary(avg) else _heading(),
            const SizedBox(height: 12),
            if (reviews.isEmpty)
              Text(
                'No written reviews yet.',
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.textSecondary,
                ),
              )
            else
              for (final review in reviews) _ReviewTile(review: review),
            if (_moreError != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _moreError!,
                  style: AppTypography.caption.copyWith(color: AppColors.error),
                ),
              ),
            if (reviews.length < total)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: OutlinedButton(
                  onPressed:
                      _loadingMore ? null : () => _loadMore(reviews.length),
                  child: _loadingMore
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Show more reviews'),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _heading() => Text('Student reviews', style: AppTypography.heading3);

  Widget _summary(double avg) {
    final count = widget.ratingCount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading(),
        const SizedBox(height: 10),
        Row(
          children: [
            Text(
              avg.toStringAsFixed(1),
              style: AppTypography.heading2.copyWith(height: 1),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StarRow(value: avg, size: 16),
                const SizedBox(height: 2),
                Text(
                  count == 1
                      ? '1 rating from an enrolled student'
                      : '$count ratings from enrolled students',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _ReviewTile extends StatelessWidget {
  final PublicReview review;

  const _ReviewTile({required this.review});

  @override
  Widget build(BuildContext context) {
    final date = review.reviewedAt;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                review.reviewerName,
                style: AppTypography.bodySmall.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              StarRow(value: review.stars, size: 13),
              if (date != null)
                Text(
                  DateFormat('d MMM yyyy').format(date.toLocal()),
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            review.review,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
