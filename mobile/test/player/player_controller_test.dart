import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/content.dart';
import 'package:mobile/core/offline/download_record.dart';
import 'package:mobile/core/offline/server_clock.dart';
import 'package:mobile/features/player/controller/player_controller.dart';

/// The player's decisions, tested apart from the platform.
///
/// 787 lines of position, retry and play-limit state machine shipped with no
/// tests at all, while the models and the payment path had good coverage. The
/// decisions in here are the ones that cost a student something when they are
/// wrong: a replay burned on a lesson never watched, a licence that outlives
/// the enrolment, a spinner where a re-signed token belonged.
///
/// They are tested as pure functions because that is what they are. Attaching
/// a real VideoPlayerController needs a platform, and a fake one would test
/// the fake. Two of the behaviours the audit asked for cannot be reached this
/// way and are called out at the bottom rather than faked.
void main() {
  group('resume prompt threshold', () {
    test('a position inside the first 30 seconds is not worth offering', () {
      // Indistinguishable from the start, and "resume from 0:12" is noise.
      expect(
        PlayerController.shouldOfferResume(savedSeconds: 0, totalSeconds: 2700),
        isFalse,
      );
      expect(
        PlayerController.shouldOfferResume(savedSeconds: 12, totalSeconds: 2700),
        isFalse,
      );
      expect(
        PlayerController.shouldOfferResume(savedSeconds: 30, totalSeconds: 2700),
        isFalse,
        reason: 'the threshold itself is not past it',
      );
    });

    test('a position past the threshold is offered', () {
      expect(
        PlayerController.shouldOfferResume(savedSeconds: 31, totalSeconds: 2700),
        isTrue,
      );
      expect(
        PlayerController.shouldOfferResume(
          savedSeconds: 754,
          totalSeconds: 2700,
        ),
        isTrue,
      );
    });

    test('a finished lesson offers the start, not the last ten seconds', () {
      // Reopening something you watched to the end means watching it again.
      // Offering "resume from 44:58" of a 45-minute lesson reads as a bug.
      expect(
        PlayerController.shouldOfferResume(
          savedSeconds: 2695,
          totalSeconds: 2700,
        ),
        isFalse,
      );
      expect(
        PlayerController.shouldOfferResume(
          savedSeconds: 2690,
          totalSeconds: 2700,
        ),
        isFalse,
        reason: 'exactly on the tail boundary counts as finished',
      );
      expect(
        PlayerController.shouldOfferResume(
          savedSeconds: 2689,
          totalSeconds: 2700,
        ),
        isTrue,
      );
    });

    test('an unknown duration still offers the position', () {
      // A video whose length Bunny has not reported yet. Discarding a position
      // the student earned is the worse of the two mistakes.
      expect(
        PlayerController.shouldOfferResume(savedSeconds: 600, totalSeconds: 0),
        isTrue,
      );
    });
  });

  group('playback retry schedule', () {
    test('backs off 3s, 15s then 45s', () {
      expect(PlayerController.maxPlaybackRetries, 3);
      expect(PlayerController.retryDelayFor(0), const Duration(seconds: 3));
      expect(PlayerController.retryDelayFor(1), const Duration(seconds: 15));
      expect(PlayerController.retryDelayFor(2), const Duration(seconds: 45));
    });

    test('an attempt past the end clamps instead of throwing', () {
      // This runs inside a timer callback, where a RangeError would take the
      // player down rather than surface anywhere useful.
      expect(PlayerController.retryDelayFor(3), const Duration(seconds: 45));
      expect(PlayerController.retryDelayFor(99), const Duration(seconds: 45));
    });
  });

  group('token refresh on a broken stream', () {
    PlaybackPayload payloadExpiringIn(Duration remaining) {
      return PlaybackPayload(
        provider: 'bunny',
        hls: 'https://vz-test.b-cdn.net/guid/playlist.m3u8',
        mp4: const {'480': 'https://vz-test.b-cdn.net/guid/play_480p.mp4'},
        isDownloadable: true,
        offlineLicenseDays: 30,
        expiresAt: DateTime.now().add(remaining),
        serverNow: DateTime.now().toUtc(),
      );
    }

    test('a fresh token is not re-minted on an early attempt', () {
      // A tower handover is back within seconds. Three Edge Function calls for
      // that would be three calls for nothing.
      expect(
        PlayerController.shouldRefreshToken(
          payload: payloadExpiringIn(const Duration(hours: 5)),
          attempt: 0,
        ),
        isFalse,
      );
    });

    test('the last attempt always re-mints', () {
      expect(
        PlayerController.shouldRefreshToken(
          payload: payloadExpiringIn(const Duration(hours: 5)),
          attempt: PlayerController.maxPlaybackRetries,
        ),
        isTrue,
      );
    });

    test('a payload out of usable life re-mints immediately', () {
      // The six-hour case: a lesson started in the morning and resumed in the
      // evening. Re-attaching against the same dead URL three times was the
      // bug -- three spinners and then "check your connection", which was not
      // the problem.
      expect(
        PlayerController.shouldRefreshToken(
          payload: payloadExpiringIn(const Duration(minutes: 2)),
          attempt: 0,
        ),
        isTrue,
        reason: 'inside the five-minute headroom counts as spent',
      );
      expect(
        PlayerController.shouldRefreshToken(
          payload: payloadExpiringIn(const Duration(hours: -1)),
          attempt: 0,
        ),
        isTrue,
      );
    });

    test('a local copy with no payload re-mints', () {
      expect(
        PlayerController.shouldRefreshToken(payload: null, attempt: 0),
        isTrue,
      );
    });
  });

  group('a refused play says which refusal it was', () {
    test('a spent limit shows the replay-limit screen', () {
      expect(
        PlayerController.phaseForRefusal('limit_reached'),
        PlayerPhase.limitReached,
      );
      expect(
        PlayerController.phaseForRefusal(null),
        PlayerPhase.limitReached,
        reason: 'an older server that sends no reason is treated as a limit',
      );
    });

    test('a session problem is a failure, not a limit', () {
      // register_content_play answers `allowed: false, limit: 0` when it
      // cannot resolve the caller to a student. Rendering that as "you have
      // reached the replay limit -- contact your mentor" sent a student with
      // an expired sign-in to a person who could not help.
      expect(
        PlayerController.phaseForRefusal('no_student'),
        PlayerPhase.failed,
      );
      expect(
        PlayerController.phaseForRefusal('not_found'),
        PlayerPhase.failed,
      );
    });
  });

  group('licence expiry gates playback', () {
    DownloadRecord downloadWith({
      DateTime? expiresAt,
      int? licenceDays,
      DateTime? lastVerifiedAt,
    }) {
      return DownloadRecord(
        contentItemId: 'ct-001',
        studentId: 'st-001',
        title: 'Introduction to Algebra',
        type: 'video',
        localPath: '/data/offline/ct-001/abc.mp4',
        bytesTotal: 100,
        bytesDone: 100,
        status: DownloadStatus.done,
        attempts: 0,
        licenceExpiresAt: expiresAt,
        licenceDays: licenceDays,
        lastVerifiedAt: lastVerifiedAt,
        createdAt: DateTime.utc(2026, 11, 1),
      );
    }

    final serverNow = DateTime.utc(2026, 11, 2, 12);
    final trusted = ClockReading(now: serverNow, trusted: true);

    test('a licence with time left plays', () {
      final record = downloadWith(
        expiresAt: serverNow.add(const Duration(days: 9)),
        licenceDays: 30,
        lastVerifiedAt: serverNow.subtract(const Duration(days: 1)),
      );
      expect(record.isLicenceValidAt(trusted), isTrue);
      expect(record.isPlayableAt(trusted), isTrue);
    });

    test('a lapsed licence does not play', () {
      final record = downloadWith(
        expiresAt: serverNow.subtract(const Duration(minutes: 1)),
        licenceDays: 30,
        lastVerifiedAt: serverNow.subtract(const Duration(days: 31)),
      );
      expect(record.isLicenceValidAt(trusted), isFalse);
      expect(record.isPlayableAt(trusted), isFalse);
    });

    test('an untrusted clock locks a licence that still has time on it', () {
      // The clock-tampering defence: set the phone back a year and the reading
      // stops being trusted, so a licence with months left on paper is still
      // refused until a real server answer re-anchors it.
      final record = downloadWith(
        expiresAt: serverNow.add(const Duration(days: 29)),
        licenceDays: 30,
        lastVerifiedAt: serverNow,
      );
      expect(record.isLicenceValidAt(trusted), isTrue);
      expect(
        record.isLicenceValidAt(ClockReading(now: serverNow, trusted: false)),
        isFalse,
      );
    });

    test('a device that stopped checking in runs out of licence', () {
      // The backstop. Even with an expiry written far into the future, the
      // copy cannot outlive licence_days from its last real server contact --
      // which is what stops an aeroplane-mode device keeping a course forever.
      final record = downloadWith(
        expiresAt: serverNow.add(const Duration(days: 365)),
        licenceDays: 30,
        lastVerifiedAt: serverNow.subtract(const Duration(days: 31)),
      );
      expect(record.isLicenceValidAt(trusted), isFalse);
    });

    test('a free item with no licence at all plays', () {
      final record = downloadWith();
      expect(record.isLicenceValidAt(trusted), isTrue);
    });

    test('a download still arriving is not playable however valid', () {
      final record = DownloadRecord(
        contentItemId: 'ct-002',
        studentId: 'st-001',
        title: 'Still saving',
        type: 'video',
        localPath: '/data/offline/ct-002/abc.mp4',
        bytesTotal: 100,
        bytesDone: 40,
        status: DownloadStatus.downloading,
        attempts: 0,
        createdAt: DateTime.utc(2026, 11, 1),
      );
      expect(record.isPlayableAt(trusted), isFalse);
    });
  });

  group('server clock readings', () {
    final anchor = DateTime.utc(2026, 11, 2, 12);

    test('an untrusted reading never licenses anything', () {
      final reading = ClockReading(now: anchor, trusted: false);
      expect(
        reading.licenceStands(expiresAt: anchor.add(const Duration(days: 10))),
        isFalse,
      );
    });

    test('the verification window caps the stored expiry', () {
      final reading = ClockReading(now: anchor, trusted: true);

      expect(
        reading.licenceStands(
          expiresAt: anchor.add(const Duration(days: 100)),
          lastVerifiedAt: anchor.subtract(const Duration(days: 5)),
          licenceDays: 30,
        ),
        isTrue,
      );
      expect(
        reading.licenceStands(
          expiresAt: anchor.add(const Duration(days: 100)),
          lastVerifiedAt: anchor.subtract(const Duration(days: 40)),
          licenceDays: 30,
        ),
        isFalse,
        reason: 'the window has closed even though the expiry has not',
      );
    });

    test('a zero or negative licence length still allows one day', () {
      // A bad row must not mean "expired the moment it was written".
      final reading = ClockReading(now: anchor, trusted: true);
      expect(
        reading.licenceStands(
          lastVerifiedAt: anchor.subtract(const Duration(hours: 1)),
          licenceDays: 0,
        ),
        isTrue,
      );
    });

    test('an unanchored reading is untrusted', () {
      expect(ClockReading.untrusted().trusted, isFalse);
    });
  });

  group('pause reasons', () {
    test('only the Wi-Fi rule parks a download for a reconnect to resume', () {
      DownloadRecord paused(PauseReason? reason) => DownloadRecord(
        contentItemId: 'ct-003',
        studentId: 'st-001',
        title: 'Paused',
        type: 'video',
        bytesTotal: 100,
        bytesDone: 10,
        status: DownloadStatus.paused,
        pausedReason: reason,
        attempts: 0,
        createdAt: DateTime.utc(2026, 11, 1),
      );

      expect(paused(PauseReason.network).isAutoPaused, isTrue);
      expect(
        paused(PauseReason.student).isAutoPaused,
        isFalse,
        reason: 'a student who paused to save data must not be overruled',
      );
      expect(paused(null).isAutoPaused, isFalse);
    });

    test('a reason survives a round trip through the row', () {
      final row = DownloadRecord(
        contentItemId: 'ct-004',
        studentId: 'st-001',
        title: 'Round trip',
        type: 'video',
        bytesTotal: 0,
        bytesDone: 0,
        status: DownloadStatus.paused,
        pausedReason: PauseReason.student,
        attempts: 0,
        createdAt: DateTime.utc(2026, 11, 1),
      ).toRow();

      expect(DownloadRecord.fromRow(row).pausedReason, PauseReason.student);
    });
  });

  // ---------------------------------------------------------------------------
  // Play-claim decision
  //
  // _ensurePlayClaimed and the RPC round-trip around it need a platform; the
  // decisions they consult do not. `shouldClaimPlay` and `claimedFromResponse`
  // are the two choices that would otherwise be read-only comments, lifted
  // out as pure functions so a change here cannot drift from the behaviour.
  // ---------------------------------------------------------------------------

  group('play claim decision', () {
    test('a free lesson never calls the RPC', () {
      // Unlimited replays means a counter that is only there to be bypassed.
      expect(
        PlayerController.shouldClaimPlay(playLimit: 0, playClaimed: false),
        isFalse,
      );
      expect(
        PlayerController.shouldClaimPlay(playLimit: -1, playClaimed: false),
        isFalse,
      );
    });

    test('a limited lesson calls the RPC once per session', () {
      expect(
        PlayerController.shouldClaimPlay(playLimit: 3, playClaimed: false),
        isTrue,
      );
    });

    test('a flag already set stops the next retry claiming again', () {
      // The retry-after-stream-break case. Same play, no second count.
      expect(
        PlayerController.shouldClaimPlay(playLimit: 3, playClaimed: true),
        isFalse,
      );
    });

    test('an allowed-true response sets the claimed flag', () {
      expect(
        PlayerController.claimedFromResponse(
          {'allowed': true, 'plays': 1, 'limit': 3},
        ),
        isTrue,
      );
    });

    test('an allowed-false response leaves the flag off so the refusal shows', () {
      expect(
        PlayerController.claimedFromResponse(
          {'allowed': false, 'plays': 3, 'limit': 3, 'reason': 'limit_reached'},
        ),
        isFalse,
      );
    });

    test('a non-map response leaves the flag off', () {
      // What the RPC returns when the schema changes under us; the caller's
      // catch block handles the thrown case, which also leaves the flag off.
      expect(PlayerController.claimedFromResponse(null), isFalse);
      expect(PlayerController.claimedFromResponse('nope'), isFalse);
      expect(PlayerController.claimedFromResponse(42), isFalse);
    });
  });

  // ---------------------------------------------------------------------------
  // Quality swap capture
  //
  // `_attach` builds a real VideoPlayerController and needs a platform, but
  // the capture that feeds it does not -- `planQualitySwap` is three lines
  // deciding what to hand `_attach`, so the position-preserving behaviour
  // can be checked here instead of behind an integration test.
  // ---------------------------------------------------------------------------

  group('quality swap plan', () {
    const resumeAt = Duration(minutes: 3, seconds: 42);

    test('a swap captures the position and playing state for _attach', () {
      final plan = PlayerController.planQualitySwap(
        currentQuality: '480',
        requestedQuality: '720',
        playingLocalCopy: false,
        currentPosition: resumeAt,
        isPlaying: true,
      );

      expect(plan, isNotNull);
      expect(plan!.nextQuality, '720');
      expect(plan.resumeAt, resumeAt);
      expect(plan.wasPlaying, isTrue);
    });

    test('a paused swap keeps the paused state after reattach', () {
      final plan = PlayerController.planQualitySwap(
        currentQuality: 'auto',
        requestedQuality: '1080',
        playingLocalCopy: false,
        currentPosition: resumeAt,
        isPlaying: false,
      );

      expect(plan?.wasPlaying, isFalse);
      expect(plan?.resumeAt, resumeAt);
    });

    test('picking the current quality is a no-op', () {
      // Tapping the same option in the menu must not tear the controller
      // down -- that would show the loading spinner for nothing.
      expect(
        PlayerController.planQualitySwap(
          currentQuality: '720',
          requestedQuality: '720',
          playingLocalCopy: false,
          currentPosition: resumeAt,
          isPlaying: true,
        ),
        isNull,
      );
    });

    test('a local copy has one rendition, so a swap is a no-op', () {
      // The offline path has only one MP4 saved against the download.
      expect(
        PlayerController.planQualitySwap(
          currentQuality: '480',
          requestedQuality: '720',
          playingLocalCopy: true,
          currentPosition: resumeAt,
          isPlaying: true,
        ),
        isNull,
      );
    });
  });
}
