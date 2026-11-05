import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/doubt.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../../../shared/widgets/badge_chip.dart';

/// Colour for a status chip. Amber while waiting, green once answered.
Color doubtStatusColor(DoubtStatus status) {
  switch (status) {
    case DoubtStatus.open:
      return AppColors.warning;
    case DoubtStatus.answered:
      return AppColors.success;
    case DoubtStatus.closed:
      return AppColors.gray;
  }
}

class DoubtStatusChip extends StatelessWidget {
  final DoubtStatus status;

  const DoubtStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return BadgeChip(
      label: status.label,
      color: doubtStatusColor(status),
      icon: switch (status) {
        DoubtStatus.open => Icons.schedule_rounded,
        DoubtStatus.answered => Icons.check_circle_outline_rounded,
        DoubtStatus.closed => Icons.lock_outline_rounded,
      },
    );
  }
}

/// A doubt in a list. Tapping opens the thread.
class DoubtTile extends StatelessWidget {
  final Doubt doubt;

  /// On the lesson screen the lesson is obvious; in "My doubts" it is not.
  final bool showLesson;

  const DoubtTile({super.key, required this.doubt, this.showLesson = false});

  @override
  Widget build(BuildContext context) {
    final replies = doubt.replies.length;
    final meta = [
      if (showLesson) doubt.lessonTitle ?? 'Lesson',
      replies == 0
          ? 'No replies yet'
          : '$replies ${replies == 1 ? 'reply' : 'replies'}',
      formatDoubtTime(doubt.updatedAt),
    ].join(' · ');

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/doubts/${doubt.id}'),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DoubtStatusChip(status: doubt.status),
                    const SizedBox(height: 8),
                    Text(
                      doubt.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyMedium,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right_rounded, color: AppColors.gray),
            ],
          ),
        ),
      ),
    );
  }
}
