import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../logging/app_log.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  /// A pending route the router pushes once the app is live.
  ///
  /// The router listens on this notifier -- a plain field like the old
  /// `_pendingRoute` had no way of reaching the router after a background
  /// tap, so a notification that opened the app from cold start never
  /// navigated anywhere. Setting a non-null value here notifies the
  /// router; it then reads and clears via `consumePendingRoute`.
  final ValueNotifier<String?> pendingRouteNotifier = ValueNotifier<String?>(null);

  /// Called when the student presses a button on a notification rather than
  /// the notification itself.
  ///
  /// The download notifier registers this. The plugin is one channel to the
  /// platform however many Dart objects wrap it, so a second `initialize()`
  /// elsewhere would silently replace the handler installed here and take FCM
  /// tap routing with it. Sharing the one handler is the way to avoid that.
  void Function(String actionId, String? payload)? onAction;

  /// The shared plugin, for code that needs to post its own notifications.
  FlutterLocalNotificationsPlugin get plugin => _localNotifications;

  Future<void> initialize() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    const androidChannel = AndroidNotificationChannel(
      'dream_edge_main',
      'Dream Edge Notifications',
      description: 'Notifications from Dream Edge Online',
      importance: Importance.high,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(androidChannel);

    final token = await _messaging.getToken();
    if (token != null) {
      await _saveTokenToSupabase(token);
    }

    _messaging.onTokenRefresh.listen(_saveTokenToSupabase);

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    }
  }

  Future<void> _saveTokenToSupabase(String token) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    try {
      await Supabase.instance.client.from('device_tokens').upsert(
        {
          'user_id': user.id,
          'token': token,
          'platform': 'android',
          'updated_at': DateTime.now().toIso8601String(),
        },
        onConflict: 'user_id,token',
      );
    } catch (e) {
      logDebug('notifications', 'device token upsert failed: $e');
    }
  }

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'dream_edge_main',
          'Dream Edge Notifications',
          channelDescription: 'Notifications from Dream Edge Online',
          importance: Importance.high,
          priority: Priority.high,
          color: Color(0xFFF26A21),
        ),
      ),
      payload: message.data['route'] as String?,
    );
  }

  void _handleNotificationTap(RemoteMessage message) {
    final route = message.data['route'];
    if (route is String && route.isNotEmpty) {
      pendingRouteNotifier.value = route;
    }
  }

  void _onNotificationTapped(NotificationResponse response) {
    final actionId = response.actionId;
    if (actionId != null && actionId.isNotEmpty) {
      onAction?.call(actionId, response.payload);
      return;
    }

    final route = response.payload;
    if (route != null && route.isNotEmpty) {
      pendingRouteNotifier.value = route;
    }
  }

  /// Reads the pending route and clears it. The router calls this once it
  /// has navigated so the same route is not pushed twice on a hot restart.
  String? consumePendingRoute() {
    final route = pendingRouteNotifier.value;
    pendingRouteNotifier.value = null;
    return route;
  }

  Future<void> subscribeToTopic(String topic) async {
    await _messaging.subscribeToTopic(topic);
  }

  Future<void> unsubscribeFromTopic(String topic) async {
    await _messaging.unsubscribeFromTopic(topic);
  }
}
