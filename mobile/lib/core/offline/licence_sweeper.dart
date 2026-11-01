import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'download_record.dart';
import 'offline_store.dart';

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

/// Keeps downloaded files honest.
///
/// A download leaves our reach the moment it lands on the phone, so without
/// this a paid lesson becomes permanently free the first time it is saved, a
/// refund revokes nothing, and a lapsed enrolment keeps playing forever.
///
/// Every successful check pushes the licences of items the student still has
/// out to `min(enrolment expiry, now + offline_license_days)`, and takes away
/// the ones they no longer have. A device that never comes back online never
/// gets an extension, so its licences simply run out -- which is the whole of
/// the aeroplane-mode defence, and why the expiry is stored as a date rather
/// than inferred from a counter.
///
/// It leans on `check_offline_entitlements`, the same function the website and
/// the Edge Function use, so "who has paid" cannot mean one thing here and
/// another there.
class LicenceSweeper {
  LicenceSweeper({required this._client, required this._store});

  final SupabaseClient _client;
  final OfflineStore _store;

  /// Re-checks every download against the server.
  ///
  /// Returns the number of items that lost their licence, so the caller can
  /// tell the student rather than letting them find a lesson missing.
  ///
  /// Throws nothing: a sweep that cannot reach the server is not a failure
  /// the student needs to see, it is just a sweep that did not happen, and
  /// the licences already on disk decide what plays until the next one.
  Future<int> sweep() async {
    final downloads = await _store.allDownloads();
    if (downloads.isEmpty) {
      // Still worth stamping: a student with nothing downloaded who later
      // saves something should not inherit a stale heartbeat.
      await _store.markVerifiedNow();
      return 0;
    }

    final Map<String, _Entitlement> entitlements;
    try {
      entitlements = await _fetch();
    } catch (err) {
      debugPrint('licences: sweep skipped: $err');
      return 0;
    }

    var revoked = 0;
    final now = DateTime.now();

    for (final record in downloads) {
      final entitlement = entitlements[record.contentItemId];

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
        // A copy that expired while the student was away comes back when they
        // are entitled again and the bytes are still there.
        if (record.status == DownloadStatus.expired && record.localPath != null)
          'status': DownloadStatus.done.name,
      }, announce: false);
    }

    await _store.markVerifiedNow();
    return revoked;
  }

  Future<Map<String, _Entitlement>> _fetch() async {
    final rows = await _client.rpc('check_offline_entitlements');
    final map = <String, _Entitlement>{};

    if (rows is! List) return map;

    for (final row in rows) {
      if (row is! Map) continue;

      final id = row['content_item_id'] as String?;
      if (id == null) continue;

      final rawValidUntil = row['valid_until'] as String?;

      map[id] = _Entitlement(
        validUntil: rawValidUntil == null
            ? null
            : DateTime.tryParse(rawValidUntil),
        offlineLicenseDays:
            (row['offline_license_days'] as num?)?.toInt() ?? 30,
        isDownloadable: row['is_downloadable'] == true,
      );
    }

    return map;
  }

  /// Marks the copy expired and removes the file.
  ///
  /// The file goes, not just the flag. Leaving the bytes on disk behind a
  /// boolean would make revocation a matter of trusting the app, and it would
  /// go on costing the student storage for something they cannot watch.
  Future<void> _revoke(DownloadRecord record) async {
    final path = record.localPath;
    if (path != null) {
      try {
        final file = File(path);
        if (await file.exists()) await file.delete();
      } catch (err) {
        debugPrint('licences: could not delete $path: $err');
      }
    }

    await _store.patchDownload(record.contentItemId, {
      'status': DownloadStatus.expired.name,
      'local_path': null,
      'bytes_done': 0,
      'error': 'No longer available offline.',
    });
  }
}
