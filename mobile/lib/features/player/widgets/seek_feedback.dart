import 'package:flutter/material.dart';

import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// The ripple and badge a double-tap seek leaves behind.
///
/// It sits on the half of the screen that was tapped, so the student can see
/// which way they went without reading anything, and the total accumulates
/// while the taps keep coming: four quick taps should say "−20 seconds", not
/// flash "−5" four times.
class SeekFeedback extends StatelessWidget {
  final Duration amount;
  final bool forward;

  const SeekFeedback({
    super.key,
    required this.amount,
    required this.forward,
  });

  @override
  Widget build(BuildContext context) {
    final seconds = amount.inSeconds.abs();

    // Zero is drawn, not hidden. It is reached by a student correcting
    // themselves -- a forward double-tap and then a backward one -- and
    // disappearing at exactly the moment they undo their own seek is the one
    // time the feedback is most confusing to lose. The side comes from the
    // last tap, so the panel stays where their thumb is.
    final label = seconds == 0
        ? '0 seconds'
        : '${forward ? '+' : '−'}$seconds seconds';

    return IgnorePointer(
      child: Align(
        alignment: forward ? Alignment.centerRight : Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: 0.5,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.black.withValues(alpha: 0.28),
              borderRadius: forward
                  ? const BorderRadius.horizontal(left: Radius.elliptical(140, 320))
                  : const BorderRadius.horizontal(right: Radius.elliptical(140, 320)),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  forward
                      ? Icons.fast_forward_rounded
                      : Icons.fast_rewind_rounded,
                  color: AppColors.white,
                  size: 34,
                ),
                const SizedBox(height: 6),
                Text(
                  label,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The transient readout for a brightness or volume drag.
class VerticalDragIndicator extends StatelessWidget {
  final IconData icon;
  final double value;
  final String label;

  const VerticalDragIndicator({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.black.withValues(alpha: 0.72),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppColors.white, size: 26),
              const SizedBox(height: 10),
              SizedBox(
                width: 110,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(
                    value: value.clamp(0.0, 1.0),
                    minHeight: 4,
                    backgroundColor: AppColors.white.withValues(alpha: 0.25),
                    valueColor:
                        const AlwaysStoppedAnimation<Color>(AppColors.orange),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: AppTypography.caption.copyWith(color: AppColors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
