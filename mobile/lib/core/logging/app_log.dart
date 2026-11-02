import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// The one place the app writes a diagnostic.
///
/// There were 22 bare `debugPrint` calls scattered through the player and the
/// offline layer. Several printed absolute file paths and one printed the
/// Supabase host on every connectivity change, which is a student's logcat
/// telling anyone reading it where the paid content is kept. `debugPrint` is
/// also only nominally debug-only: it compiles into a release build and runs,
/// it just usually has nowhere to go.
///
/// So they go through here instead. In release this is a no-op the tree-shaker
/// removes; in debug it reaches the usual developer log with the area it came
/// from, so a player problem can be read apart from a download problem.
///
/// What does not belong in a message: file paths, URLs, tokens, student ids.
/// If a message needs one of those to be useful, it is the wrong message --
/// name the operation that failed instead.
void logDebug(String area, String message) {
  if (!kDebugMode) return;
  developer.log(message, name: 'dreamedge.$area');
}
