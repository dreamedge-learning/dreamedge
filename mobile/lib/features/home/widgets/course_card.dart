import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/models/course.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

class CourseCard extends StatelessWidget {
  final Course course;
  final VoidCallback onTap;
  final double width;

  const CourseCard({
    super.key,
    required this.course,
    required this.onTap,
    this.width = 220,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: width,
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: AppColors.black.withValues(alpha: 0.06),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildThumbnail(),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildBadges(),
                  const SizedBox(height: 8),
                  Text(
                    course.title,
                    style: AppTypography.bodyLarge
                        .copyWith(fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  _buildPriceRow(),
                  const SizedBox(height: 8),
                  _buildStatsRow(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildThumbnail() {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: course.thumbnailUrl != null
            ? CachedNetworkImage(
                imageUrl: course.thumbnailUrl!,
                fit: BoxFit.cover,
                placeholder: (_, _) => _thumbnailPlaceholder(),
                errorWidget: (_, _, _) => _thumbnailPlaceholder(),
              )
            : _thumbnailPlaceholder(),
      ),
    );
  }

  Widget _thumbnailPlaceholder() {
    return Container(
      color: AppColors.surface,
      child: const Center(
        child: Icon(Icons.play_circle_outline, size: 40, color: AppColors.gray),
      ),
    );
  }

  Widget _buildBadges() {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.orange.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            'Class ${course.targetClass}',
            style: AppTypography.caption.copyWith(
              color: AppColors.orange,
              fontWeight: FontWeight.w600,
              fontSize: 11,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPriceRow() {
    return Row(
      children: [
        if (course.hasDiscount) ...[
          Text(
            course.formattedPrice,
            style: AppTypography.bodyLarge.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            course.formattedOriginalPrice,
            style: AppTypography.bodySmall.copyWith(
              decoration: TextDecoration.lineThrough,
              color: AppColors.gray,
            ),
          ),
        ] else
          Text(
            course.formattedPrice,
            style: AppTypography.bodyLarge.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
      ],
    );
  }

  Widget _buildStatsRow() {
    return Row(
      children: [
        const Icon(Icons.access_time, size: 14, color: AppColors.gray),
        const SizedBox(width: 4),
        Text(course.formattedDuration, style: AppTypography.caption),
        const SizedBox(width: 12),
        const Icon(Icons.play_lesson_outlined, size: 14, color: AppColors.gray),
        const SizedBox(width: 4),
        Text('${course.totalLessons} lessons', style: AppTypography.caption),
      ],
    );
  }
}
