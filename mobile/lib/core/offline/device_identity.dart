import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';

import '../services/storage_service.dart';

/// Names this install, for the download records the server keeps.
///
/// Every `content_downloads` row carries a device id, so support can answer
/// "why is this locked on my phone but not my brother's" and a licence can be
/// revoked for one device without touching the others.
///
/// It is deliberately not a hardware identifier. ANDROID_ID survives a
/// reinstall, which sounds useful until a student who cleared the app's data
/// to fix something finds their downloads still counted against them. A
/// per-install id errs the other way, and erring towards the student is the
/// right side for a field whose only job is bookkeeping. The device model
/// rides along so a support row reads as something recognisable rather than
/// a bare hash.
class DeviceIdentity {
  DeviceIdentity(this._storage);

  final StorageService _storage;

  static const String _key = 'offline_device_id';

  String? _cached;

  Future<String> id() async {
    final cached = _cached;
    if (cached != null) return cached;

    final stored = _storage.getString(_key);
    if (stored != null && stored.isNotEmpty) {
      _cached = stored;
      return stored;
    }

    final created = '${await _model()}-${_randomSuffix()}';
    await _storage.setString(_key, created);
    _cached = created;
    return created;
  }

  Future<String> _model() async {
    try {
      final info = DeviceInfoPlugin();
      if (defaultTargetPlatform == TargetPlatform.android) {
        final android = await info.androidInfo;
        return _slug('${android.manufacturer} ${android.model}');
      }
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final ios = await info.iosInfo;
        return _slug(ios.utsname.machine);
      }
    } catch (err) {
      // A device that will not describe itself still gets a usable id.
      debugPrint('device: model unavailable: $err');
    }
    return 'device';
  }

  String _slug(String raw) {
    final cleaned = raw
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    return cleaned.isEmpty
        ? 'device'
        : cleaned.substring(0, min(24, cleaned.length));
  }

  String _randomSuffix() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return sha256.convert(bytes).toString().substring(0, 12);
  }
}
