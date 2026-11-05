import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/enrollment.dart';
import '../../../core/providers/course_rating_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import 'course_rating_stars.dart';

class EnrolledCourseCard extends ConsumerWidget {
  final Enrollment enrollment;

  const EnrolledCourseCard({super.key, required this.enrollment});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final course = enrollment.course;
    final title = course?.title ?? 'Course';
    final targetClass = course?.targetClass;
    final thumbnailUrl = course?.thumbnailUrl;

    // The student's own rating for this course and whether they may rate it
    // yet. Nothing is drawn until that is known: stars that appear empty and
    // then fill in a moment later read as the rating having been lost.
    final rating = ref.watch(myCourseRatingsProvider).maybeWhen(
          data: (map) => map[enrollment.courseId],
          orElse: () => null,
        );

    return GestureDetector(
      onTap: () => context.push('/course/${enrollment.courseId}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 80,
                height: 80,
                child: thumbnailUrl != null
                    ? CachedNetworkImage(
                        imageUrl: thumbnailUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => _thumbnailPlaceholder(),
                        errorWidget: (_, _, _) => _thumbnailPlaceholder(),
                      )
                    : _thumbnailPlaceholder(),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (targetClass != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.orange.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'Class $targetClass',
                        style: AppTypography.caption.copyWith(
                          color: AppColors.orange,
                          fontWeight: FontWeight.w600,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  Text(
                    title,
                    style: AppTypography.bodyMedium
                        .copyWith(fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        enrollment.isActive
                            ? Icons.check_circle_rounded
                            : Icons.schedule_rounded,
                        size: 14,
                        color: enrollment.isActive
                            ? AppColors.success
                            : AppColors.gray,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        enrollment.isActive ? 'Active' : 'Expired',
                        style: AppTypography.caption.copyWith(
                          color: enrollment.isActive
                              ? AppColors.success
                              : AppColors.gray,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (enrollment.validUntil != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          'Valid until ${_formatDate(enrollment.validUntil!)}',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.gray,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ],
                  ),
                  // The star control sits inside the card's info column so
                  // a tap on it is isolated from the surrounding
                  // GestureDetector by the IconButtons' own hit testing.
                  if (rating != null) ...[
                    const SizedBox(height: 6),
                    CourseRatingStars(
                      courseId: enrollment.courseId,
                      courseTitle: title,
                      initial: rating,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.chevron_right_rounded,
              color: AppColors.gray,
              size: 22,
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbnailPlaceholder() {
    return Container(
      color: AppColors.darkBlue,
      child: Center(
        child: Icon(
          Icons.play_circle_outline,
          size: 28,
          color: AppColors.white.withValues(alpha: 0.4),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
