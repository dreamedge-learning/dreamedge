import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';

import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import 'controller/player_controller.dart';
import 'widgets/content_info_section.dart';
import 'widgets/player_controls.dart';
import 'widgets/player_gesture_layer.dart';
import 'widgets/video_placeholder.dart';

/// The lesson player.
///
/// The video surface, the gesture layer and the controls are three stacked
/// layers in a fixed order: the surface draws, the gestures sit on top of it,
/// and the controls sit on top of those so a button press is never read as a
/// tap on the video.
class VideoPlayerScreen extends ConsumerStatefulWidget {
  final String contentId;

  const VideoPlayerScreen({super.key, required this.contentId});

  @override
  ConsumerState<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends ConsumerState<VideoPlayerScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      final controller =
          ref.read(playerControllerProvider(widget.contentId));
      // Going to the background is the last chance to record where the student
      // got to: the OS may never hand us another frame, and a lesson watched
      // to minute 40 that resumes at minute 20 is worse than no resume at all.
      controller.flushProgress();
      if (controller.isPlaying) controller.pause();
    }
  }

  /// Landscape means full screen, which is what a student turning the phone is
  /// asking for. Turning it back is the way out.
  void _syncOrientation(PlayerController controller, Orientation orientation) {
    final wantsFullscreen = orientation == Orientation.landscape;
    if (controller.fullscreen == wantsFullscreen) return;

    // After the frame: this runs during build, and setting the system UI mode
    // rebuilds.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) controller.setFullscreen(wantsFullscreen);
    });
  }

  void _openLesson(String contentId) {
    context.pushReplacement('/player/$contentId');
  }

  void _leave(PlayerController controller) {
    if (controller.fullscreen) {
      controller.setFullscreen(false);
      return;
    }
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(playerControllerProvider(widget.contentId));
    final orientation = MediaQuery.orientationOf(context);
    _syncOrientation(controller, orientation);

    // The countdown finished and nobody stopped it. Navigating has to wait
    // until this frame is on screen, or the route changes mid-build.
    final next = controller.nextLesson;
    if (controller.autoNextDue && next != null) {
      controller.consumeAutoNext();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openLesson(next.id);
      });
    }

    if (controller.fullscreen) {
      return Scaffold(
        backgroundColor: AppColors.black,
        body: _buildStage(controller, fill: true),
      );
    }

    return PopScope(
      canPop: true,
      child: Scaffold(
        backgroundColor: AppColors.white,
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              AspectRatio(aspectRatio: 16 / 9, child: _buildStage(controller)),
              Expanded(child: _buildBelowStage(controller)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBelowStage(PlayerController controller) {
    final content = controller.content;
    if (content == null) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.orange),
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ContentInfoSection(content: content),
          _buildLessonNav(controller),
        ],
      ),
    );
  }

  Widget _buildLessonNav(PlayerController controller) {
    final previous = controller.previousLesson;
    final next = controller.nextLesson;
    if (previous == null && next == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Row(
        children: [
          if (previous != null)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _openLesson(previous.id),
                icon: const Icon(Icons.skip_previous_rounded, size: 18),
                label: const Text('Previous'),
              ),
            ),
          if (previous != null && next != null) const SizedBox(width: 12),
          if (next != null)
            Expanded(
              child: FilledButton.icon(
                onPressed: () => _openLesson(next.id),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.orange,
                ),
                icon: const Icon(Icons.skip_next_rounded, size: 18),
                label: const Text('Next'),
              ),
            ),
        ],
      ),
    );
  }

  /// The video area, whatever it currently holds.
  Widget _buildStage(PlayerController controller, {bool fill = false}) {
    switch (controller.phase) {
      case PlayerPhase.loading:
        return const VideoPlaceholder(state: PlaceholderState.loading);

      case PlayerPhase.processing:
        return _StageMessage(
          icon: Icons.hourglass_top_rounded,
          title: 'Still being prepared',
          body: controller.error ??
              'This lesson is being processed. Please check back shortly.',
          actionLabel: 'Check again',
          onAction: controller.retry,
        );

      case PlayerPhase.limitReached:
        return _StageMessage(
          icon: Icons.replay_circle_filled_rounded,
          title: "You've reached the replay limit for this lesson",
          body: controller.playLimit > 0
              ? 'This lesson can be played ${controller.playLimit} '
                  '${controller.playLimit == 1 ? 'time' : 'times'}. '
                  'Contact your mentor if you need another look.'
              : 'Contact your mentor if you need another look.',
        );

      case PlayerPhase.failed:
        return _StageMessage(
          icon: Icons.error_outline_rounded,
          title: 'Could not play this lesson',
          body: controller.error ?? 'Something went wrong.',
          actionLabel: 'Retry',
          onAction: controller.retry,
        );

      case PlayerPhase.askingToResume:
        return _ResumePrompt(controller: controller);

      case PlayerPhase.ready:
        return _buildVideo(controller, fill: fill);
    }
  }

  Widget _buildVideo(PlayerController controller, {required bool fill}) {
    final video = controller.video;
    if (video == null) {
      return const VideoPlaceholder(state: PlaceholderState.loading);
    }

    return ColoredBox(
      color: AppColors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: fill
                ? AspectRatio(
                    aspectRatio: video.value.aspectRatio,
                    child: VideoPlayer(video),
                  )
                : VideoPlayer(video),
          ),

          // A spinner only while the platform says it is waiting on data, so a
          // paused video does not look busy.
          if (controller.isBuffering)
            const Center(
              child: SizedBox(
                width: 34,
                height: 34,
                child: CircularProgressIndicator(
                  color: AppColors.orange,
                  strokeWidth: 3,
                ),
              ),
            ),

          PlayerGestureLayer(controller: controller),

          PlayerControls(
            controller: controller,
            onBack: () => _leave(controller),
            onOpenLesson: _openLesson,
          ),

          if (controller.isCompleted) _EndCard(controller: controller),
        ],
      ),
    );
  }
}

/// Offered before playing rather than jumping straight in.
///
/// A student who finished the lesson yesterday and opened it again today
/// usually wants the beginning, and silently seeking to minute 38 reads as a
/// bug rather than a convenience.
class _ResumePrompt extends StatelessWidget {
  final PlayerController controller;

  const _ResumePrompt({required this.controller});

  @override
  Widget build(BuildContext context) {
    final at = Duration(seconds: controller.resumeFromSeconds);

    return ColoredBox(
      color: AppColors.darkBlue,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'You stopped at ${formatClock(at)}',
                style: AppTypography.bodyMedium
                    .copyWith(color: AppColors.white),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                alignment: WrapAlignment.center,
                children: [
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.orange,
                    ),
                    onPressed: controller.resumeFromSaved,
                    child: Text('Resume from ${formatClock(at)}'),
                  ),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.white,
                      side: BorderSide(
                        color: AppColors.white.withValues(alpha: 0.5),
                      ),
                    ),
                    onPressed: controller.startOver,
                    child: const Text('Start over'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// What shows when a lesson finishes: the next one, on a countdown the student
/// can stop.
class _EndCard extends StatelessWidget {
  final PlayerController controller;

  const _EndCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    final next = controller.nextLesson;
    final seconds = controller.autoNextSeconds;

    return ColoredBox(
      color: AppColors.black.withValues(alpha: 0.82),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle_rounded,
                  color: AppColors.success, size: 40),
              const SizedBox(height: 12),
              Text(
                'Lesson complete',
                style: AppTypography.bodyLarge.copyWith(
                  color: AppColors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                alignment: WrapAlignment.center,
                children: [
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.white,
                      side: BorderSide(
                        color: AppColors.white.withValues(alpha: 0.5),
                      ),
                    ),
                    onPressed: controller.startOver,
                    icon: const Icon(Icons.replay_rounded, size: 18),
                    label: const Text('Watch again'),
                  ),
                  if (next != null)
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.orange,
                      ),
                      onPressed: () => context
                          .pushReplacement('/player/${next.id}'),
                      icon: const Icon(Icons.skip_next_rounded, size: 18),
                      label: Text(
                        seconds > 0
                            ? 'Next lesson in $seconds'
                            : 'Next lesson',
                      ),
                    ),
                ],
              ),
              if (next != null && seconds > 0) ...[
                const SizedBox(height: 10),
                TextButton(
                  onPressed: controller.cancelAutoNext,
                  child: Text(
                    'Cancel',
                    style: AppTypography.caption
                        .copyWith(color: AppColors.white),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A full-stage message for the states where there is nothing to play.
class _StageMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _StageMessage({
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.darkBlue,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppColors.white, size: 36),
              const SizedBox(height: 12),
              Text(
                title,
                textAlign: TextAlign.center,
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                body,
                textAlign: TextAlign.center,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.white.withValues(alpha: 0.78),
                ),
              ),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 16),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.orange,
                  ),
                  onPressed: onAction,
                  child: Text(actionLabel!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
