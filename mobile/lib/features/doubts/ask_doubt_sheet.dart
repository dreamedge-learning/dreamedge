import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/logging/app_log.dart';
import '../../core/providers/doubt_provider.dart';
import '../../core/services/doubt_service.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import 'widgets/doubt_composer.dart';
import 'widgets/lesson_doubts_section.dart';

/// Mirrors the database's `doubts_body_length`.
const int doubtMinLength = 5;

/// Opens the "Ask a doubt" form over the current screen.
///
/// A sheet rather than a new screen so the video stays where it was paused:
/// the student is asking about the thing in front of them.
Future<void> showAskDoubtSheet(
  BuildContext context, {
  required String contentId,
  required String lessonTitle,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.background,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => _AskDoubtSheet(
      contentId: contentId,
      lessonTitle: lessonTitle,
    ),
  );
}

/// The student's doubts on one lesson, with the button to ask another. Used
/// by the reader, which has no room below the page for the inline section
/// the player shows.
Future<void> showLessonDoubtsSheet(
  BuildContext context, {
  required String contentId,
  required String lessonTitle,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.background,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.35,
      maxChildSize: 0.92,
      builder: (_, scrollController) => SingleChildScrollView(
        controller: scrollController,
        child: SafeArea(
          top: false,
          child: LessonDoubtsSection(
            contentId: contentId,
            lessonTitle: lessonTitle,
          ),
        ),
      ),
    ),
  );
}

class _AskDoubtSheet extends ConsumerWidget {
  final String contentId;
  final String lessonTitle;

  const _AskDoubtSheet({required this.contentId, required this.lessonTitle});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      // Lifts the form above the keyboard.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Ask a doubt', style: AppTypography.heading3),
              const SizedBox(height: 4),
              Text(
                lessonTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.caption,
              ),
              const SizedBox(height: 6),
              Text(
                'Only you and your teachers will see this. You will get a '
                'notification when a teacher replies.',
                style: AppTypography.bodySmall,
              ),
              const SizedBox(height: 14),
              DoubtComposer(
                hint: 'What did you not understand? Mention the step or the '
                    'time in the video. You can add a photo of your notebook.',
                submitLabel: 'Send',
                minLength: doubtMinLength,
                autofocus: true,
                onSubmit: (body, photo) => _send(context, ref, body, photo),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<String?> _send(
    BuildContext context,
    WidgetRef ref,
    String body,
    DoubtPhoto? photo,
  ) async {
    // Taken before the await: by the time the doubt is saved this sheet is
    // about to close, and its context with it.
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final service = ref.read(doubtServiceProvider);

    try {
      final id = await service.ask(
        contentItemId: contentId,
        body: body,
        photo: photo,
      );
      invalidateDoubts(container, contentId: contentId);
      // Only close the sheet if it is still the thing on screen; popping
      // after the student dragged it away would close the lesson instead.
      if (context.mounted) navigator.pop();
      messenger.showSnackBar(
        SnackBar(
          content: const Text('Doubt sent. Your teacher will reply soon.'),
          action: SnackBarAction(
            label: 'View',
            textColor: AppColors.orange,
            onPressed: () => router.push('/doubts/$id'),
          ),
        ),
      );
      return null;
    } on DoubtException catch (e) {
      return e.message;
    } catch (e) {
      logDebug('doubts', 'Asking a doubt failed: ${e.runtimeType}');
      return 'Something went wrong. Please check your connection and try '
          'again.';
    }
  }
}
