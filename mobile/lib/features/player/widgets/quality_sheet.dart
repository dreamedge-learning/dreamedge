import 'package:flutter/material.dart';

import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../controller/player_controller.dart';

/// Picks a resolution, or hands the choice back to the HLS ladder.
///
/// Auto is recommended and listed first because it is right for nearly
/// everyone: it drops to 240p on a bad line instead of stalling. The manual
/// rungs are there for the student who knows their data is metered and would
/// rather watch 360p all the way through than let the player reach for 1080p.
///
/// While a downloaded copy is playing there is one option, which is the
/// rendition that was downloaded. Offering the others would mean streaming,
/// which is the opposite of what the student asked for when they saved it.
class QualitySheet extends StatelessWidget {
  final List<String> available;
  final String current;
  final bool playingLocalCopy;
  final ValueChanged<String> onSelected;

  const QualitySheet({
    super.key,
    required this.available,
    required this.current,
    required this.playingLocalCopy,
    required this.onSelected,
  });

  static Future<void> show(
    BuildContext context, {
    required List<String> available,
    required String current,
    required bool playingLocalCopy,
    required ValueChanged<String> onSelected,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => QualitySheet(
        available: available,
        current: current,
        playingLocalCopy: playingLocalCopy,
        onSelected: onSelected,
      ),
    );
  }

  static String label(String quality) =>
      quality == kAutoQuality ? 'Auto (recommended)' : '${quality}p';

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            child: Text('Quality', style: AppTypography.heading3),
          ),
          if (playingLocalCopy)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Text(
                'Playing your download. Quality was set when you saved it.',
                style: AppTypography.bodySmall,
              ),
            ),
          if (available.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Text(
                'No other qualities are available for this lesson.',
                style: AppTypography.bodySmall,
              ),
            ),
          for (final quality in available)
            ListTile(
              dense: true,
              enabled: !playingLocalCopy,
              title: Text(
                label(quality),
                style: AppTypography.bodyMedium.copyWith(
                  fontWeight:
                      quality == current ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
              trailing: quality == current
                  ? const Icon(Icons.check_rounded,
                      color: AppColors.orange, size: 20)
                  : null,
              onTap: () {
                onSelected(quality);
                Navigator.of(context).pop();
              },
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
