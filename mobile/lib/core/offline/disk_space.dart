import 'dart:io';

import 'package:flutter/services.dart';

/// How much room is left where downloads go.
///
/// There is no answer to this in `dart:io`, and the one this replaced came
/// from `Process.run('df', ...)`: a parse of a human-readable table, wrapped
/// in a catch that swallowed the throw. On Android it mostly worked; anywhere
/// a process cannot be spawned it silently returned null, so the space check
/// simply did not happen and the student found out when the write failed.
///
/// So the figure comes from the platform through a channel of our own. Android
/// answers from `StatFs.availableBytes`, which is what this app may actually
/// write rather than what is physically unused. There is no iOS target in this
/// project yet; when there is, it answers the same channel from
/// `volumeAvailableCapacityForImportantUsage` and nothing here changes.
class DiskSpace {
  const DiskSpace();

  static const MethodChannel _channel = MethodChannel(
    'com.dreamedge.mobile/storage',
  );

  /// Free bytes on the volume holding [path], or null when the platform will
  /// not say.
  ///
  /// Null means "unknown", and every caller treats it as such: the check is
  /// skipped rather than guessed at, and a genuinely full device then fails
  /// the write with a real disk error. Refusing a download on a figure we do
  /// not have would be the worse mistake.
  Future<int?> freeBytes(String path) async {
    if (!Platform.isAndroid && !Platform.isIOS) return null;

    try {
      final bytes = await _channel.invokeMethod<int>('freeBytes', {
        'path': path,
      });
      if (bytes == null || bytes < 0) return null;
      return bytes;
    } on MissingPluginException {
      // The host has no handler -- a platform this channel has not been
      // implemented for, or a test harness.
      return null;
    } on PlatformException {
      return null;
    }
  }
}
