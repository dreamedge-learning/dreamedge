import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/offline_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// A slim strip saying the app has no connection.
///
/// Slim on purpose. It has to be present on every screen so a student never
/// wonders why a list is short, and it has to take almost no room so it is
/// not itself the reason the screen looks wrong. It appears only when there is
/// genuinely nothing reachable, which is why it sits on the reachability probe
/// rather than on whether an interface exists.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(isOnlineProvider);

    return AnimatedSize(
      duration: const Duration(milliseconds: 180),
      alignment: Alignment.topCenter,
      child: online
          ? const SizedBox(width: double.infinity, height: 0)
          : Container(
              width: double.infinity,
              color: AppColors.darkBlue,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.cloud_off_rounded,
                    size: 13,
                    color: AppColors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    "You're offline — saved lessons still play",
                    style: AppTypography.caption.copyWith(
                      color: AppColors.white,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
