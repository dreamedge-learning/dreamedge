import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/doubt.dart';
import '../../../core/providers/doubt_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// One message in a doubt thread.
///
/// The student's own messages sit on the right, as in any chat app they
/// already use; a teacher's sit on the left with a cap icon, because "who
/// answered" is the point of the thread.
class DoubtMessageBubble extends StatelessWidget {
  final DoubtMessage message;

  const DoubtMessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final fromTeacher = message.fromTeacher;
    final bubble = Flexible(
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        decoration: BoxDecoration(
          color: fromTeacher
              ? AppColors.orange.withValues(alpha: 0.08)
              : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: fromTeacher
                ? AppColors.orange.withValues(alpha: 0.3)
                : AppColors.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                message.authorName,
                if (fromTeacher) 'Teacher',
                formatDoubtTime(message.createdAt),
              ].join(' · '),
              style: AppTypography.caption.copyWith(
                color: fromTeacher ? AppColors.orange : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            SelectableText(message.body, style: AppTypography.bodyMedium),
            if (message.imagePath != null) ...[
              const SizedBox(height: 8),
              DoubtPhotoView(path: message.imagePath!),
            ],
          ],
        ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment:
            fromTeacher ? MainAxisAlignment.start : MainAxisAlignment.end,
        children: fromTeacher
            ? [
                const CircleAvatar(
                  radius: 15,
                  backgroundColor: AppColors.orange,
                  child: Icon(
                    Icons.school_rounded,
                    size: 16,
                    color: AppColors.white,
                  ),
                ),
                const SizedBox(width: 8),
                bubble,
                const SizedBox(width: 32),
              ]
            : [
                const SizedBox(width: 40),
                bubble,
              ],
      ),
    );
  }
}

/// A photo from the private bucket, signed when it is drawn. Tapping opens
/// it full screen with pinch-to-zoom, since it is usually a page of working.
class DoubtPhotoView extends ConsumerWidget {
  final String path;

  const DoubtPhotoView({super.key, required this.path});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(doubtImageUrlProvider(path));

    return url.when(
      loading: () => const _PhotoPlaceholder(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.orange,
          ),
        ),
      ),
      error: (_, _) => const _PhotoPlaceholder(
        child: Icon(Icons.broken_image_outlined, color: AppColors.gray),
      ),
      data: (signed) {
        if (signed == null) {
          return const _PhotoPlaceholder(
            child: Icon(Icons.broken_image_outlined, color: AppColors.gray),
          );
        }
        return GestureDetector(
          onTap: () => _openFullScreen(context, signed),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.network(
              signed,
              height: 180,
              fit: BoxFit.cover,
              loadingBuilder: (_, child, progress) => progress == null
                  ? child
                  : const _PhotoPlaceholder(
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.orange,
                        ),
                      ),
                    ),
              errorBuilder: (_, _, _) => const _PhotoPlaceholder(
                child: Icon(Icons.broken_image_outlined, color: AppColors.gray),
              ),
            ),
          ),
        );
      },
    );
  }

  void _openFullScreen(BuildContext context, String url) {
    showDialog<void>(
      context: context,
      barrierColor: AppColors.black,
      builder: (dialogContext) => Stack(
        children: [
          Positioned.fill(
            child: InteractiveViewer(
              maxScale: 5,
              child: Center(child: Image.network(url)),
            ),
          ),
          Positioned(
            top: MediaQuery.paddingOf(dialogContext).top + 8,
            right: 8,
            child: IconButton(
              tooltip: 'Close',
              icon: const Icon(Icons.close_rounded, color: AppColors.white),
              onPressed: () => Navigator.of(dialogContext).pop(),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoPlaceholder extends StatelessWidget {
  final Widget child;

  const _PhotoPlaceholder({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 160,
      height: 120,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }
}
