import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'config/router.dart';
import 'core/services/notification_service.dart';
import 'core/services/storage_service.dart';

// Passed at build time: --dart-define=SENTRY_DSN=https://...
// Left empty by default, which keeps crash reporting switched off: there is no
// DSN compiled into a normal build and SentryFlutter.init is never reached.
const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  await Supabase.initialize(
    url: AppConfig.supabaseUrl,
    publishableKey: AppConfig.supabaseAnonKey,
  );

  // Fire-and-forget: notification registration must never block app startup.
  unawaited(NotificationService().initialize());

  final prefs = await SharedPreferences.getInstance();

  final app = ProviderScope(
    overrides: [
      storageServiceProvider.overrideWithValue(StorageService(prefs)),
    ],
    child: const DreamEdgeApp(),
  );

  // With no DSN, run the app exactly as before -- no Sentry, no zone wrapper.
  // With one, hand runApp to Sentry so it installs its error handlers around
  // the whole app and reports what Flutter would otherwise only print.
  if (_sentryDsn.isEmpty) {
    runApp(app);
    return;
  }

  await SentryFlutter.init(
    (options) {
      options.dsn = _sentryDsn;
      options.tracesSampleRate = 1.0;
      // Errors are what we want; device identifiers and request contents are
      // not, and some of them would carry student data.
      options.sendDefaultPii = false;
    },
    appRunner: () => runApp(app),
  );
}
