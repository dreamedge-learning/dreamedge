import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/logging/app_log.dart';
import '../../core/models/doubt.dart';
import '../../core/providers/content_provider.dart';
import '../../core/providers/doubt_provider.dart';
import '../../core/providers/student_provider.dart';
import '../../core/services/doubt_service.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../reader/pdf_reader_screen.dart';
import 'widgets/doubt_composer.dart';
import 'widgets/doubt_message_bubble.dart';
import 'widgets/doubt_tile.dart';

/// One doubt and its replies, with a box to follow up.
///
/// This is where the "your doubt has been answered" notification lands
/// (`/doubts/:id`), so it stands on its own without the lesson around it.
class DoubtThreadScreen extends ConsumerWidget {
  final String doubtId;

  const DoubtThreadScreen({super.key, required this.doubtId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final thread = ref.watch(doubtThreadProvider(doubtId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Doubt')),
      body: thread.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.orange),
        ),
        error: (error, _) => _Message(
          icon: Icons.error_outline_rounded,
          text: error is DoubtException
              ? error.message
              : 'This doubt could not be loaded.',
          onRetry: () => ref.invalidate(doubtThreadProvider(doubtId)),
        ),
        data: (doubt) => doubt == null
            ? const _Message(
                icon: Icons.search_off_rounded,
                text: 'This doubt could not be found.',
              )
            : _ThreadBody(doubt: doubt),
      ),
    );
  }
}

class _ThreadBody extends ConsumerWidget {
  final Doubt doubt;

  const _ThreadBody({required this.doubt});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final studentName =
        ref.watch(currentStudentProvider).valueOrNull?.fullName ?? 'You';
    final messages = doubt.messagesFor(studentName);

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: AppColors.orange,
            onRefresh: () async =>
                ref.invalidate(doubtThreadProvider(doubt.id)),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              children: [
                _LessonHeader(doubt: doubt),
                const SizedBox(height: 16),
                for (final message in messages)
                  DoubtMessageBubble(message: message),
              ],
            ),
          ),
        ),
        Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: doubt.isClosed
                  ? Row(
                      children: [
                        const Icon(
                          Icons.lock_outline_rounded,
                          size: 18,
                          color: AppColors.gray,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Your teacher has closed this doubt. If you are '
                            'still stuck, ask a new one from the lesson.',
                            style: AppTypography.bodySmall,
                          ),
                        ),
                      ],
                    )
                  : DoubtComposer(
                      hint: 'Still confused? Reply to your teacher…',
                      submitLabel: 'Reply',
                      minLength: 1,
                      onSubmit: (body, photo) =>
                          _reply(context, ref, body, photo),
                    ),
            ),
          ),
        ),
      ],
    );
  }

  Future<String?> _reply(
    BuildContext context,
    WidgetRef ref,
    String body,
    DoubtPhoto? photo,
  ) async {
    final container = ProviderScope.containerOf(context, listen: false);
    final service = ref.read(doubtServiceProvider);

    try {
      await service.reply(doubtId: doubt.id, body: body, photo: photo);
      invalidateDoubts(
        container,
        contentId: doubt.contentItemId,
        doubtId: doubt.id,
      );
      return null;
    } on DoubtException catch (e) {
      return e.message;
    } catch (e) {
      logDebug('doubts', 'Replying to a doubt failed: ${e.runtimeType}');
      return 'Something went wrong. Please check your connection and try '
          'again.';
    }
  }
}

class _LessonHeader extends ConsumerWidget {
  final Doubt doubt;

  const _LessonHeader({required this.doubt});

  Future<void> _openLesson(BuildContext context, WidgetRef ref) async {
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final content =
          await ref.read(contentDetailProvider(doubt.contentItemId).future);
      router.push(routeForContent(content));
    } catch (e) {
      logDebug('doubts', 'Opening the lesson failed: ${e.runtimeType}');
      messenger.showSnackBar(
        const SnackBar(content: Text('This lesson could not be opened.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DoubtStatusChip(status: doubt.status),
          const SizedBox(height: 10),
          Text(
            doubt.lessonTitle ?? 'Lesson',
            style: AppTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600),
          ),
          if (doubt.courseTitle != null) ...[
            const SizedBox(height: 2),
            Text(doubt.courseTitle!, style: AppTypography.caption),
          ],
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: () => _openLesson(context, ref),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.orange,
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
            ),
            icon: const Icon(Icons.play_lesson_outlined, size: 18),
            label: const Text('Open the lesson'),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  final VoidCallback? onRetry;

  const _Message({required this.icon, required this.text, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.gray),
            const SizedBox(height: 12),
            Text(
              text,
              textAlign: TextAlign.center,
              style: AppTypography.bodyMedium,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              TextButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}
