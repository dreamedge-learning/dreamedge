import 'package:flutter/material.dart';

import '../../../core/models/student_profile_draft.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// Four bars and a line of text, so a student can see how much is left.
class ProfileStepIndicator extends StatelessWidget {
  /// How many steps are behind the student; equal to the total on review.
  final int completed;

  const ProfileStepIndicator({super.key, required this.completed});

  @override
  Widget build(BuildContext context) {
    final total = profileSteps.length;
    final done = completed.clamp(0, total);

    return Column(
      children: [
        Row(
          children: [
            for (var index = 0; index < total; index++) ...[
              if (index > 0) const SizedBox(width: 6),
              Expanded(
                child: Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: index < done ? AppColors.orange : AppColors.border,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Text(
          done >= total
              ? 'Review'
              : 'Step ${done + 1} of $total — ${profileSteps[done].title}',
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}
