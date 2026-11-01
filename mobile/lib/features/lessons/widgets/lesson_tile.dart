import 'package:flutter/material.dart';

import '../../../core/models/content.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

class LessonTile extends StatelessWidget {
  final Content content;
  final int index;
  final VoidCallback onTap;

  const LessonTile({
    super.key,
    required this.content,
    required this.index,
    required this.onTap,
  });

  /// What the row promises when tapped.
  ///
  /// A padlock on a paid lesson, otherwise the shape of what opens: the player
  /// for a video, the reader for a booklet. A play triangle on a past paper
  /// was promising the wrong thing now that documents actually open.
  IconData get _trailingIcon {
    if (!content.isFree) return Icons.lock_outline_rounded;
    if (content.isVideoProcessing) return Icons.hourglass_top_rounded;
    if (content.isReadable) return Icons.menu_book_rounded;
    return Icons.play_circle_fill_rounded;
  }

  Color get _trailingColour =>
      content.isFree && !content.isVideoProcessing
          ? AppColors.orange
          : AppColors.gray;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: AppColors.border, width: 0.5),
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: AppColors.surface,
              child: Text(
                '${index + 1}',
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    content.title,
                    style: AppTypography.bodyMedium
                        .copyWith(fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.access_time_rounded,
                          size: 13, color: AppColors.gray),
                      const SizedBox(width: 4),
                      Text(
                        content.formattedDuration,
                        style: AppTypography.caption
                            .copyWith(color: AppColors.gray),
                      ),
                      if (content.isFree) ...[
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'FREE',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.success,
                              fontWeight: FontWeight.w700,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Icon(_trailingIcon, size: 24, color: _trailingColour),
          ],
        ),
      ),
    );
  }
}
