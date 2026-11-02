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
/// time goes negative, and the reading falls behind the device-clock high
/// water mark that `anchor()` records on every real server response. Either
/// one makes the reading untrusted; `licenceStands` then still honours a
/// licence whose server-anchored time is comfortably inside the expiry, so
/// a corrected device clock does not spike a paid download, while a rollback
/// onto an already-expired licence still fails.
///
/// The high-water mark is advanced only when a server call confirms the
/// device clock -- an opportunistic read on an untrusted clock cannot write
/// it. That matters because a one-off forward NTP jump used to persist a
/// mark the real time could never catch up to, and the student lost the
/// downloads to the correction.
class ServerClock {
  ServerClock(this._store);

  final OfflineStore _store;

  /// A clock can legitimately step backwards: an NTP correction after a long
  /// sleep, a handset that kept rough time on a dead battery, a daylight-
  /// saving boundary set up wrong, or a device whose BIOS clock reset after
  /// a flat battery and only syncs the real time once a page is loaded.
  ///
  /// The old slack of two minutes caught every one of those as tampering.
  /// A paid download then showed locked on the bus, with no connection to
  /// re-anchor through, over something the student did not do. Widen it to
  /// an hour -- a rollback big enough to materially extend a licence is
  /// well past that, and the high-water logic below is still what catches
  /// a determined attacker rolling back day by day between anchors.
  static const Duration _slack = Duration(hours: 1);

  /// If the clock reading is marked untrusted but the server's own anchor is
  /// still comfortably inside the licence's expiry, `licenceStands` honours
  /// the licence anyway (see below). A full day of margin means a corrected
  /// clock does not spike a download that would otherwise have had weeks of
  /// life left -- the attack we are catching is rolling back onto a licence
  /// that has already expired, and that still fails.
  static const Duration _untrustedMargin = Duration(days: 1);

  /// Reads the clock.
  ///
  /// Always goes to the store rather than caching: an anchor written by a
  /// sweep on one isolate has to be visible to the player on the next, and the
  /// read is a single indexed row.
  ///
  /// The high-water mark is not raised here. The earlier shape wrote
  /// deviceHighWater on every opportunistic read, which turned a one-off
  /// forward NTP jump (or a battery-recovery day in 2099) into a persisted
  /// mark the real time could never catch up to. The anchor path is the one
  /// that advances it now, because that path has a server timestamp to
  /// cross-check against.
  Future<ClockReading> read() async {
    final anchor = await _store.clockAnchor();
    final deviceNow = DateTime.now();

    if (anchor == null) {
      // Nothing has ever answered. A download cannot exist without a server
      // call that would have anchored this, so in practice only a fresh
      // install lands here -- and a fresh install has nothing to gate.
      return ClockReading(
        now: deviceNow,
        trusted: false,
        anchoredServerNow: null,
        elapsedSinceAnchor: Duration.zero,
      );
    }

    final elapsed = deviceNow.difference(anchor.deviceAt);
    final behindHighWater = anchor.deviceHighWater.difference(deviceNow);

    final rolledBack = elapsed < -_slack || behindHighWater > _slack;

    // Never earlier than the anchor itself: a rollback must not buy time back,
    // only lose the student the trust that would have let them play at all.
    final forward = elapsed.isNegative ? Duration.zero : elapsed;

    return ClockReading(
      now: anchor.serverNow.add(forward),
      trusted: !rolledBack,
      anchoredServerNow: anchor.serverNow,
      elapsedSinceAnchor: forward,
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
  /// answer, or when no server answer has ever arrived.
  ///
  /// An untrusted reading does not shut every door on its own. `licenceStands`
  /// still honours a licence whose server-anchored time is comfortably inside
  /// the expiry (see [ServerClock._untrustedMargin]) -- the attack the
  /// trusted flag was really guarding against is a rollback onto a licence
  /// that has already run out, and that still fails. A device that corrects
  /// its own clock backwards does not deserve to lose a weeks-long paid
  /// download over the correction itself.
  final bool trusted;

  /// What the server was last known to think the time was, before this
  /// device's clock gets added in. Null only on a fresh install.
  final DateTime? anchoredServerNow;

  /// How much the device clock has moved forward since the anchor. Clamped
  /// at zero: a rollback is still never allowed to buy more playback time,
  /// only to lose trust in the reading itself.
  final Duration elapsedSinceAnchor;

  const ClockReading({
    required this.now,
    required this.trusted,
    this.anchoredServerNow,
    this.elapsedSinceAnchor = Duration.zero,
  });

  /// The reading to use where there is no store to ask -- a test, or a widget
  /// rendered in isolation. Untrusted, so nothing is gated open by it.
  factory ClockReading.untrusted() => ClockReading(
    now: DateTime.now(),
    trusted: false,
  );

  /// Whether a licence that runs out at [expiresAt], last confirmed by the
  /// server at [lastVerifiedAt] and good for [licenceDays] from that
  /// confirmation, still stands.
  ///
  /// Two ceilings, and the lower one wins. The stored expiry is the one the
  /// server set; the verification window is the backstop for a device that
  /// stopped checking in, so a row whose expiry was written far in the future
  /// by some earlier bug still cannot outlive its last real check.
  ///
  /// When the reading is untrusted (device clock rolled back more than the
  /// slack) we still trust a licence whose server-anchored time plus the
  /// forward motion of this device is comfortably inside both ceilings.
  /// That carves off the case the previous shape got wrong: a corrected
  /// clock does not lock a download whose licence had weeks of life left,
  /// while a rollback onto an expired licence (what the trust flag was
  /// meant to catch) still fails -- the stored expiry is in the past
  /// relative to any safe anchor.
  bool licenceStands({
    DateTime? expiresAt,
    DateTime? lastVerifiedAt,
    int? licenceDays,
  }) {
    final safeNow = trusted ? now : _safeAnchoredNow();
    if (safeNow == null) return false;

    final margin = trusted ? Duration.zero : ServerClock._untrustedMargin;

    if (expiresAt != null && !safeNow.add(margin).isBefore(expiresAt)) {
      return false;
    }

    if (lastVerifiedAt != null && licenceDays != null) {
      final window = lastVerifiedAt.add(Duration(days: max(1, licenceDays)));
      if (!safeNow.add(margin).isBefore(window)) return false;
    }

    return true;
  }

  /// The server's last-known time, plus any clamped forward motion. Used only
  /// as a fallback when the reading itself is untrusted -- the attacker's
  /// rollback cannot push this earlier than the anchor itself.
  DateTime? _safeAnchoredNow() {
    final serverAnchor = anchoredServerNow;
    if (serverAnchor == null) return null;
    return serverAnchor.add(elapsedSinceAnchor);
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
