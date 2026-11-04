import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/models/content.dart';

/// The student's name drawn over the video.
///
/// It moves because a mark in a fixed corner is a mark that gets cropped out
/// in thirty seconds. Six positions, none of them dead centre -- the point is
/// to be unremovable, not to ruin the lesson for the student who paid for it.
///
/// The timer runs independently of playback on purpose: a student who pauses
/// on a frame should not be handed a still, unmarked picture to crop.
///
/// `IgnorePointer` matters. This sits above the video and below nothing, so
/// without it the mark would swallow taps meant for the gesture layer -- which
/// is play/pause and double-tap seek on this screen.
class PlayerWatermark extends StatefulWidget {
  const PlayerWatermark({super.key, required this.watermark});

  final PlaybackWatermark watermark;

  @override
  State<PlayerWatermark> createState() => _PlayerWatermarkState();
}

class _PlayerWatermarkState extends State<PlayerWatermark> {
  /// Long enough not to distract, short enough that cropping is futile.
  static const _moveEvery = Duration(seconds: 25);

  static const _spots = <Alignment>[
    Alignment(-0.78, -0.76),
    Alignment(0.78, -0.76),
    Alignment(-0.80, -0.04),
    Alignment(0.80, -0.04),
    Alignment(-0.78, 0.62),
    Alignment(0.78, 0.62),
  ];

  int _spot = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(_moveEvery, (_) {
      if (!mounted) return;
      setState(() => _spot = (_spot + 1) % _spots.length);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final phone = widget.watermark.phone;

    return IgnorePointer(
      child: AnimatedAlign(
        alignment: _spots[_spot],
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeInOut,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.watermark.label,
              style: const TextStyle(
                color: Color(0x59FFFFFF),
                fontSize: 11,
                fontWeight: FontWeight.w500,
                height: 1.2,
                shadows: [
                  Shadow(
                    color: Color(0xCC000000),
                    offset: Offset(0, 1),
                    blurRadius: 3,
                  ),
                ],
              ),
            ),
            if (phone != null)
              Text(
                phone,
                style: const TextStyle(
                  color: Color(0x59FFFFFF),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  height: 1.2,
                  shadows: [
                    Shadow(
                      color: Color(0xCC000000),
                      offset: Offset(0, 1),
                      blurRadius: 3,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
