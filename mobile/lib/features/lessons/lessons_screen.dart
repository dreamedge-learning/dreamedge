import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/content.dart';
import '../../core/providers/content_provider.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';
import 'widgets/lesson_tile.dart';

class LessonsScreen extends ConsumerWidget {
  final String topicId;
  final String topicName;

  const LessonsScreen({
    super.key,
    required this.topicId,
    required this.topicName,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contentsAsync = ref.watch(topicContentsProvider(topicId));

    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(
          topicName,
          style: AppTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600),
        ),
        centerTitle: false,
      ),
      body: contentsAsync.when(
        data: (contents) {
          if (contents.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.video_library_outlined,
                        size: 64, color: AppColors.gray.withValues(alpha: 0.5)),
                    const SizedBox(height: 16),
                    Text(
                      'No lessons available yet',
                      style: AppTypography.bodyLarge
                          .copyWith(color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Lessons for this topic will appear here once added.',
                      style: AppTypography.bodySmall
                          .copyWith(color: AppColors.gray),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.only(top: 8, bottom: 24),
            itemCount: contents.length,
            itemBuilder: (context, index) {
              final lesson = contents[index];
              return LessonTile(
                content: lesson,
                index: index,
                onTap: () => _onLessonTap(context, lesson),
              );
            },
          );
        },
        loading: () => _buildShimmer(),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline_rounded,
                    size: 48, color: AppColors.error),
                const SizedBox(height: 16),
                Text(
                  'Could not load lessons',
                  style: AppTypography.bodyLarge
                      .copyWith(color: AppColors.textPrimary),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(topicContentsProvider(topicId)),
                  child: Text(
                    'Retry',
                    style: AppTypography.button
                        .copyWith(color: AppColors.orange),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _onLessonTap(BuildContext context, Content content) {
    if (content.hasVideo) {
      context.push('/player/${content.id}');
      return;
    }

    final message = content.isVideo
        ? 'This video is not ready to stream yet'
        : '${content.type.label} is not supported in the app yet';

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Widget _buildShimmer() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: 6,
      itemBuilder: (context, index) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(
          children: [
            const ShimmerBox(width: 36, height: 36, borderRadius: 18),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  ShimmerBox(width: double.infinity, height: 14),
                  SizedBox(height: 8),
                  ShimmerBox(width: 80, height: 10),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
