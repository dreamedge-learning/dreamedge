import 'package:flutter/foundation.dart';

import '../services/storage_service.dart';

/// Which rendition to save, when the student has an opinion.
enum DownloadQuality {
  /// Smallest file. Four hours of lessons in under a gigabyte.
  low('360', '360p · smallest'),

  /// The default. Readable on a phone, kind to a data pack.
  standard('480', '480p · recommended'),

  /// Worth it on a tablet, or where the board work is fine.
  high('720', '720p · sharpest');

  const DownloadQuality(this.height, this.label);

  /// The key of the MP4 rendition map, which is the height as a string.
  final String height;
  final String label;

  static DownloadQuality fromName(String? raw) {
    for (final value in DownloadQuality.values) {
      if (value.name == raw) return value;
    }
    return DownloadQuality.standard;
  }
}

/// The student's download preferences.
///
/// Both of these are about not spending something the student cannot spare.
/// Mobile data in Kalmeshwar is bought by the gigabyte, and a 700 MB lesson
/// that downloads itself over a data pack is a complaint, not a feature --
/// which is why Wi-Fi-only is on by default and the quality defaults to the
/// middle rung rather than the best one.
class DownloadSettings extends ChangeNotifier {
  DownloadSettings(this._storage);

  final StorageService _storage;

  static const String _wifiOnlyKey = 'downloads_wifi_only';
  static const String _qualityKey = 'downloads_quality';

  bool get wifiOnly => _storage.getString(_wifiOnlyKey) != 'false';

  DownloadQuality get quality =>
      DownloadQuality.fromName(_storage.getString(_qualityKey));

  /// The rendition to ask for, given the connection in use.
  ///
  /// On a metered connection the preference is capped at 480p even when the
  /// student asked for 720p: they chose a quality for downloads in general,
  /// not for this particular gigabyte.
  String heightFor({required bool metered}) {
    if (!metered) return quality.height;
    return quality == DownloadQuality.high
        ? DownloadQuality.standard.height
        : quality.height;
  }

  Future<void> setWifiOnly(bool value) async {
    await _storage.setString(_wifiOnlyKey, value ? 'true' : 'false');
    notifyListeners();
  }

  Future<void> setQuality(DownloadQuality value) async {
    await _storage.setString(_qualityKey, value.name);
    notifyListeners();
  }
}
