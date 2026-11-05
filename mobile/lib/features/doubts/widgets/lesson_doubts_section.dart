import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/doubt_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../ask_doubt_sheet.dart';
import 'doubt_tile.dart';

/// "Doubts on this lesson": the student's own questions on the lesson, and
/// the button to ask one.
///
/// Only the student's own: doubts are private between a student and the
/// teachers, so there is no class-wide Q&A to scroll through here.
class LessonDoubtsSection extends ConsumerWidget {
  final String contentId;
  final String lessonTitle;

  const LessonDoubtsSection({
    super.key,
    required this.contentId,
    required this.lessonTitle,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doubts = ref.watch(lessonDoubtsProvider(contentId));

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.question_answer_outlined,
                size: 20,
                color: AppColors.orange,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Doubts on this lesson',
                  style: AppTypography.bodyLarge.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              FilledButton.icon(
                onPressed: () => showAskDoubtSheet(
                  context,
                  contentId: contentId,
                  lessonTitle: lessonTitle,
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.orange,
                  foregroundColor: AppColors.white,
                  visualDensity: VisualDensity.compact,
                ),
                icon: const Icon(Icons.help_outline_rounded, size: 18),
                label: const Text('Ask a doubt'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Only you and your teachers can see these.',
            style: AppTypography.caption,
          ),
          const SizedBox(height: 12),
          doubts.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.orange,
                  ),
                ),
              ),
            ),
            error: (_, _) => Row(
              children: [
                Expanded(
                  child: Text(
                    'Your doubts could not be loaded.',
                    style: AppTypography.bodySmall,
                  ),
                ),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(lessonDoubtsProvider(contentId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
            data: (list) {
              if (list.isEmpty) {
                return Text(
                  'Stuck on something in this lesson? Ask your teacher - no '
                  'question is too small.',
                  style: AppTypography.bodySmall,
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final doubt in list) ...[
                    DoubtTile(doubt: doubt),
                    const SizedBox(height: 10),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
