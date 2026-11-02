import 'dart:async';

import 'package:flutter/material.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:volume_controller/volume_controller.dart';

import '../../../shared/theme/colors.dart';
import '../controller/player_controller.dart';
import 'seek_feedback.dart';

/// Every gesture that happens over the video surface.
///
/// It is one widget rather than several because the gestures overlap: a tap in
/// the left half is a seek only when it is the second of a pair, and a vertical
/// drag has to beat the tap recogniser to it. Flutter resolves that within a
/// single detector and fights about it across nested ones.
///
/// The screen's own controls sit above this, so none of it interferes with
/// pressing a button.
class PlayerGestureLayer extends StatefulWidget {
  final PlayerController controller;

  const PlayerGestureLayer({super.key, required this.controller});

  @override
  State<PlayerGestureLayer> createState() => _PlayerGestureLayerState();
}

enum _DragTarget { none, brightness, volume }

class _PlayerGestureLayerState extends State<PlayerGestureLayer> {
  static const Duration _indicatorLinger = Duration(milliseconds: 700);

  _DragTarget _target = _DragTarget.none;
  double _dragValue = 0;
  Timer? _indicatorTimer;

  bool _showPlayPulse = false;

  /// What the pulse should draw, captured at the moment of the tap.
  ///
  /// `controller.isPlaying` flips asynchronously, so reading it while the
  /// pulse draws can show the state we were in rather than the one the tap is
  /// taking us to.
  bool _pulseShowsPlaying = false;
  Timer? _pulseTimer;

  /// Which half the last double-tap landed in, so the ripple goes there.
  bool _lastSeekForward = true;

  @override
  void dispose() {
    _indicatorTimer?.cancel();
    _pulseTimer?.cancel();
    super.dispose();
  }

  bool _isRightHalf(Offset local, Size size) => local.dx > size.width / 2;

  /// The middle third, horizontally and vertically.
  ///
  /// Narrow enough that the double-tap seek zones keep most of the width, wide
  /// enough to hit without aiming.
  bool _isCentre(Offset local, Size size) {
    return local.dx > size.width / 3 &&
        local.dx < size.width * 2 / 3 &&
        local.dy > size.height / 3 &&
        local.dy < size.height * 2 / 3;
  }

  void _pulsePlayIcon({required bool playing}) {
    _pulseTimer?.cancel();
    setState(() {
      _pulseShowsPlaying = playing;
      _showPlayPulse = true;
    });
    _pulseTimer = Timer(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _showPlayPulse = false);
    });
  }

  void _armIndicatorTimer() {
    _indicatorTimer?.cancel();
    _indicatorTimer = Timer(_indicatorLinger, () {
      if (mounted) setState(() => _target = _DragTarget.none);
    });
  }

  Future<void> _beginDrag(Offset local, Size size) async {
    final isVolume = _isRightHalf(local, size);

    // Start from where the system actually is, or the first flick of the
    // finger would jump the brightness to wherever the gesture happens to
    // begin.
    try {
      final current = isVolume
          ? await VolumeController.instance.getVolume()
          : await ScreenBrightness.instance.application;
      if (!mounted) return;
      setState(() {
        _target = isVolume ? _DragTarget.volume : _DragTarget.brightness;
        _dragValue = current;
      });
    } catch (_) {
      // Either control can be unavailable -- a device with no brightness
      // permission, an emulator with no audio. Dropping the gesture is better
      // than showing an indicator that moves nothing.
      if (mounted) setState(() => _target = _DragTarget.none);
    }
  }

  Future<void> _updateDrag(double deltaY, Size size) async {
    if (_target == _DragTarget.none) return;

    // Up is more. A full swipe of the player's height covers the whole range,
    // which makes fine adjustment possible without the gesture feeling heavy.
    final next = (_dragValue - deltaY / size.height).clamp(0.0, 1.0);
    setState(() => _dragValue = next);

    try {
      if (_target == _DragTarget.volume) {
        await VolumeController.instance.setVolume(next);
      } else {
        await ScreenBrightness.instance.setApplicationScreenBrightness(next);
      }
    } catch (_) {
      // Swallowed on purpose: the drag is already drawn, and an exception
      // mid-gesture would leave the indicator stuck on screen.
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    // A locked player ignores everything. That is the point of the lock: a
    // phone propped against a book, a hand resting on the screen, and the
    // lesson should not jump twenty seconds.
    if (controller.locked) {
      return const SizedBox.expand();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapUp: (details) {
            // The middle of the surface is the play/pause target, the rest
            // shows and hides the controls. Both behaviours are wanted and a
            // single tap cannot do both, so the screen is split: a thumb
            // reaching for the centre means "stop", a tap near the edge means
            // "let me see the scrubber".
            if (_isCentre(details.localPosition, size)) {
              final willBePlaying = !controller.isPlaying;
              controller.togglePlay();
              _pulsePlayIcon(playing: willBePlaying);
            } else {
              controller.tapScreen();
            }
          },
          onDoubleTapDown: (details) {
            _lastSeekForward = _isRightHalf(details.localPosition, size);
          },
          onDoubleTap: () {
            controller.nudge(_lastSeekForward);
          },
          onVerticalDragStart: (details) =>
              _beginDrag(details.localPosition, size),
          onVerticalDragUpdate: (details) {
            _updateDrag(details.delta.dy, size);
            _armIndicatorTimer();
          },
          onVerticalDragEnd: (_) => _armIndicatorTimer(),
          onVerticalDragCancel: _armIndicatorTimer,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // The play/pause pulse the centre tap leaves behind, so a tap
              // that lands while the controls are hidden still acknowledges
              // itself.
              //
              // Always mounted, with the opacity driven to zero. It used to be
              // mounted at opacity 1 and removed by the timer, so the
              // AnimatedOpacity never animated anything -- the glyph popped in
              // and popped out again. IgnorePointer because a permanently
              // mounted circle in this Stack would otherwise swallow the very
              // centre taps it exists to acknowledge.
              Center(
                child: IgnorePointer(
                  child: AnimatedOpacity(
                    opacity: _showPlayPulse ? 1 : 0,
                    duration: const Duration(milliseconds: 160),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.black.withValues(alpha: 0.5),
                        shape: BoxShape.circle,
                      ),
                      // The affordance, not the state: a tap that pauses
                      // leaves a play glyph on the frozen frame, inviting the
                      // tap that resumes. The other way round flashed a pause
                      // icon over a video that had already stopped.
                      child: Icon(
                        _pulseShowsPlaying
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        color: AppColors.white,
                        size: 36,
                      ),
                    ),
                  ),
                ),
              ),

              if (controller.seekBadgeVisible)
                SeekFeedback(
                  amount: controller.seekBadge,
                  forward: controller.seekBadgeForward,
                ),

              if (_target == _DragTarget.brightness)
                VerticalDragIndicator(
                  icon: Icons.brightness_6_rounded,
                  value: _dragValue,
                  label: 'Brightness ${(_dragValue * 100).round()}%',
                ),

              if (_target == _DragTarget.volume)
                VerticalDragIndicator(
                  icon: _dragValue == 0
                      ? Icons.volume_off_rounded
                      : Icons.volume_up_rounded,
                  value: _dragValue,
                  label: 'Volume ${(_dragValue * 100).round()}%',
                ),
            ],
          ),
        );
      },
    );
  }
}
