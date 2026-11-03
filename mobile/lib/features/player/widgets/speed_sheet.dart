import 'package:flutter/material.dart';

import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../controller/player_controller.dart';

/// '1.5' rather than '1.50', and '1' rather than '1.0'.
String formatSpeed(double speed) {
  final text = speed.toStringAsFixed(2);
  if (text.endsWith('00')) return text.substring(0, text.length - 3);
  if (text.endsWith('0')) return text.substring(0, text.length - 1);
  return text;
}

/// Playback speed. 1.5x is how most students get through a revision pass, so
/// the list runs well past it in both directions.
class SpeedSheet extends StatelessWidget {
  final double current;
  final ValueChanged<double> onSelected;

  const SpeedSheet({
    super.key,
    required this.current,
    required this.onSelected,
  });

  static Future<void> show(
    BuildContext context, {
    required double current,
    required ValueChanged<double> onSelected,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SpeedSheet(current: current, onSelected: onSelected),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            child: Text('Playback speed', style: AppTypography.heading3),
          ),
          for (final speed in PlayerController.speeds)
            ListTile(
              dense: true,
              title: Text(
                speed == 1.0 ? 'Normal' : '${formatSpeed(speed)}x',
                style: AppTypography.bodyMedium.copyWith(
                  fontWeight:
                      speed == current ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
              trailing: speed == current
                  ? const Icon(Icons.check_rounded,
                      color: AppColors.orange, size: 20)
                  : null,
              onTap: () {
                onSelected(speed);
                Navigator.of(context).pop();
              },
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
