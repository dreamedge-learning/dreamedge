import 'dart:io';

import 'download_record.dart';
import 'local_library.dart';
import 'offline_store.dart';
import 'server_clock.dart';

/// The real answer to "do we already have this?".
///
/// Replaces [EmptyLocalLibrary] once downloads exist. The player and the
/// reader ask through [LocalLibrary] and never learn that a database is
/// involved.
class OfflineLibrary implements LocalLibrary {
  OfflineLibrary(this._store, this._clock);

  final OfflineStore _store;
  final ServerClock _clock;

  @override
  Future<LocalCopy?> find(String contentItemId) async {
    // Whose copy this is, before anything else. The store scopes its reads to
    // the signed-in student, and this is the second check on the same fact:
    // a phone is shared, and a file on disk does not stop belonging to the
    // sibling who paid for it just because somebody else signed in.
    final owner = await _store.currentOwner();
    if (owner == null) return null;

    final record = await _store.download(contentItemId);
    if (record == null || record.studentId != owner) return null;

    final path = record.localPath;
    if (record.status != DownloadStatus.done || path == null) return null;

    // A lapsed licence is not a usable copy. This is the check that stops a
    // paid lesson being free forever after one download, so it happens before
    // the file is even looked at -- and it is made against the server's clock,
    // because a decision made against the device's is a decision the student
    // makes in their date settings.
    final reading = await _clock.read();
    if (!record.isLicenceValidAt(reading)) return null;

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
    } on FileSystemException {
      // Unreadable is as good as absent to the player, and the record is left
      // alone so a transient storage error does not look like a lost file.
      return null;
    }

    return LocalCopy(
      path: path,
      quality: record.quality,
      licenceExpiresAt: record.licenceExpiresAt,
    );
  }

  @override
  Future<List<SavedFile>> attachments(String contentItemId) async {
    // The lesson's own licence decides, so every check above applies to the
    // worksheets exactly as it does to the video: owner, status, the server's
    // clock, the main file still being there.
    if (await find(contentItemId) == null) return const [];

    final saved = await _store.savedFiles(contentItemId);
    final present = <SavedFile>[];
    for (final file in saved) {
      try {
        if (await File(file.localPath).exists()) present.add(file);
      } on FileSystemException {
        // Unreadable is as good as absent; the reader falls back to the
        // network for it.
      }
    }
    return present;
  }
}
