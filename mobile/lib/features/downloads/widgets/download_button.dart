import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/content.dart';
import '../../../core/offline/byte_format.dart';
import '../../../core/offline/download_manager.dart';
import '../../../core/offline/download_record.dart';
import '../../../core/offline/server_clock.dart';
import '../../../core/providers/offline_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../../reader/pdf_reader_screen.dart';

/// The one control for saving a lesson to the device.
///
/// It is the same widget on a lesson tile and in the player, because it is the
/// same question, and a student who has learned what the ring means in one
/// place should not have to learn it again in the other.
///
/// It renders nothing at all when the lesson is not available offline. An
/// always-visible button that refuses when pressed teaches the student
/// nothing except not to press it.
class DownloadButton extends ConsumerWidget {
  final Content content;
  final double size;

  const DownloadButton({super.key, required this.content, this.size = 38});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!content.canDownload) return const SizedBox.shrink();

    final record = ref.watch(downloadRecordProvider(content.id));
    final status = record?.status;

    return SizedBox(
      width: size,
      height: size,
      child: switch (status) {
        null || DownloadStatus.expired => _Idle(
          content: content,
          expired: status == DownloadStatus.expired,
        ),
        DownloadStatus.queued ||
        DownloadStatus.downloading ||
        DownloadStatus.paused => _InFlight(record: record!),
        DownloadStatus.done => _Done(content: content, record: record!),
        DownloadStatus.failed => _Failed(content: content),
      },
    );
  }
}

/// Starts a download. Asks for notification permission on the way, because
/// this is the moment a progress notification becomes worth having.
Future<void> _start(
  BuildContext context,
  WidgetRef ref,
  Content content,
) async {
  await ref.read(downloadNotifierProvider).ensurePermission();

  try {
    await ref.read(downloadManagerProvider).enqueue(content);
  } on DownloadRefused catch (refused) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(refused.message)));
  }
}

class _Idle extends ConsumerWidget {
  final Content content;
  final bool expired;

  const _Idle({required this.content, required this.expired});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      tooltip: expired ? 'Expired — download again' : 'Save for offline',
      icon: Icon(
        expired ? Icons.cloud_off_rounded : Icons.cloud_download_outlined,
        size: 21,
        color: expired ? AppColors.error : AppColors.gray,
      ),
      onPressed: () => _start(context, ref, content),
    );
  }
}

class _InFlight extends ConsumerWidget {
  final DownloadRecord record;

  const _InFlight({required this.record});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final paused = record.status == DownloadStatus.paused;
    final manager = ref.read(downloadManagerProvider);

    return Tooltip(
      message: paused
          ? 'Paused — ${formatBytes(record.bytesDone)} saved'
          : 'Saving… ${(record.fraction * 100).round()}%',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => paused
            ? manager.resume(record.contentItemId)
            : manager.pause(record.contentItemId),
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                // Indeterminate until the server has said how big the file is;
                // a ring stuck at zero reads as broken.
                value: record.bytesTotal > 0 ? record.fraction : null,
                strokeWidth: 2.4,
                backgroundColor: AppColors.border,
                valueColor: AlwaysStoppedAnimation<Color>(
                  paused ? AppColors.gray : AppColors.orange,
                ),
              ),
            ),
            Icon(
              paused ? Icons.play_arrow_rounded : Icons.pause_rounded,
              size: 11,
              color: AppColors.textPrimary,
            ),
          ],
        ),
      ),
    );
  }
}

class _Done extends ConsumerWidget {
  final Content content;
  final DownloadRecord record;

  const _Done({required this.content, required this.record});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reading =
        ref.watch(clockReadingProvider).valueOrNull ??
        ClockReading.untrusted();
    final locked = !record.isLicenceValidAt(reading);

    return IconButton(
      visualDensity: VisualDensity.compact,
      tooltip: locked
          ? 'Connect once to keep watching'
          : 'Saved on this device',
      icon: Icon(
        locked ? Icons.lock_clock_rounded : Icons.download_done_rounded,
        size: 21,
        color: locked ? AppColors.error : AppColors.success,
      ),
      onPressed: () => showDownloadSheet(context, ref, content, record),
    );
  }
}

class _Failed extends ConsumerWidget {
  final Content content;

  const _Failed({required this.content});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      tooltip: 'Download failed — try again',
      icon: const Icon(
        Icons.error_outline_rounded,
        size: 21,
        color: AppColors.error,
      ),
      onPressed: () => _start(context, ref, content),
    );
  }
}

/// What a finished download offers: play it, or get the space back.
Future<void> showDownloadSheet(
  BuildContext context,
  WidgetRef ref,
  Content content,
  DownloadRecord record,
) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (sheetContext) {
      final locked = !record.isLicenceValidAt(
        ref.read(clockReadingProvider).valueOrNull ??
            ClockReading.untrusted(),
      );

      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
              child: Text(content.title, style: AppTypography.heading3),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Text(
                [
                  formatBytes(record.bytesDone),
                  if (record.quality != null) '${record.quality}p',
                  formatLicenceRemaining(record.licenceExpiresAt),
                ].join(' · '),
                style: AppTypography.bodySmall,
              ),
            ),
            if (locked)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Text(
                  'Connect to the internet once to keep watching your '
                  'downloads.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.error,
                  ),
                ),
              ),
            ListTile(
              enabled: !locked,
              leading: const Icon(
                Icons.play_circle_fill_rounded,
                color: AppColors.orange,
              ),
              title: const Text('Play'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                context.push(routeForContent(content));
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline_rounded,
                color: AppColors.error,
              ),
              title: const Text('Delete download'),
              subtitle: Text(
                'Frees ${formatBytes(record.bytesDone)}',
                style: AppTypography.caption,
              ),
              onTap: () {
                Navigator.of(sheetContext).pop();
                ref.read(downloadManagerProvider).remove(record.contentItemId);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      );
    },
  );
}
