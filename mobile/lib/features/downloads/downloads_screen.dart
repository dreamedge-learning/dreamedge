import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/offline/byte_format.dart';
import '../../core/offline/download_record.dart';
import '../../core/providers/offline_provider.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../reader/pdf_reader_screen.dart';
import 'widgets/download_button.dart';

/// Everything saved to this device.
///
/// This is the screen a student opens on a train, so it must work with the
/// radio off and must never need the network to draw. Every figure on it comes
/// from the local database.
class DownloadsScreen extends ConsumerWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lessons = ref.watch(downloadedLessonsProvider);
    final used = ref.watch(downloadedBytesProvider);

    return lessons.when(
      data: (items) {
        if (items.isEmpty) return const _Empty();

        final groups = _group(items);

        return ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            _Header(bytesUsed: used, itemCount: items.length),
            for (final group in groups) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
                child: Text(
                  group.title,
                  style: AppTypography.bodyMedium.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              for (final lesson in group.lessons) _DownloadRow(lesson: lesson),
            ],
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.error,
                  side: const BorderSide(color: AppColors.error),
                ),
                onPressed: () => _confirmClearAll(context, ref, used),
                icon: const Icon(Icons.delete_sweep_outlined, size: 18),
                label: const Text('Clear all downloads'),
              ),
            ),
          ],
        );
      },
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.orange),
      ),
      // The list comes from a local database, so a failure here is a bug on
      // this device rather than a network problem, and saying "check your
      // connection" would send the student chasing the wrong thing.
      error: (error, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Could not read your downloads.',
            style: AppTypography.bodyMedium,
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }

  /// Groups by topic, falling back to a single bucket.
  ///
  /// Course and subject would be the fuller hierarchy, but a download knows
  /// its topic for certain and its course only if the course was browsed on
  /// this device. Grouping by what is reliably known beats a tree with
  /// "Unknown course" in it.
  List<_Group> _group(List<DownloadedLesson> lessons) {
    final byTopic = <String, List<DownloadedLesson>>{};
    for (final lesson in lessons) {
      final key = lesson.content?.topicId ?? lesson.record.topicId ?? 'other';
      byTopic.putIfAbsent(key, () => []).add(lesson);
    }

    return byTopic.entries
        .map(
          (entry) => _Group(
            title: entry.value.length == 1
                ? '1 lesson'
                : '${entry.value.length} lessons',
            lessons: entry.value,
          ),
        )
        .toList();
  }

  Future<void> _confirmClearAll(
    BuildContext context,
    WidgetRef ref,
    int bytesUsed,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Clear all downloads?'),
        content: Text(
          'This removes every saved lesson from this device and frees '
          '${formatBytes(bytesUsed)}. You can download them again whenever '
          'you are online.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep them'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Clear all'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(downloadManagerProvider).removeAll();
    }
  }
}

class _Group {
  final String title;
  final List<DownloadedLesson> lessons;

  const _Group({required this.title, required this.lessons});
}

class _Header extends ConsumerWidget {
  final int bytesUsed;
  final int itemCount;

  const _Header({required this.bytesUsed, required this.itemCount});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wifiOnly = ref.watch(downloadSettingsProvider).wifiOnly;
    final online = ref.watch(isOnlineProvider);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(formatBytes(bytesUsed), style: AppTypography.heading2),
          const SizedBox(height: 2),
          Text(
            'used by $itemCount saved '
            '${itemCount == 1 ? 'lesson' : 'lessons'}',
            style: AppTypography.bodySmall,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                online ? Icons.cloud_done_outlined : Icons.cloud_off_rounded,
                size: 14,
                color: online ? AppColors.success : AppColors.gray,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  online
                      ? wifiOnly
                            ? 'New downloads use Wi-Fi only'
                            : 'New downloads may use mobile data'
                      : 'Offline — your saved lessons still play',
                  style: AppTypography.caption,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DownloadRow extends ConsumerWidget {
  final DownloadedLesson lesson;

  const _DownloadRow({required this.lesson});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final record = lesson.record;
    final content = lesson.content;
    final locked =
        record.status == DownloadStatus.done && !record.isLicenceValid;

    return ListTile(
      leading: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          record.isVideo
              ? Icons.play_circle_outline_rounded
              : Icons.menu_book_rounded,
          color: locked ? AppColors.gray : AppColors.orange,
        ),
      ),
      title: Text(
        lesson.title,
        style: AppTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(_subtitle(record), style: AppTypography.caption),
      trailing: content == null
          // Without the cached row there is nothing to play or re-download
          // from, so the only honest action is to free the space.
          ? IconButton(
              icon: const Icon(
                Icons.delete_outline_rounded,
                size: 20,
                color: AppColors.error,
              ),
              tooltip: 'Delete download',
              onPressed: () => ref
                  .read(downloadManagerProvider)
                  .remove(record.contentItemId),
            )
          : DownloadButton(content: content),
      onTap: content == null || locked || !record.isPlayable
          ? null
          : () => context.push(routeForContent(content)),
    );
  }

  String _subtitle(DownloadRecord record) {
    final parts = <String>[];

    switch (record.status) {
      case DownloadStatus.done:
        parts.add(formatBytes(record.bytesDone));
        if (record.quality != null) parts.add('${record.quality}p');
        parts.add(formatLicenceRemaining(record.licenceExpiresAt));
      case DownloadStatus.downloading:
        parts.add('Saving ${(record.fraction * 100).round()}%');
        if (record.bytesTotal > 0) {
          parts.add(
            '${formatBytes(record.bytesDone)} of '
            '${formatBytes(record.bytesTotal)}',
          );
        }
      case DownloadStatus.queued:
        parts.add('Waiting to start');
      case DownloadStatus.paused:
        parts.add('Paused');
        parts.add('${formatBytes(record.bytesDone)} saved');
      case DownloadStatus.failed:
        parts.add(record.error ?? 'Download failed');
      case DownloadStatus.expired:
        parts.add('No longer available offline');
    }

    return parts.join(' · ');
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_download_outlined,
              size: 64,
              color: AppColors.gray.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            Text(
              'Nothing saved yet',
              style: AppTypography.bodyLarge.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Tap the cloud icon on any lesson to keep it on this device. '
              'Saved lessons play without internet.',
              style: AppTypography.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
