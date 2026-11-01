import 'dart:io';

import 'package:flutter/foundation.dart';

import 'download_record.dart';
import 'local_library.dart';
import 'offline_store.dart';

/// The real answer to "do we already have this?".
///
/// Replaces [EmptyLocalLibrary] once downloads exist. The player and the
/// reader ask through [LocalLibrary] and never learn that a database is
/// involved.
class OfflineLibrary implements LocalLibrary {
  OfflineLibrary(this._store);

  final OfflineStore _store;

  @override
  Future<LocalCopy?> find(String contentItemId) async {
    final record = await _store.download(contentItemId);
    if (record == null) return null;

    final path = record.localPath;
    if (record.status != DownloadStatus.done || path == null) return null;

    // A lapsed licence is not a usable copy. This is the check that stops a
    // paid lesson being free forever after one download, so it happens before
    // the file is even looked at.
    if (!record.isLicenceValid) return null;

    // The file can go missing without us: Android reclaims app storage under
    // pressure, and a student can clear app data. A record pointing at
    // nothing would send the player to a file that cannot open.
    try {
      if (!await File(path).exists()) {
        await _store.patchDownload(contentItemId, {
          'status': DownloadStatus.failed.name,
          'local_path': null,
          'bytes_done': 0,
          'error': 'The saved file is no longer on this device.',
        });
        return null;
      }
    } catch (err) {
      debugPrint('offline: could not check $path: $err');
      return null;
    }

    return LocalCopy(
      path: path,
      quality: record.quality,
      licenceExpiresAt: record.licenceExpiresAt,
    );
  }
}
