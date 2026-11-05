
import 'package:supabase_flutter/supabase_flutter.dart';

import 'device_identity.dart';
import 'download_record.dart';
import 'offline_paths.dart';
import 'offline_store.dart';
import 'server_clock.dart';

/// One item the student is still entitled to, as the server sees it.
class _Entitlement {
  final DateTime? validUntil;
  final int offlineLicenseDays;
  final bool isDownloadable;

  const _Entitlement({
    required this.validUntil,
    required this.offlineLicenseDays,
    required this.isDownloadable,
  });
}

/// The server's answer to "what may this student keep".
class _CheckIn {
  /// The server's own clock at the moment it answered.
  final DateTime serverNow;

  /// Null when the server could not resolve the caller to a student at all --
  /// which is a reason to leave every file alone, not to delete them.
  final String? studentId;

  final Map<String, _Entitlement> entitlements;

  const _CheckIn({
    required this.serverNow,
    required this.studentId,
    required this.entitlements,
  });
}

/// The check could not be completed. Nothing is revoked on this.
class LicenceCheckFailed implements Exception {
  final String reason;
  const LicenceCheckFailed(this.reason);

  @override
  String toString() => 'Licence check failed: $reason';
}

/// How a sweep ended.
enum SweepResult {
  /// The server answered and the answer was acted on.
  done,

  /// The server could not be reached, or answered something unusable, or
  /// answered in a way that cannot be told apart from a fault. Nothing was
  /// revoked.
  inconclusive,
}

class SweepOutcome {
  final SweepResult result;

  /// How many copies lost their licence, so the caller can tell the student
  /// rather than letting them find a lesson missing.
  final int revoked;

  const SweepOutcome(this.result, this.revoked);

  static const inconclusive = SweepOutcome(SweepResult.inconclusive, 0);
}

/// Keeps downloaded files honest.
///
/// A download leaves our reach the moment it lands on the phone, so without
/// this a paid lesson becomes permanently free the first time it is saved, a
/// refund revokes nothing, and a lapsed enrolment keeps playing forever.
///
/// Every successful check pushes the licences of items the student still has
/// out to `min(enrolment expiry, server now + offline_license_days)`, and
/// takes away the ones they no longer have. A device that never comes back
/// online never gets an extension, so its licences simply run out -- which is
/// the whole of the aeroplane-mode defence, and why the expiry is a date
/// against the server's clock rather than a counter against the device's.
///
/// It leans on `offline_check_in`, which wraps `check_offline_entitlements` --
/// the same function the website and the Edge Function use -- so "who has
/// paid" cannot mean one thing here and another there.
///
/// The rule it will not break: an answer that might be a fault revokes
/// nothing. Deleting a student's 4 GB of downloads because a query came back
/// strangely is a far worse failure than leaving a lapsed copy playable for
/// one more day, and the only honest way to tell the two apart is to ask the
/// server who it thinks is calling.
class LicenceSweeper {
  LicenceSweeper({
    required this._client,
    required this._store,
    required this._clock,
    required this._device,
  });

  final SupabaseClient _client;
  final OfflineStore _store;
  final ServerClock _clock;
  final DeviceIdentity _device;

  /// How many empty answers in a row it takes before files are deleted.
  ///
  /// An empty entitlement list is a real state -- every enrolment lapsed, or
  /// every item unpublished -- but it is also what a fault looks like from
  /// here. A genuine full revocation is rare and is not made worse by taking
  /// one more sweep to act on, while a spurious one costs the student a
  /// re-download of everything they own.
  static const int _emptyAnswersBeforeRevoking = 2;

  /// Re-checks every download against the server.
  Future<SweepOutcome> sweep() async {
    final downloads = await _store.allDownloads();

    final _CheckIn checkIn;
    try {
      checkIn = await _fetch();
    } on LicenceCheckFailed {
      // Cannot reach the server, or it said something this code does not
      // understand. The licences already on disk decide what plays until the
      // next sweep.
      return SweepOutcome.inconclusive;
    } catch (_) {
      return SweepOutcome.inconclusive;
    }

    // The clock is worth anchoring whatever else the answer said: it came from
    // the server and it is the only time a licence may be measured against.
    await _clock.anchor(checkIn.serverNow);

    if (checkIn.studentId == null) {
      // The server could not say who is calling. This is the exact shape of
      // the bug that used to delete every file on the device, so it is named
      // and refused rather than treated as "entitled to nothing".
      return SweepOutcome.inconclusive;
    }

    if (downloads.isEmpty) {
      // Still worth stamping: a student with nothing downloaded who later
      // saves something should not inherit a stale heartbeat.
      await _store.markVerifiedAt(checkIn.serverNow);
      await _store.setEmptyEntitlementRuns(0);
      return const SweepOutcome(SweepResult.done, 0);
    }

    if (checkIn.entitlements.isEmpty) {
      final runs = await _store.emptyEntitlementRuns() + 1;
      await _store.setEmptyEntitlementRuns(runs);

      if (runs < _emptyAnswersBeforeRevoking) {
        // Suspicious, not conclusive. Leave the files, do not stamp the
        // heartbeat -- an inconclusive check is not a check -- and wait to see
        // whether the next sweep says the same thing.
        return SweepOutcome.inconclusive;
      }
    } else {
      await _store.setEmptyEntitlementRuns(0);
    }

    var revoked = 0;
    final now = checkIn.serverNow;

    for (final record in downloads) {
      final entitlement = checkIn.entitlements[record.contentItemId];

      // Gone from the list, or the admin turned offline off for it. Either
      // way the copy on this device is no longer allowed to exist.
      if (entitlement == null || !entitlement.isDownloadable) {
        if (record.status != DownloadStatus.expired) revoked++;
        await _revoke(record);
        continue;
      }

      final byPolicy = now.add(Duration(days: entitlement.offlineLicenseDays));
      final enrolment = entitlement.validUntil;
      final expiry = enrolment != null && enrolment.isBefore(byPolicy)
          ? enrolment
          : byPolicy;

      // An enrolment that has already run out revokes rather than extends.
      if (expiry.isBefore(now)) {
        if (record.status != DownloadStatus.expired) revoked++;
        await _revoke(record);
        continue;
      }

      await _store.patchDownload(record.contentItemId, {
        'licence_expires_at': expiry.millisecondsSinceEpoch,
        'licence_days': entitlement.offlineLicenseDays,
        'last_verified_at': now.millisecondsSinceEpoch,
        // A copy that expired while the student was away comes back when they
        // are entitled again and the bytes are still there.
        if (record.status == DownloadStatus.expired && record.localPath != null)
          'status': DownloadStatus.done.name,
      }, announce: false);
    }

    await _store.markVerifiedAt(now);
    return SweepOutcome(SweepResult.done, revoked);
  }

  /// Asks the server, and refuses to guess at an answer it does not recognise.
  ///
  /// Every malformed shape throws. The previous version returned an empty map
  /// instead, and an empty map meant "revoke everything" to the loop above.
  Future<_CheckIn> _fetch() async {
    final Object? response;
    try {
      response = await _client.rpc(
        'offline_check_in',
        params: {'p_device_id': await _device.id()},
      );
    } catch (err) {
      throw LicenceCheckFailed('$err');
    }

    if (response is! Map) {
      throw const LicenceCheckFailed('answer was not an object');
    }

    final rawNow = response['server_now'];
    final serverNow = rawNow is String ? DateTime.tryParse(rawNow) : null;
    if (serverNow == null) {
      throw const LicenceCheckFailed('answer carried no server clock');
    }

    final rawRows = response['entitlements'];
    if (rawRows is! List) {
      throw const LicenceCheckFailed('entitlements was not a list');
    }

    final entitlements = <String, _Entitlement>{};
    for (final row in rawRows) {
      if (row is! Map) {
        throw const LicenceCheckFailed('an entitlement was not an object');
      }

      final id = row['content_item_id'] as String?;
      if (id == null) {
        throw const LicenceCheckFailed('an entitlement had no item id');
      }

      final rawValidUntil = row['valid_until'] as String?;

      // Every other missing field in this function throws rather than
      // guesses -- the point of `_fetch` is that an answer we cannot read
      // becomes a visible failure instead of the empty map that used to
      // mean "revoke everything" to the loop above. `is_downloadable`
      // used to be `row['is_downloadable'] == true`, which read `false`
      // on a missing or non-boolean key, and because that path is also
      // what feeds the revoke-and-delete step at :174 a wrong answer
      // here would silently take the file off the disk. The column is
      // not nullable today, but match the function's own rule.
      final rawDownloadable = row['is_downloadable'];
      if (rawDownloadable is! bool) {
        throw const LicenceCheckFailed(
          'an entitlement did not say whether it was downloadable',
        );
      }

      entitlements[id] = _Entitlement(
        validUntil: rawValidUntil == null
            ? null
            : DateTime.tryParse(rawValidUntil),
        offlineLicenseDays:
            (row['offline_license_days'] as num?)?.toInt() ?? 30,
        isDownloadable: rawDownloadable,
      );
    }

    return _CheckIn(
      serverNow: serverNow.toUtc(),
      studentId: response['student_id'] as String?,
      entitlements: entitlements,
    );
  }

  /// Marks the copy expired and removes the file.
  ///
  /// The file goes, not just the flag. Leaving the bytes on disk behind a
  /// boolean would make revocation a matter of trusting the app, and it would
  /// go on costing the student storage for something they cannot watch.
  Future<void> _revoke(DownloadRecord record) async {
    // Every file saved with the lesson goes, not only the main one: an
    // attachment left behind would be a paid worksheet outliving the licence
    // it came under. Failures are swallowed inside -- bytes outliving the
    // record are a storage leak, not a paywall hole, because the record is
    // what the player and the reader check, and it is about to say expired.
    final saved = await _store.savedFiles(record.contentItemId);
    await OfflinePaths.deleteLesson(
      contentItemId: record.contentItemId,
      mainPath: record.localPath,
      others: saved.map((file) => file.localPath),
    );
    await _store.forgetSavedFiles(record.contentItemId);

    await _store.patchDownload(record.contentItemId, {
      'status': DownloadStatus.expired.name,
      'local_path': null,
      'bytes_done': 0,
      'error': 'No longer available offline.',
    });
  }
}
