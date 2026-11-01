import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/content.dart';

/// Why a video could not be played, in terms the player can show a student.
enum PlaybackFailure {
  /// Signed out, or the session expired.
  notSignedIn,

  /// Published, but this student has not paid for it.
  notEntitled,

  /// No such lesson, or it has no video.
  missing,

  /// Bunny is still transcoding. Retrying will not help; waiting will.
  processing,

  /// Cannot be taken offline -- the admin has not allowed it, or the library
  /// produced no MP4 renditions to download.
  notDownloadable,

  /// Something went wrong at our end or on the way there.
  unavailable,
}

class PlaybackException implements Exception {
  final PlaybackFailure failure;
  final String message;

  const PlaybackException(this.failure, this.message);

  @override
  String toString() => message;
}

/// Gets a playable address for one lesson.
///
/// A video we host is served from a token-authenticated CDN, so there is no
/// stored URL to play: the `video-playback-token` Edge Function checks the
/// paywall and signs one that expires. This is the only thing in the app that
/// asks for it.
///
/// Payloads are cached in memory until shortly before they expire, because a
/// student scrubbing, switching quality and coming back from the background
/// all want the same URLs and each round trip is a second of black screen on a
/// slow connection. The cache is memory only and deliberately so -- a signed
/// URL written to disk would be a credential outliving the check that made it.
class PlaybackService {
  final SupabaseClient _client;
  final Map<String, PlaybackPayload> _cache = {};

  PlaybackService(this._client);

  static const String _function = 'video-playback-token';

  /// A streaming payload: HLS for adaptive playback plus the MP4 ladder for
  /// the quality menu.
  Future<PlaybackPayload> getStreaming(String contentItemId) async {
    final cached = _cache[contentItemId];
    if (cached != null && cached.isUsable) return cached;

    final payload = await _invoke(contentItemId, forDownload: false);
    _cache[contentItemId] = payload;
    return payload;
  }

  /// A download payload: MP4 only, longer-lived, and recorded server-side
  /// against this device.
  ///
  /// Never cached. Each call is what writes the `content_downloads` row that
  /// makes the copy auditable and revocable, so serving a remembered answer
  /// would lose the record of a download that actually happened.
  Future<PlaybackPayload> getForDownload(
    String contentItemId, {
    required String deviceId,
    String? quality,
  }) {
    return _invoke(
      contentItemId,
      forDownload: true,
      deviceId: deviceId,
      quality: quality,
    );
  }

  /// Forgets a cached payload, so the next play asks again.
  ///
  /// Used after a failure that a fresh token might fix, and when a licence
  /// sweep finds the student is no longer entitled.
  void forget(String contentItemId) => _cache.remove(contentItemId);

  void clear() => _cache.clear();

  Future<PlaybackPayload> _invoke(
    String contentItemId, {
    required bool forDownload,
    String? deviceId,
    String? quality,
  }) async {
    if (_client.auth.currentSession == null) {
      throw const PlaybackException(
        PlaybackFailure.notSignedIn,
        'Please sign in again to play this lesson.',
      );
    }

    try {
      final response = await _client.functions.invoke(
        _function,
        body: {
          'contentItemId': contentItemId,
          'forDownload': forDownload,
          if (deviceId != null) 'deviceId': deviceId,
          if (quality != null) 'quality': quality,
        },
      );

      final data = response.data;
      if (data is! Map) {
        throw const PlaybackException(
          PlaybackFailure.unavailable,
          'This video is temporarily unavailable.',
        );
      }

      return PlaybackPayload.fromJson(Map<String, dynamic>.from(data));
    } on FunctionException catch (error) {
      throw _describe(error, forDownload: forDownload);
    }
  }

  /// Turns the function's status code into something worth showing.
  ///
  /// The distinction between 403 and 409 matters to the student: one means buy
  /// the course, the other means come back in a few minutes. A single "could
  /// not play" message for both would send them to support either way.
  PlaybackException _describe(
    FunctionException error, {
    required bool forDownload,
  }) {
    switch (error.status) {
      case 401:
        return const PlaybackException(
          PlaybackFailure.notSignedIn,
          'Please sign in again to play this lesson.',
        );
      case 403:
        return forDownload
            ? const PlaybackException(
                PlaybackFailure.notDownloadable,
                'This lesson is not available offline.',
              )
            : const PlaybackException(
                PlaybackFailure.notEntitled,
                'Enrol in this course to watch the lesson.',
              );
      case 404:
        return const PlaybackException(
          PlaybackFailure.missing,
          'This lesson has no video yet.',
        );
      case 409:
        return forDownload
            ? const PlaybackException(
                PlaybackFailure.notDownloadable,
                'This lesson cannot be downloaded yet. Please try again later.',
              )
            : const PlaybackException(
                PlaybackFailure.processing,
                'This video is still being prepared. Please try again shortly.',
              );
      default:
        return const PlaybackException(
          PlaybackFailure.unavailable,
          'This video is temporarily unavailable.',
        );
    }
  }
}
