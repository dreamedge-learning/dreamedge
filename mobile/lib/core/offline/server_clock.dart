import 'dart:math';

import 'offline_store.dart';

/// The time, as the server last reported it, carried forward by this device.
///
/// Every licence decision used to be `DateTime.now()` against a stored epoch,
/// which made the paywall a setting in the student's own hands: buy one month,
/// download the course, set the phone back a year, stay in airplane mode, keep
/// it. The clock is the enforcement surface, so it cannot be the device's.
///
/// What this holds is an anchor -- the server's own `now` and this device's
/// clock at the moment that answer arrived -- and it carries that anchor
/// forward by however much the device clock has since advanced. Moving the
/// clock forward only shortens a licence, which is the student's business.
/// Moving it backwards is the attack, and it is caught two ways: the elapsed
/// time goes negative, and the reading falls behind the high-water mark of
/// every device clock this install has ever seen. Either one makes the reading
/// untrusted, and an untrusted reading locks the downloads until a real server
/// answer re-anchors it.
class ServerClock {
  ServerClock(this._store);

  final OfflineStore _store;

  /// A clock can legitimately step backwards a little: an NTP correction after
  /// a long sleep, or a handset that kept rough time on a dead battery. A
  /// couple of minutes of slack keeps those from locking a paid download,
  /// while a rollback big enough to buy free content is nowhere near it.
  static const Duration _slack = Duration(minutes: 2);

  /// The high-water mark is rewritten only when it moves by more than this, so
  /// a reading on every playback attempt does not turn into a write on every
  /// playback attempt.
  static const Duration _highWaterStep = Duration(minutes: 1);

  /// Reads the clock.
  ///
  /// Always goes to the store rather than caching: an anchor written by a
  /// sweep on one isolate has to be visible to the player on the next, and the
  /// read is a single indexed row.
  Future<ClockReading> read() async {
    final anchor = await _store.clockAnchor();
    final deviceNow = DateTime.now();

    if (anchor == null) {
      // Nothing has ever answered. A download cannot exist without a server
      // call that would have anchored this, so in practice only a fresh
      // install lands here -- and a fresh install has nothing to gate.
      return ClockReading(now: deviceNow, trusted: false);
    }

    final elapsed = deviceNow.difference(anchor.deviceAt);
    final behindHighWater = anchor.deviceHighWater.difference(deviceNow);

    final rolledBack =
        elapsed < -_slack || behindHighWater > _slack;

    if (!rolledBack && deviceNow.difference(anchor.deviceHighWater) > _highWaterStep) {
      await _store.raiseClockHighWater(deviceNow);
    }

    // Never earlier than the anchor itself: a rollback must not buy time back,
    // only lose the student the trust that would have let them play at all.
    final forward = elapsed.isNegative ? Duration.zero : elapsed;

    return ClockReading(
      now: anchor.serverNow.add(forward),
      trusted: !rolledBack,
    );
  }

  /// Records a fresh answer from the server.
  ///
  /// Called from every path that gets a server timestamp -- a playback token, a
  /// document source, a licence sweep -- because the more often this is
  /// re-anchored the smaller the window in which a device clock can drift far
  /// enough to matter.
  Future<void> anchor(DateTime serverNow) async {
    final deviceNow = DateTime.now();
    await _store.writeClockAnchor(
      serverNow: serverNow.toUtc(),
      deviceAt: deviceNow,
      deviceHighWater: deviceNow,
    );
  }
}

/// What the clock says, and whether it can be believed.
class ClockReading {
  /// The best estimate of the server's current time.
  final DateTime now;

  /// False when this device's clock has moved backwards since the last server
  /// answer, or when no server answer has ever arrived. A download must not
  /// play against an untrusted reading: that is the whole of the
  /// clock-tampering defence.
  final bool trusted;

  const ClockReading({required this.now, required this.trusted});

  /// The reading to use where there is no store to ask -- a test, or a widget
  /// rendered in isolation. Untrusted, so nothing is gated open by it.
  factory ClockReading.untrusted() =>
      ClockReading(now: DateTime.now(), trusted: false);

  /// Whether a licence that runs out at [expiresAt], last confirmed by the
  /// server at [lastVerifiedAt] and good for [licenceDays] from that
  /// confirmation, still stands.
  ///
  /// Two ceilings, and the lower one wins. The stored expiry is the one the
  /// server set; the verification window is the backstop for a device that
  /// stopped checking in, so a row whose expiry was written far in the future
  /// by some earlier bug still cannot outlive its last real check.
  bool licenceStands({
    DateTime? expiresAt,
    DateTime? lastVerifiedAt,
    int? licenceDays,
  }) {
    if (!trusted) return false;

    if (expiresAt != null && !now.isBefore(expiresAt)) return false;

    if (lastVerifiedAt != null && licenceDays != null) {
      final window = lastVerifiedAt.add(Duration(days: max(1, licenceDays)));
      if (!now.isBefore(window)) return false;
    }

    return true;
  }
}

/// The persisted anchor: what the server said, and when this device heard it.
class ClockAnchor {
  final DateTime serverNow;
  final DateTime deviceAt;
  final DateTime deviceHighWater;

  const ClockAnchor({
    required this.serverNow,
    required this.deviceAt,
    required this.deviceHighWater,
  });
}
