import 'package:flutter/material.dart';

import '../theme/colors.dart';

/// Read-only stars: an average or a single review. Rounds to the nearest
/// half star, which is as fine as the eye reads at this size.
class StarRow extends StatelessWidget {
  final num value;
  final double size;

  const StarRow({super.key, required this.value, this.size = 14});

  @override
  Widget build(BuildContext context) {
    final v = value.toDouble().clamp(0.0, 5.0);
    final halves = (v * 2).round();
    return Semantics(
      label: '${v.toStringAsFixed(v % 1 == 0 ? 0 : 1)} out of 5 stars',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 5; i++)
            Icon(
              halves >= (i + 1) * 2
                  ? Icons.star_rounded
                  : halves == i * 2 + 1
                      ? Icons.star_half_rounded
                      : Icons.star_outline_rounded,
              size: size,
              color: halves > i * 2 ? AppColors.golden : AppColors.gray,
            ),
        ],
      ),
    );
  }
}
