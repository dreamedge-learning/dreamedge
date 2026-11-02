import 'package:flutter/material.dart';

import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../controller/player_controller.dart';
import 'quality_sheet.dart';
import 'speed_sheet.dart';

String formatClock(Duration value) {
  final seconds = value.inSeconds.clamp(0, 86400);
  final hours = seconds ~/ 3600;
  final minutes = (seconds % 3600) ~/ 60;
  final rest = seconds % 60;

  final mm = minutes.toString().padLeft(hours > 0 ? 2 : 1, '0');
  final ss = rest.toString().padLeft(2, '0');
  return hours > 0 ? '$hours:$mm:$ss' : '$mm:$ss';
}

/// The whole control layer: the bars, the buttons and the scrubber.
///
/// It fades as one thing rather than per-element, so the video is never
/// half-covered, and it is wrapped in [IgnorePointer] when hidden so a tap
/// meant for the gesture layer underneath is not swallowed by an invisible
/// button.
class PlayerControls extends StatelessWidget {
  final PlayerController controller;
  final VoidCallback onBack;
  final ValueChanged<String> onOpenLesson;

  const PlayerControls({
    super.key,
    required this.controller,
    required this.onBack,
    required this.onOpenLesson,
  });

  @override
  Widget build(BuildContext context) {
    final visible = controller.controlsVisible;

    return IgnorePointer(
      ignoring: !visible,
      child: AnimatedOpacity(
        opacity: visible ? 1 : 0,
        duration: const Duration(milliseconds: 180),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.black.withValues(alpha: 0.55),
                Colors.transparent,
                Colors.transparent,
                AppColors.black.withValues(alpha: 0.65),
              ],
              stops: const [0, 0.28, 0.6, 1],
            ),
          ),
          child: controller.locked
              ? _buildLocked(context)
              : Column(
                  children: [
                    _buildTopBar(context),
                    const Spacer(),
                    _buildCentreRow(context),
                    const Spacer(),
                    _buildBottomBar(context),
                  ],
                ),
        ),
      ),
    );
  }

  /// A locked player shows one button, because showing the rest would invite
  /// presses that are deliberately ignored.
  Widget _buildLocked(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: Padding(
        padding: const EdgeInsets.only(right: 12),
        child: _CircleButton(
          icon: Icons.lock_rounded,
          tooltip: 'Unlock controls',
          onPressed: controller.toggleLock,
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 8, 0),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded,
                  color: AppColors.white, size: 20),
              onPressed: onBack,
            ),
            Expanded(
              child: Text(
                controller.content?.title ?? '',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.white,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (controller.playingLocalCopy) const _DownloadChip(),
            IconButton(
              icon: const Icon(Icons.lock_open_rounded,
                  color: AppColors.white, size: 20),
              tooltip: 'Lock controls',
              onPressed: controller.toggleLock,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCentreRow(BuildContext context) {
    final previous = controller.previousLesson;
    final next = controller.nextLesson;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _CircleButton(
          icon: Icons.skip_previous_rounded,
          tooltip: 'Previous lesson',
          onPressed: previous == null ? null : () => onOpenLesson(previous.id),
        ),
        const SizedBox(width: 10),
        _CircleButton(
          icon: Icons.replay_5_rounded,
          tooltip: 'Back 5 seconds',
          onPressed: () => controller.nudge(false),
        ),
        const SizedBox(width: 14),
        _CircleButton(
          icon: controller.isPlaying
              ? Icons.pause_rounded
              : Icons.play_arrow_rounded,
          tooltip: controller.isPlaying ? 'Pause' : 'Play',
          size: 58,
          iconSize: 34,
          filled: true,
          onPressed: controller.togglePlay,
        ),
        const SizedBox(width: 14),
        _CircleButton(
          icon: Icons.forward_5_rounded,
          tooltip: 'Forward 5 seconds',
          onPressed: () => controller.nudge(true),
        ),
        const SizedBox(width: 10),
        _CircleButton(
          icon: Icons.skip_next_rounded,
          tooltip: 'Next lesson',
          onPressed: next == null ? null : () => onOpenLesson(next.id),
        ),
      ],
    );
  }

  Widget _buildBottomBar(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
        child: Column(
          children: [
            _Scrubber(controller: controller),
            Row(
              children: [
                Text(
                  '${formatClock(controller.displayPosition)}'
                  ' / ${formatClock(controller.duration)}',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.white,
                    // The destination, not the position, so a drag reads as a
                    // drag rather than as a clock that will not stop moving.
                    fontWeight: controller.scrubTarget == null
                        ? FontWeight.w400
                        : FontWeight.w700,
                  ),
                ),
                const Spacer(),
                _TextButton(
                  label: controller.speed == 1.0
                      ? '1x'
                      : '${formatSpeed(controller.speed)}x',
                  onPressed: () => SpeedSheet.show(
                    context,
                    current: controller.speed,
                    onSelected: controller.setSpeed,
                  ),
                ),
                _TextButton(
                  label: controller.quality == kAutoQuality
                      ? 'Auto'
                      : '${controller.quality}p',
                  onPressed: () => QualitySheet.show(
                    context,
                    available: controller.availableQualities,
                    current: controller.quality,
                    playingLocalCopy: controller.playingLocalCopy,
                    onSelected: controller.setQuality,
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: Icon(
                    controller.fullscreen
                        ? Icons.fullscreen_exit_rounded
                        : Icons.fullscreen_rounded,
                    color: AppColors.white,
                    size: 22,
                  ),
                  tooltip: controller.fullscreen
                      ? 'Exit full screen'
                      : 'Full screen',
                  onPressed: controller.toggleFullscreen,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// The scrubber, with the buffered range drawn behind the played one.
///
/// A slider alone cannot show how much is ready to play, which on a slow line
/// is the difference between "it is loading" and "it has stopped". The stack
/// underneath the slider is what draws that.
/// The seek bar.
///
/// Stateless: the drag target lives on the controller, because the clock
/// beside this widget has to show it too.
class _Scrubber extends StatelessWidget {
  final PlayerController controller;

  const _Scrubber({required this.controller});

  @override
  Widget build(BuildContext context) {
    final total = controller.duration.inMilliseconds;
    if (total <= 0) {
      return const SizedBox(height: 28);
    }

    final bufferedFraction =
        (controller.buffered.inMilliseconds / total).clamp(0.0, 1.0);
    final value =
        (controller.displayPosition.inMilliseconds / total).clamp(0.0, 1.0);

    return SizedBox(
      height: 28,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Track and buffered range, inset to line up with the slider's own
          // horizontal padding.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: bufferedFraction,
                minHeight: 3,
                backgroundColor: AppColors.white.withValues(alpha: 0.22),
                valueColor: AlwaysStoppedAnimation<Color>(
                  AppColors.white.withValues(alpha: 0.42),
                ),
              ),
            ),
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 3,
              activeTrackColor: AppColors.orange,
              inactiveTrackColor: Colors.transparent,
              thumbColor: AppColors.orange,
              overlayColor: AppColors.orange.withValues(alpha: 0.18),
              thumbShape:
                  const RoundSliderThumbShape(enabledThumbRadius: 7),
              overlayShape:
                  const RoundSliderOverlayShape(overlayRadius: 16),
              // A continuous slider draws no value indicator unless it is
              // asked to, so `Slider.label` alone rendered nothing at all.
              // `onDrag` rather than the older `always`, which is deprecated
              // from 3.28 -- the default here has moved more than once, which
              // is why this is set explicitly rather than relied on.
              showValueIndicator: ShowValueIndicator.onDrag,
              valueIndicatorColor: AppColors.orange,
              valueIndicatorTextStyle: AppTypography.caption.copyWith(
                color: AppColors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: Slider(
              value: value,
              label: formatClock(
                Duration(milliseconds: (value * total).round()),
              ),
              divisions: null,
              onChanged: (next) => controller.scrubTo(
                Duration(milliseconds: (next * total).round()),
              ),
              onChangeEnd: (next) => controller.endScrub(
                Duration(milliseconds: (next * total).round()),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final double size;
  final double iconSize;
  final bool filled;

  const _CircleButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.size = 42,
    this.iconSize = 22,
    this.filled = false,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;

    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: size,
        height: size,
        child: Material(
          color: filled
              ? AppColors.orange
              : AppColors.black.withValues(alpha: 0.35),
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: Icon(
              icon,
              size: iconSize,
              color: enabled
                  ? AppColors.white
                  : AppColors.white.withValues(alpha: 0.35),
            ),
          ),
        ),
      ),
    );
  }
}

class _TextButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const _TextButton({required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        minimumSize: const Size(44, 32),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        visualDensity: VisualDensity.compact,
      ),
      child: Text(
        label,
        style: AppTypography.caption.copyWith(
          color: AppColors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Says why the video is playing without a connection, so a student who is
/// surprised to see it working knows it is their own download.
class _DownloadChip extends StatelessWidget {
  const _DownloadChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.download_done_rounded,
              size: 13, color: AppColors.white),
          const SizedBox(width: 5),
          Text(
            'Playing your download',
            style: AppTypography.caption.copyWith(
              color: AppColors.white,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }
}
