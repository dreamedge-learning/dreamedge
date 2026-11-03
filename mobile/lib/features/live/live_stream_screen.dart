import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';

/// A lean HLS viewer for a live class streamed through the platform.
///
/// Separate from the full `VideoPlayerScreen` on purpose: a live feed has no
/// scrubber, no quality menu, no replay limit and no download. What it needs
/// is a reliable 16:9 frame, a landscape toggle, and the screen staying on
/// while the student is watching. video_player handles the HLS bit itself on
/// Android (ExoPlayer) and iOS (AVPlayer), so no second player library is
/// pulled in just for this screen.
class LiveStreamScreen extends StatefulWidget {
  final String title;
  final String instructor;
  final String streamUrl;

  const LiveStreamScreen({
    super.key,
    required this.title,
    required this.instructor,
    required this.streamUrl,
  });

  @override
  State<LiveStreamScreen> createState() => _LiveStreamScreenState();
}

class _LiveStreamScreenState extends State<LiveStreamScreen> {
  VideoPlayerController? _controller;
  bool _loading = true;
  String? _error;
  bool _fullscreen = false;

  @override
  void initState() {
    super.initState();
    _attach();
    unawaited(WakelockPlus.enable());
  }

  @override
  void dispose() {
    unawaited(WakelockPlus.disable());
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    try {
      final controller =
          VideoPlayerController.networkUrl(Uri.parse(widget.streamUrl));
      await controller.initialize();
      if (!mounted) {
        unawaited(controller.dispose());
        return;
      }
      setState(() {
        _controller = controller;
        _loading = false;
      });
      await controller.play();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not start the live stream.';
      });
    }
  }

  void _toggleFullscreen() {
    setState(() => _fullscreen = !_fullscreen);
    if (_fullscreen) {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final playerFrame = Container(
      color: Colors.black,
      child: AspectRatio(
        aspectRatio: controller != null && controller.value.isInitialized
            ? controller.value.aspectRatio
            : 16 / 9,
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.white),
              )
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.warning_amber_rounded,
                              color: AppColors.white, size: 36),
                          const SizedBox(height: 10),
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: AppTypography.bodyMedium
                                .copyWith(color: AppColors.white),
                          ),
                          const SizedBox(height: 12),
                          OutlinedButton(
                            onPressed: () {
                              setState(() {
                                _loading = true;
                                _error = null;
                              });
                              _attach();
                            },
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.white,
                              side: const BorderSide(color: AppColors.white),
                            ),
                            child: const Text('Try again'),
                          ),
                        ],
                      ),
                    ),
                  )
                : controller != null && controller.value.isInitialized
                    ? Stack(
                        children: [
                          VideoPlayer(controller),
                          Positioned(
                            left: 10,
                            top: 10,
                            child: _LiveBadge(),
                          ),
                          Positioned(
                            right: 10,
                            bottom: 10,
                            child: IconButton(
                              icon: Icon(
                                _fullscreen
                                    ? Icons.fullscreen_exit_rounded
                                    : Icons.fullscreen_rounded,
                                color: AppColors.white,
                              ),
                              onPressed: _toggleFullscreen,
                            ),
                          ),
                        ],
                      )
                    : const SizedBox.shrink(),
      ),
    );

    if (_fullscreen) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: playerFrame),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        foregroundColor: AppColors.textPrimary,
        title: Text(
          'Live',
          style: AppTypography.bodyLarge
              .copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          playerFrame,
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.title,
                  style: AppTypography.bodyLarge
                      .copyWith(fontWeight: FontWeight.w700, fontSize: 18),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.instructor,
                  style: AppTypography.bodyMedium
                      .copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.error,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              color: AppColors.surfaceElevated,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'LIVE',
            style: AppTypography.caption.copyWith(
              color: AppColors.white,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

