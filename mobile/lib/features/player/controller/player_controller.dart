import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../../core/models/content.dart';
import '../../../core/offline/local_library.dart';
import '../../../core/providers/content_provider.dart';
import '../../../core/providers/playback_provider.dart';
import '../../../core/providers/student_provider.dart';
import '../../../core/providers/supabase_provider.dart';
import '../../../core/services/playback_service.dart';

/// Where the player is in its life, as far as the screen is concerned.
enum PlayerPhase {
  /// Fetching the lesson, its playback URLs and any saved position.
  loading,

  /// There is a position worth returning to; waiting for the student to say.
  askingToResume,

  /// A controller is attached and the video is playable.
  ready,

  /// The transcode has not finished. Waiting helps; retrying does not.
  processing,

  /// Replayed as many times as the lesson allows.
  limitReached,

  /// Anything else, with [error] holding what to tell the student.
  failed,
}

/// The auto-quality option, which is the HLS ladder doing the choosing.
const String kAutoQuality = 'auto';

/// Owns the video for one lesson: the controller, the control state, the
/// gestures' side effects and the progress write-back.
///
/// It is a single object rather than state spread across widgets because every
/// one of those things has to agree about the same position. Switching quality
/// replaces the underlying controller, and the only way that is invisible to
/// the student is if whoever does it also owns the position, the speed and
/// whether the video was playing.
class PlayerController extends ChangeNotifier {
  PlayerController(this._ref, this.contentId);

  final Ref _ref;
  final String contentId;

  // How often progress reaches the server while a video plays. Every frame
  // would be a write a second; only on exit would lose a whole session to a
  // crash or a force-close.
  static const Duration _progressInterval = Duration(seconds: 15);

  // Long enough not to fight a student who is reaching for the scrubber.
  static const Duration _controlsTimeout = Duration(seconds: 3);

  // A double-tap seek, and how long the badge keeps accumulating further taps.
  static const Duration _seekStep = Duration(seconds: 5);
  static const Duration _seekBadgeLinger = Duration(milliseconds: 900);

  static const List<double> speeds = [
    0.25,
    0.5,
    0.75,
    1.0,
    1.25,
    1.5,
    1.75,
    2.0,
  ];

  // Retry schedule for a stream that drops mid-playback. Mobile data handing
  // over between towers is usually back within a few seconds.
  static const List<Duration> _retryDelays = [
    Duration(seconds: 2),
    Duration(seconds: 5),
    Duration(seconds: 12),
  ];

  PlayerPhase _phase = PlayerPhase.loading;
  String? _error;

  Content? _content;
  PlaybackPayload? _payload;
  List<Content> _siblings = const [];

  VideoPlayerController? _video;
  bool _disposed = false;

  String _quality = kAutoQuality;
  double _speed = 1.0;
  bool _controlsVisible = true;
  bool _locked = false;
  bool _fullscreen = false;
  bool _playingLocalCopy = false;

  int _resumeFromSeconds = 0;
  int _playLimit = 0;
  int _playsUsed = 0;

  Duration _pendingSeekBadge = Duration.zero;
  Timer? _seekBadgeTimer;
  Timer? _controlsTimer;
  Timer? _progressTimer;
  Timer? _retryTimer;
  Timer? _autoNextTimer;
  int _retryAttempt = 0;
  int _autoNextSeconds = 0;
  bool _autoNextDue = false;

  Duration _lastWrittenPosition = Duration.zero;

  // ---------------------------------------------------------------------------
  // What the screen reads
  // ---------------------------------------------------------------------------

  PlayerPhase get phase => _phase;
  String? get error => _error;
  Content? get content => _content;
  PlaybackPayload? get payload => _payload;

  VideoPlayerController? get video => _video;
  bool get isReady => _phase == PlayerPhase.ready && _video != null;

  bool get isPlaying => _video?.value.isPlaying ?? false;
  bool get isBuffering => _video?.value.isBuffering ?? false;
  bool get isCompleted => _video?.value.isCompleted ?? false;

  Duration get position => _video?.value.position ?? Duration.zero;
  Duration get duration => _video?.value.duration ?? Duration.zero;

  /// The furthest point the player has buffered, for the scrubber's track.
  Duration get buffered {
    final ranges = _video?.value.buffered ?? const <DurationRange>[];
    var furthest = Duration.zero;
    for (final range in ranges) {
      if (range.end > furthest) furthest = range.end;
    }
    return furthest;
  }

  double get speed => _speed;
  String get quality => _quality;
  bool get controlsVisible => _controlsVisible;
  bool get locked => _locked;
  bool get fullscreen => _fullscreen;
  bool get playingLocalCopy => _playingLocalCopy;

  Duration get seekBadge => _pendingSeekBadge;
  int get resumeFromSeconds => _resumeFromSeconds;
  int get playLimit => _playLimit;
  int get playsUsed => _playsUsed;
  int get autoNextSeconds => _autoNextSeconds;

  /// The countdown ran out and the next lesson should open.
  ///
  /// A flag rather than a callback into navigation: pushing a route is the
  /// screen's job, and a controller that knew about GoRouter could not be
  /// torn down independently of it. The screen clears it with
  /// [consumeAutoNext] once it has acted.
  bool get autoNextDue => _autoNextDue;

  /// Qualities to offer. Only the downloaded one, when that is what is playing:
  /// there is no point offering 1080p to a student with the radio off.
  List<String> get availableQualities {
    if (_playingLocalCopy) return [_quality];
    final payload = _payload;
    if (payload == null) return const [];
    return [kAutoQuality, ...payload.qualities];
  }

  Content? get previousLesson {
    final index = _siblingIndex;
    if (index <= 0) return null;
    return _siblings[index - 1];
  }

  Content? get nextLesson {
    final index = _siblingIndex;
    if (index < 0 || index >= _siblings.length - 1) return null;
    return _siblings[index + 1];
  }

  int get _siblingIndex =>
      _siblings.indexWhere((lesson) => lesson.id == contentId);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /// Fetches everything the player needs and decides what to show first.
  Future<void> load() async {
    _set(() {
      _phase = PlayerPhase.loading;
      _error = null;
    });

    try {
      final content = await _ref
          .read(contentServiceProvider)
          .getContentById(contentId);
      if (_disposed) return;
      _content = content;
      _playLimit = content.playLimit ?? 0;

      // Siblings drive previous/next and autoplay. A failure here is not worth
      // failing the lesson over -- it only costs the navigation buttons.
      unawaited(_loadSiblings(content.topicId));

      await _loadSavedPosition();
      if (_disposed) return;

      // One play is claimed before anything is fetched. Claiming it after the
      // video loaded would let a student spend their last replay on a lesson
      // that then failed to play.
      final allowed = await _claimPlay();
      if (_disposed) return;
      if (!allowed) {
        _set(() => _phase = PlayerPhase.limitReached);
        return;
      }

      await _resolveSource();
      if (_disposed) return;

      // Offer to resume rather than silently jumping: a student who finished
      // the lesson yesterday and reopened it today usually wants the start.
      if (_resumeFromSeconds > 30 && !_isComplete()) {
        _set(() => _phase = PlayerPhase.askingToResume);
        return;
      }

      await _attach(Duration.zero, autoPlay: true);
    } on PlaybackException catch (failure) {
      if (_disposed) return;
      _set(() {
        _phase = failure.failure == PlaybackFailure.processing
            ? PlayerPhase.processing
            : PlayerPhase.failed;
        _error = failure.message;
      });
    } catch (err) {
      if (_disposed) return;
      debugPrint('player: load failed: $err');
      _set(() {
        _phase = PlayerPhase.failed;
        _error = 'Could not load this lesson.';
      });
    }
  }

  Future<void> _loadSiblings(String topicId) async {
    try {
      final siblings = await _ref
          .read(contentServiceProvider)
          .getContentsByTopic(topicId);
      if (_disposed) return;
      _set(() => _siblings = siblings);
    } catch (err) {
      debugPrint('player: lesson list unavailable: $err');
    }
  }

  Future<void> _loadSavedPosition() async {
    final student = await _ref.read(currentStudentProvider.future);
    if (student == null || _disposed) return;

    try {
      final progress = await _ref
          .read(contentServiceProvider)
          .getProgressFor(student.id, [contentId]);
      final saved = progress[contentId];
      if (saved == null || _disposed) return;

      _resumeFromSeconds = saved.isCompleted ? 0 : saved.lastPositionSeconds;
    } catch (err) {
      debugPrint('player: saved position unavailable: $err');
    }
  }

  bool _isComplete() {
    final total = _payload?.durationSeconds ?? _content?.durationSeconds ?? 0;
    if (total <= 0) return false;
    return _resumeFromSeconds >= total - 10;
  }

  /// Claims one play against the lesson's replay limit.
  ///
  /// The count lives on `student_progress` server-side, because counting on
  /// the device would hand every replay back on a reinstall.
  Future<bool> _claimPlay() async {
    if (_playLimit <= 0) return true;

    try {
      final result = await _ref
          .read(supabaseClientProvider)
          .rpc('register_content_play', params: {
        'p_content_item_id': contentId,
      });

      if (result is Map) {
        _playsUsed = (result['plays'] as num?)?.toInt() ?? 0;
        final limit = (result['limit'] as num?)?.toInt() ?? 0;
        if (limit > 0) _playLimit = limit;
        return result['allowed'] == true;
      }
      return true;
    } catch (err) {
      // A counter that cannot be reached must not lock a paying student out of
      // a lesson they are entitled to.
      debugPrint('player: play count unavailable: $err');
      return true;
    }
  }

  /// Decides whether this lesson plays from the device or from the network.
  ///
  /// A downloaded copy wins. It is already paid for, already on the phone and
  /// costs the student nothing to watch, so streaming it again would be a
  /// waste of their data whether or not they have a signal.
  Future<void> _resolveSource() async {
    final local = await _ref.read(localLibraryProvider).find(contentId);

    if (local != null) {
      _playingLocalCopy = true;
      _quality = local.quality ?? kAutoQuality;
      _localPath = local.path;
      return;
    }

    _playingLocalCopy = false;
    _localPath = null;
    _payload = await _ref.read(playbackServiceProvider).getStreaming(contentId);
  }

  String? _localPath;

  // ---------------------------------------------------------------------------
  // The controller itself
  // ---------------------------------------------------------------------------

  /// Builds a controller for the current source and seeks it to [from].
  ///
  /// Every quality switch and every retry goes through here, which is why the
  /// position and the playing state are arguments rather than something it
  /// reads: they have to survive an object being thrown away and replaced.
  Future<void> _attach(Duration from, {required bool autoPlay}) async {
    final previous = _video;
    _video = null;

    if (previous != null) {
      previous.removeListener(_onVideoTick);
      await previous.dispose();
    }

    final controller = _buildController();
    if (controller == null) {
      _set(() {
        _phase = PlayerPhase.failed;
        _error = 'This lesson has no video yet.';
      });
      return;
    }

    try {
      await controller.initialize();
    } catch (err) {
      debugPrint('player: initialise failed: $err');
      await controller.dispose();
      _onPlaybackBroken();
      return;
    }

    if (_disposed) {
      await controller.dispose();
      return;
    }

    await controller.setPlaybackSpeed(_speed);
    if (from > Duration.zero) await controller.seekTo(from);

    controller.addListener(_onVideoTick);
    _video = controller;
    _retryAttempt = 0;

    _set(() {
      _phase = PlayerPhase.ready;
      _error = null;
    });

    if (autoPlay) await play();
    _showControls();
    _startProgressTimer();
  }

  VideoPlayerController? _buildController() {
    final path = _localPath;
    if (path != null) {
      return VideoPlayerController.file(File(path));
    }

    final payload = _payload;
    if (payload == null) return null;

    // Auto means the HLS ladder. Where there is no playlist -- an external
    // video is sometimes a bare MP4 -- the best rendition we were given is the
    // nearest thing to it.
    final ladder = payload.qualities;
    final url = _quality == kAutoQuality
        ? payload.hls ?? (ladder.isEmpty ? null : payload.mp4[ladder.first])
        : payload.mp4[_quality];

    if (url == null || url.isEmpty) return null;
    return VideoPlayerController.networkUrl(Uri.parse(url));
  }

  void _onVideoTick() {
    final value = _video?.value;
    if (value == null) return;

    if (value.hasError) {
      _onPlaybackBroken();
      return;
    }

    if (value.isCompleted) {
      _onCompleted();
    }

    // The tick is what redraws the scrubber and the clock, so it notifies on
    // every frame the platform reports. Nothing heavier belongs in here.
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Playback controls
  // ---------------------------------------------------------------------------

  Future<void> play() async {
    final controller = _video;
    if (controller == null) return;

    _cancelAutoNext();
    await controller.play();
    await WakelockPlus.enable();
    _showControls();
    notifyListeners();
  }

  Future<void> pause() async {
    final controller = _video;
    if (controller == null) return;

    await controller.pause();
    await WakelockPlus.disable();
    // A pause is the clearest signal a student is stopping, so the position
    // goes to the server now rather than waiting for the next tick.
    await flushProgress();
    _showControls(sticky: true);
    notifyListeners();
  }

  Future<void> togglePlay() => isPlaying ? pause() : play();

  Future<void> seekTo(Duration target) async {
    final controller = _video;
    if (controller == null) return;

    final total = controller.value.duration;
    var clamped = target;
    if (clamped < Duration.zero) clamped = Duration.zero;
    if (total > Duration.zero && clamped > total) clamped = total;

    await controller.seekTo(clamped);
    _showControls();
    notifyListeners();
  }

  /// A relative seek, with the badge that accumulates while taps keep coming.
  ///
  /// Four quick double-taps should read "−20 seconds", not flash "−5" four
  /// times: the student is looking for a moment, and the total is the useful
  /// number.
  Future<void> nudge(bool forward) async {
    final step = forward ? _seekStep : -_seekStep;

    _pendingSeekBadge += step;
    _seekBadgeTimer?.cancel();
    _seekBadgeTimer = Timer(_seekBadgeLinger, () {
      _set(() => _pendingSeekBadge = Duration.zero);
    });

    await seekTo(position + step);
  }

  Future<void> setSpeed(double value) async {
    _speed = value;
    await _video?.setPlaybackSpeed(value);
    _showControls();
    notifyListeners();
  }

  /// Switches quality without the student losing their place.
  ///
  /// video_player cannot change a controller's source, so the controller is
  /// replaced. The position and whether it was playing are captured first and
  /// restored after, which is the whole trick.
  Future<void> setQuality(String value) async {
    if (value == _quality || _playingLocalCopy) return;

    final resumeAt = position;
    final wasPlaying = isPlaying;

    _set(() {
      _quality = value;
      _phase = PlayerPhase.loading;
    });

    await _attach(resumeAt, autoPlay: wasPlaying);
  }

  void toggleLock() {
    _locked = !_locked;
    // Locked means a hand resting on the screen cannot seek. The button itself
    // has to stay reachable or there is no way back.
    _controlsVisible = true;
    _controlsTimer?.cancel();
    if (!_locked) _showControls();
    notifyListeners();
  }

  Future<void> setFullscreen(bool value) async {
    if (_fullscreen == value) return;
    _fullscreen = value;

    if (value) {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }

    notifyListeners();
  }

  Future<void> toggleFullscreen() => setFullscreen(!_fullscreen);

  // ---------------------------------------------------------------------------
  // Control visibility
  // ---------------------------------------------------------------------------

  void tapScreen() {
    if (_controlsVisible) {
      _hideControls();
    } else {
      _showControls();
    }
  }

  /// Shows the controls and arms the auto-hide.
  ///
  /// `sticky` leaves them up: while a video is paused there is nothing to get
  /// out of the way of, and controls that vanish over a still frame only make
  /// the student tap again.
  void _showControls({bool sticky = false}) {
    _controlsVisible = true;
    _controlsTimer?.cancel();

    if (!sticky && !_locked) {
      _controlsTimer = Timer(_controlsTimeout, () {
        if (isPlaying) _set(() => _controlsVisible = false);
      });
    }

    notifyListeners();
  }

  void _hideControls() {
    _controlsTimer?.cancel();
    _set(() => _controlsVisible = false);
  }

  void keepControlsAlive() => _showControls();

  // ---------------------------------------------------------------------------
  // Resume
  // ---------------------------------------------------------------------------

  Future<void> resumeFromSaved() async {
    await _attach(Duration(seconds: _resumeFromSeconds), autoPlay: true);
  }

  Future<void> startOver() async {
    _resumeFromSeconds = 0;
    await _attach(Duration.zero, autoPlay: true);
  }

  // ---------------------------------------------------------------------------
  // Progress write-back
  // ---------------------------------------------------------------------------

  void _startProgressTimer() {
    _progressTimer?.cancel();
    _progressTimer = Timer.periodic(_progressInterval, (_) {
      if (isPlaying) unawaited(flushProgress());
    });
  }

  /// Sends the current position, if it has moved since the last time.
  ///
  /// Called on a timer, on pause, on dispose and when the app goes to the
  /// background -- which is the one that matters most, because a student
  /// switching away mid-lesson is the common case and the OS may never give us
  /// another chance.
  Future<void> flushProgress() async {
    final controller = _video;
    final content = _content;
    if (controller == null || content == null) return;

    final current = controller.value.position;
    final total = controller.value.duration;
    if (total <= Duration.zero) return;

    if ((current - _lastWrittenPosition).abs() < const Duration(seconds: 2)) {
      return;
    }
    _lastWrittenPosition = current;

    final percentage =
        (current.inMilliseconds / total.inMilliseconds * 100).clamp(0, 100);

    await _ref.read(progressWriterProvider).write(
          contentItemId: contentId,
          positionSeconds: current.inSeconds,
          progressPercentage: percentage.toDouble(),
        );
  }

  // ---------------------------------------------------------------------------
  // Failure and recovery
  // ---------------------------------------------------------------------------

  /// A stream that has broken mid-playback.
  ///
  /// Mobile data drops for a few seconds all the time, so this retries before
  /// it gives up. If the lesson has been downloaded, it switches to that copy
  /// instead of making the student watch a spinner -- they already have the
  /// file.
  void _onPlaybackBroken() {
    if (_disposed) return;

    final resumeAt = position;

    if (_retryAttempt < _retryDelays.length) {
      final delay = _retryDelays[_retryAttempt];
      _retryAttempt++;

      _retryTimer?.cancel();
      _retryTimer = Timer(delay, () async {
        if (_disposed) return;
        final local = await _ref.read(localLibraryProvider).find(contentId);
        if (local != null && !_playingLocalCopy) {
          _playingLocalCopy = true;
          _localPath = local.path;
          _quality = local.quality ?? kAutoQuality;
          _payload = null;
        }
        await _attach(resumeAt, autoPlay: true);
      });

      _set(() => _phase = PlayerPhase.loading);
      return;
    }

    _set(() {
      _phase = PlayerPhase.failed;
      _error = 'Playback stopped. Check your connection and try again.';
    });
  }

  /// Retries from the start of the chain: a fresh token, then a fresh player.
  Future<void> retry() async {
    _retryAttempt = 0;
    _ref.read(playbackServiceProvider).forget(contentId);
    await load();
  }

  // ---------------------------------------------------------------------------
  // End of lesson
  // ---------------------------------------------------------------------------

  void _onCompleted() {
    unawaited(WakelockPlus.disable());
    unawaited(flushProgress());

    if (_autoNextTimer != null || nextLesson == null) return;

    _autoNextSeconds = 5;
    _autoNextTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      _set(() {
        _autoNextSeconds--;
        if (_autoNextSeconds <= 0) {
          timer.cancel();
          _autoNextTimer = null;
          _autoNextDue = true;
        }
      });
    });
  }

  /// Stops the countdown. The student has said they are not done here.
  void cancelAutoNext() => _cancelAutoNext();

  /// Called by the screen once it has opened the next lesson.
  void consumeAutoNext() => _autoNextDue = false;

  void _cancelAutoNext() {
    if (_autoNextTimer == null && _autoNextSeconds == 0 && !_autoNextDue) {
      return;
    }
    _autoNextTimer?.cancel();
    _autoNextTimer = null;
    _set(() {
      _autoNextSeconds = 0;
      _autoNextDue = false;
    });
  }

  // ---------------------------------------------------------------------------

  void _set(VoidCallback change) {
    if (_disposed) return;
    change();
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;

    _seekBadgeTimer?.cancel();
    _controlsTimer?.cancel();
    _progressTimer?.cancel();
    _retryTimer?.cancel();
    _autoNextTimer?.cancel();

    // Fire and forget: dispose cannot await, and losing the last few seconds
    // of a position is a smaller problem than holding the screen on a dead
    // route while a request finishes.
    unawaited(flushProgress());
    unawaited(WakelockPlus.disable());

    final controller = _video;
    _video = null;
    controller?.removeListener(_onVideoTick);
    unawaited(controller?.dispose() ?? Future<void>.value());

    if (_fullscreen) {
      unawaited(SystemChrome.setPreferredOrientations(DeviceOrientation.values));
      unawaited(
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge),
      );
    }

    super.dispose();
  }
}

final playerControllerProvider = ChangeNotifierProvider.autoDispose
    .family<PlayerController, String>((ref, contentId) {
  final controller = PlayerController(ref, contentId);
  // Kicked off here rather than in the constructor so the provider is already
  // registered when the first notification arrives.
  Future.microtask(controller.load);
  return controller;
});
