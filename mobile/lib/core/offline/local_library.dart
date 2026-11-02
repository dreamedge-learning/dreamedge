import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/offline_provider.dart';
import 'offline_library.dart';

/// A copy of one content item sitting on this device.
class LocalCopy {
  /// Absolute path to the file, inside the app's private support directory.
  final String path;

  /// The rendition that was downloaded, e.g. '480'. Null for a document.
  final String? quality;

  /// When the licence lapses and the student must reconnect once. Null means
  /// nothing expires -- a free item with no enrolment behind it.
  ///
  /// For display only. Whether the licence still stands was decided before
  /// this object existed, by [LocalLibrary.find] against the server's clock;
  /// a second answer computed here from `DateTime.now()` is how the date
  /// settings became a way to keep a lesson forever.
  final DateTime? licenceExpiresAt;

  const LocalCopy({required this.path, this.quality, this.licenceExpiresAt});
}

/// Where the player asks "do we already have this?".
///
/// The player needs the answer for two reasons that have nothing to do with
/// downloading: a lesson already on the phone should never be streamed again
/// at the student's expense, and a stream that breaks mid-playback should fall
/// back to the local file rather than to a spinner.
///
/// It is an interface because the store behind it is the offline database,
/// which the player has no business knowing about. [EmptyLocalLibrary] is the
/// answer for anything constructed without that database -- a test, or a
/// screen rendered in isolation.
abstract class LocalLibrary {
  /// The usable copy of [contentItemId], or null if there is none.
  ///
  /// A copy whose licence has lapsed is not usable and must not be returned:
  /// that is the whole mechanism stopping a paid lesson from becoming free
  /// forever once it has been downloaded once.
  Future<LocalCopy?> find(String contentItemId);
}

/// The answer before anything can be downloaded: nothing is here.
class EmptyLocalLibrary implements LocalLibrary {
  const EmptyLocalLibrary();

  @override
  Future<LocalCopy?> find(String contentItemId) async => null;
}

final localLibraryProvider = Provider<LocalLibrary>((ref) {
  return OfflineLibrary(
    ref.watch(offlineStoreProvider),
    ref.watch(serverClockProvider),
  );
});
