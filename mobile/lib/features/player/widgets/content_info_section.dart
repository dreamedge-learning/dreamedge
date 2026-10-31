import 'package:flutter/material.dart';

import '../../../core/models/content.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../../../shared/widgets/badge_chip.dart';

class ContentInfoSection extends StatelessWidget {
  final Content content;

  const ContentInfoSection({super.key, required this.content});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            content.title,
            style: AppTypography.heading3,
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              BadgeChip(
                label: content.formattedDuration,
                color: AppColors.darkBlue,
                icon: Icons.access_time_rounded,
              ),
              if (content.isFree)
                const BadgeChip(
                  label: 'FREE',
                  color: AppColors.success,
                  icon: Icons.check_circle_outline_rounded,
                ),
              BadgeChip(
                label: content.type.label,
                color: AppColors.orange,
                icon: content.isVideo
                    ? Icons.play_circle_outline_rounded
                    : Icons.insert_drive_file_outlined,
              ),
            ],
          ),
          if (content.description != null &&
              content.description!.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              content.description!,
              style:
                  AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}
