import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/live_class.dart';
import '../../core/providers/live_class_provider.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import 'live_stream_screen.dart';

class LiveClassDetailScreen extends ConsumerWidget {
  final String classId;

  const LiveClassDetailScreen({super.key, required this.classId});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  /// Opens the right surface for whatever the class is pointing at.
  ///
  /// `in_app` with a meeting_url goes to the native stream screen -- a lean
  /// video_player attached to the HLS URL, no scrubber or quality menu, same
  /// 16:9 frame as the on-demand player. Everything else (Zoom, Google
  /// Meet, YouTube) opens in the external app, which is where those
  /// providers want to be anyway.
  void _joinLive(BuildContext context, LiveClass liveClass) {
    final url = liveClass.meetingUrl;
    if (url == null || url.isEmpty) return;

    if (liveClass.isInApp) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => LiveStreamScreen(
            title: liveClass.title,
            instructor: liveClass.instructorName,
            streamUrl: url,
          ),
        ),
      );
      return;
    }

    unawaited(_launchUrl(url));
  }

  /// Opens the course player for the edited rewatch when the admin has
  /// attached one, or falls back to the raw recording URL. The content
  /// item carries the signed URL, offline terms and progress tracking,
  /// so a deep-link here is better than a bare file.
  void _watchRewatch(BuildContext context, LiveClass liveClass) {
    final contentId = liveClass.rewatchContentId;
    if (contentId != null && contentId.isNotEmpty) {
      context.push('/player/$contentId');
      return;
    }
    final url = liveClass.recordingUrl;
    if (url != null && url.isNotEmpty) {
      unawaited(_launchUrl(url));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classAsync = ref.watch(liveClassDetailProvider(classId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Class Details', style: AppTypography.heading3),
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      body: classAsync.when(
        data: (liveClass) {
          if (liveClass == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline,
                      size: 48, color: AppColors.gray),
                  const SizedBox(height: 12),
                  Text(
                    'Class not found',
                    style: AppTypography.bodyLarge
                        .copyWith(color: AppColors.textSecondary),
                  ),
                ],
              ),
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: AppColors.darkBlue,
                      image: liveClass.thumbnailUrl != null
                          ? DecorationImage(
                              image: NetworkImage(liveClass.thumbnailUrl!),
                              fit: BoxFit.cover,
                            )
                          : null,
                    ),
                    child: liveClass.thumbnailUrl == null
                        ? Center(
                            child: Icon(
                              Icons.videocam_outlined,
                              size: 56,
                              color: AppColors.white.withValues(alpha: 0.4),
                            ),
                          )
                        : null,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildStatusBadge(liveClass.status),
                      const SizedBox(height: 12),
                      Text(liveClass.title, style: AppTypography.heading2),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 20,
                            backgroundColor: AppColors.darkBlue,
                            backgroundImage:
                                liveClass.instructorAvatarUrl != null
                                    ? NetworkImage(
                                        liveClass.instructorAvatarUrl!)
                                    : null,
                            child: liveClass.instructorAvatarUrl == null
                                ? Text(
                                    liveClass.instructorName.isNotEmpty
                                        ? liveClass.instructorName[0]
                                            .toUpperCase()
                                        : 'T',
                                    style: AppTypography.bodyMedium
                                        .copyWith(color: AppColors.white),
                                  )
                                : null,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            liveClass.instructorName,
                            style: AppTypography.bodyLarge
                                .copyWith(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _InfoRow(
                        icon: Icons.calendar_today_outlined,
                        label: liveClass.formattedDate,
                      ),
                      const SizedBox(height: 10),
                      _InfoRow(
                        icon: Icons.access_time_outlined,
                        label:
                            '${liveClass.formattedTime} (${liveClass.formattedDuration})',
                      ),
                      if (liveClass.description != null &&
                          liveClass.description!.isNotEmpty) ...[
                        const SizedBox(height: 20),
                        const Divider(color: AppColors.border),
                        const SizedBox(height: 16),
                        Text('About this class',
                            style: AppTypography.bodyLarge
                                .copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        Text(
                          liveClass.description!,
                          style: AppTypography.bodyMedium.copyWith(
                            color: AppColors.textSecondary,
                            height: 1.5,
                          ),
                        ),
                      ],
                      const SizedBox(height: 32),
                      _buildActionSection(context, liveClass),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Could not load class details',
                style: AppTypography.bodyMedium
                    .copyWith(color: AppColors.error),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    ref.invalidate(liveClassDetailProvider(classId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color bgColor;
    Color textColor;
    String label;
    IconData? icon;

    switch (status) {
      case 'live':
        bgColor = AppColors.error.withValues(alpha: 0.1);
        textColor = AppColors.error;
        label = 'LIVE NOW';
        icon = null;
      case 'scheduled':
        bgColor = const Color(0xFF3B82F6).withValues(alpha: 0.1);
        textColor = const Color(0xFF3B82F6);
        label = 'Scheduled';
        icon = Icons.event_outlined;
      case 'ended':
        bgColor = AppColors.success.withValues(alpha: 0.1);
        textColor = AppColors.success;
        label = 'Ended';
        icon = Icons.check_circle_outline;
      default:
        bgColor = AppColors.gray.withValues(alpha: 0.1);
        textColor = AppColors.gray;
        label = 'Cancelled';
        icon = Icons.cancel_outlined;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (status == 'live') ...[
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: AppColors.error,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
          ],
          if (icon != null) ...[
            Icon(icon, size: 14, color: textColor),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: AppTypography.caption.copyWith(
              color: textColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionSection(BuildContext context, LiveClass liveClass) {
    if (liveClass.canJoin) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _joinLive(context, liveClass),
          icon: const Icon(Icons.videocam_outlined, size: 20),
          label: Text(liveClass.isInApp
              ? 'Join live class'
              : 'Open meeting'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.orange,
            foregroundColor: AppColors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            textStyle:
                AppTypography.button.copyWith(fontSize: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      );
    }

    if (liveClass.isScheduled) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Icon(Icons.event_outlined,
                size: 32, color: AppColors.textSecondary),
            const SizedBox(height: 8),
            Text(
              'Class starts at ${liveClass.formattedTime}',
              style: AppTypography.bodyLarge.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              liveClass.formattedDate,
              style: AppTypography.bodySmall,
            ),
          ],
        ),
      );
    }

    if (liveClass.isEnded && liveClass.hasRecording) {
      final hasEditedRewatch = liveClass.rewatchContentId != null &&
          liveClass.rewatchContentId!.isNotEmpty;
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _watchRewatch(context, liveClass),
          icon: const Icon(Icons.play_circle_outline, size: 20),
          label: Text(hasEditedRewatch
              ? 'Watch rewatch'
              : 'Watch recording'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.darkBlue,
            foregroundColor: AppColors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            textStyle:
                AppTypography.button.copyWith(fontSize: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      );
    }

    if (liveClass.isCancelled) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cancel_outlined, size: 20, color: AppColors.gray),
            const SizedBox(width: 8),
            Text(
              'This class has been cancelled',
              style: AppTypography.bodyMedium
                  .copyWith(color: AppColors.gray),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Text(label, style: AppTypography.bodyMedium),
      ],
    );
  }
}
