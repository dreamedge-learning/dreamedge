import 'package:flutter/material.dart';

import '../../../shared/theme/colors.dart';

/// The 16:9 dark panel the player shows while there is nothing to draw yet.
///
/// Loading only. It used to carry `error` and `unavailable` states and an
/// `onRetry` button, none of which any caller ever passed: the player's real
/// failure UI is `_StageMessage` in video_player_screen.dart, which says what
/// went wrong and offers the retry. Two widgets for one job is how they end up
/// disagreeing about the wording, so the paths nothing reached are gone.
class VideoPlaceholder extends StatelessWidget {
  const VideoPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const AspectRatio(
      aspectRatio: 16 / 9,
      child: ColoredBox(
        color: AppColors.darkBlue,
        child: Center(
          child: CircularProgressIndicator(
            color: AppColors.orange,
            strokeWidth: 3,
          ),
        ),
      ),
    );
  }
}
