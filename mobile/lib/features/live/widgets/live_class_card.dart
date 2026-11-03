import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/live_class.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

class LiveClassCard extends StatelessWidget {
  final LiveClass liveClass;

  const LiveClassCard({super.key, required this.liveClass});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/live/${liveClass.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.darkBlue,
                  backgroundImage: liveClass.instructorAvatarUrl != null
                      ? NetworkImage(liveClass.instructorAvatarUrl!)
                      : null,
                  child: liveClass.instructorAvatarUrl == null
                      ? Text(
                          liveClass.instructorName.isNotEmpty
                              ? liveClass.instructorName[0].toUpperCase()
                              : 'T',
                          style: AppTypography.caption
                              .copyWith(color: AppColors.white),
                        )
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    liveClass.instructorName,
                    style: AppTypography.bodySmall
                        .copyWith(fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                _StatusBadge(liveClass: liveClass),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              liveClass.title,
              style: AppTypography.heading3.copyWith(fontSize: 18),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.calendar_today_outlined,
                    size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 4),
                Text(liveClass.formattedDate, style: AppTypography.caption),
                const SizedBox(width: 16),
                Icon(Icons.access_time_outlined,
                    size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 4),
                Text(liveClass.formattedTime, style: AppTypography.caption),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.timelapse_outlined,
                    size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 4),
                Text(liveClass.formattedDuration,
                    style: AppTypography.caption),
              ],
            ),
            const SizedBox(height: 14),
            _ActionButton(liveClass: liveClass),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final LiveClass liveClass;

  const _StatusBadge({required this.liveClass});

  @override
  Widget build(BuildContext context) {
    if (liveClass.isLive) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.error.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: AppColors.error,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              'LIVE',
              style: AppTypography.caption.copyWith(
                color: AppColors.error,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
          ],
        ),
      );
    }

    if (liveClass.isScheduled) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          liveClass.countdown,
          style: AppTypography.caption.copyWith(
            color: const Color(0xFF3B82F6),
            fontWeight: FontWeight.w600,
            fontSize: 11,
          ),
        ),
      );
    }

    if (liveClass.isCompleted) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.success.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline,
                size: 12, color: AppColors.success),
            const SizedBox(width: 4),
            Text(
              'Completed',
              style: AppTypography.caption.copyWith(
                color: AppColors.success,
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.gray.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        'Cancelled',
        style: AppTypography.caption.copyWith(
          color: AppColors.gray,
          fontWeight: FontWeight.w600,
          fontSize: 11,
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final LiveClass liveClass;

  const _ActionButton({required this.liveClass});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (liveClass.isLive && liveClass.meetingUrl != null) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _launchUrl(liveClass.meetingUrl!),
          icon: const Icon(Icons.videocam_outlined, size: 18),
          label: const Text('Join Now'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.orange,
            foregroundColor: AppColors.white,
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      );
    }

    if (liveClass.isScheduled) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.notifications_outlined, size: 18),
          label: const Text('Remind Me'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.darkBlue,
            side: const BorderSide(color: AppColors.border),
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      );
    }

    if (liveClass.isCompleted && liveClass.hasRecording) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _launchUrl(liveClass.recordingUrl!),
          icon: const Icon(Icons.play_circle_outline, size: 18),
          label: const Text('Watch Recording'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.darkBlue,
            foregroundColor: AppColors.white,
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      );
    }

    if (liveClass.isCancelled) {
      return Center(
        child: Text(
          'This class was cancelled',
          style: AppTypography.bodySmall.copyWith(color: AppColors.gray),
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
