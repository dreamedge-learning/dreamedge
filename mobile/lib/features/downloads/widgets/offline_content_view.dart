import 'package:flutter/material.dart';

import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../downloads_screen.dart';

/// What Home, Courses and My Learning show with no connection.
///
/// The alternative was a spinner that resolves into an error, which is what
/// those screens used to do and which tells a student nothing except that the
/// app is broken. What they actually want to know offline is "what can I watch
/// right now", and the answer is their downloads -- so that is what is shown,
/// under a header saying plainly why the rest is missing.
class OfflineContentView extends StatelessWidget {
  /// What this screen would normally show, so the header can say what is
  /// being stood in for.
  final String insteadOf;

  const OfflineContentView({super.key, required this.insteadOf});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: AppColors.darkBlue,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Icon(
                Icons.cloud_off_rounded,
                size: 18,
                color: AppColors.white,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Showing downloaded content',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$insteadOf needs a connection. Your saved lessons do '
                      'not.',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.white.withValues(alpha: 0.75),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const Expanded(child: DownloadsScreen()),
      ],
    );
  }
}
