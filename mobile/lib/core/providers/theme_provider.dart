import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/router.dart' show storageServiceProvider;
import '../services/storage_service.dart';

/// The student's appearance choice, remembered across launches.
///
/// Defaults to [ThemeMode.system] rather than light: a student studying at
/// night has usually already told the phone they want a dark screen, and
/// overriding that is the thing people notice.
const String themeModeStorageKey = 'theme_mode';

ThemeMode themeModeFromName(String? raw) {
  switch (raw) {
    case 'light':
      return ThemeMode.light;
    case 'dark':
      return ThemeMode.dark;
    default:
      return ThemeMode.system;
  }
}

String themeModeName(ThemeMode mode) {
  switch (mode) {
    case ThemeMode.light:
      return 'light';
    case ThemeMode.dark:
      return 'dark';
    case ThemeMode.system:
      return 'system';
  }
}

/// How the choice reads in the picker.
String themeModeLabel(ThemeMode mode) {
  switch (mode) {
    case ThemeMode.light:
      return 'Light';
    case ThemeMode.dark:
      return 'Dark';
    case ThemeMode.system:
      return 'Match device';
  }
}

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier(this._storage)
      : super(themeModeFromName(_storage.getString(themeModeStorageKey)));

  final StorageService _storage;

  Future<void> setMode(ThemeMode mode) async {
    if (mode == state) return;
    // The screen repaints first and the write follows: a preference that
    // takes a disk round trip to apply feels broken.
    state = mode;
    await _storage.setString(themeModeStorageKey, themeModeName(mode));
  }
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref.watch(storageServiceProvider));
});
