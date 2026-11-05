import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/doubt_provider.dart';
import '../../core/services/doubt_service.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import 'widgets/doubt_tile.dart';

/// Every doubt the student has asked, most recent activity first so a fresh
/// answer is at the top. New doubts are asked from the lesson, where the
/// question has its context.
class MyDoubtsScreen extends ConsumerWidget {
  const MyDoubtsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doubts = ref.watch(myDoubtsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('My Doubts')),
      body: RefreshIndicator(
        color: AppColors.orange,
        onRefresh: () async => ref.invalidate(myDoubtsProvider),
        child: doubts.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.orange),
          ),
          error: (error, _) => _Empty(
            icon: Icons.error_outline_rounded,
            title: 'Could not load your doubts',
            body: error is DoubtException
                ? error.message
                : 'Pull down to try again.',
          ),
          data: (list) => list.isEmpty
              ? const _Empty(
                  icon: Icons.question_answer_outlined,
                  title: 'No doubts yet',
                  body: 'When something in a lesson does not make sense, tap '
                      '"Ask a doubt" under the video or in the reader. Your '
                      "teacher's answer will show up here.",
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, index) =>
                      DoubtTile(doubt: list[index], showLesson: true),
                ),
        ),
      ),
    );
  }
}

/// Scrollable so pull-to-refresh works on an empty or failed list too.
class _Empty extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _Empty({required this.icon, required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(32, 96, 32, 32),
      children: [
        Icon(
          icon,
          size: 56,
          color: AppColors.textSecondary.withValues(alpha: 0.5),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          textAlign: TextAlign.center,
          style: AppTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        Text(body, textAlign: TextAlign.center, style: AppTypography.bodySmall),
      ],
    );
  }
}
