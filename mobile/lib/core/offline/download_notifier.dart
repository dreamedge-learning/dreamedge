import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/notification_service.dart';
import 'download_record.dart';

/// The ongoing notification that shows downloads getting on with it.
///
/// A student who starts a 700 MB lesson and then locks the phone needs some
/// sign that it is still going, and somewhere to stop it that is not "find
/// the app again". One notification for the whole queue rather than one each:
/// six lessons downloading should not be six rows in the shade.
///
/// Android treats a long download as work that should be visible, which is
/// what FOREGROUND_SERVICE_DATA_SYNC in the manifest declares. The transfer
/// itself still runs in the Dart isolate, so this notification is the user's
/// window onto it rather than the thing keeping it alive -- a download will
/// not survive the system killing the app, which is what the resumable queue
/// is for.
class DownloadNotifier {
  DownloadNotifier({
    required this._onPauseAll,
    required this._onResumeAll,
    required this._onCancelAll,
  }) {
    // Registered here rather than at construction of the service, so the
    // handler and the buttons that need it are created together.
    NotificationService().onAction = _handleAction;
  }

  final Future<void> Function() _onPauseAll;
  final Future<void> Function() _onResumeAll;
  final Future<void> Function() _onCancelAll;

  static const int _notificationId = 94001;
  static const String _channelId = 'dream_edge_downloads';

  static const String actionPause = 'downloads_pause';
  static const String actionResume = 'downloads_resume';
  static const String actionCancel = 'downloads_cancel';

  bool _channelReady = false;
  bool _permissionAsked = false;
  bool _visible = false;

  FlutterLocalNotificationsPlugin get _plugin => NotificationService().plugin;

  /// Asks for notification permission at the moment it is first needed.
  ///
  /// Not at launch. A permission prompt on a first run, before the student has
  /// seen anything, is the one most often refused -- and refusing it here only
  /// costs a progress bar, so asking when the progress bar is about to exist
  /// is both more honest and more likely to be granted.
  Future<void> ensurePermission() async {
    if (_permissionAsked) return;
    _permissionAsked = true;

    if (defaultTargetPlatform != TargetPlatform.android) return;

    try {
      final status = await Permission.notification.status;
      if (status.isDenied) await Permission.notification.request();
    } catch (err) {
      debugPrint('downloads: notification permission unavailable: $err');
    }
  }

  Future<void> _ensureChannel() async {
    if (_channelReady) return;
    _channelReady = true;

    const channel = AndroidNotificationChannel(
      _channelId,
      'Downloads',
      description: 'Progress for lessons being saved to this device',
      // Low: it must be visible and it must not make a sound every time a
      // chunk lands.
      importance: Importance.low,
      playSound: false,
      enableVibration: false,
    );

    try {
      await _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(channel);
    } catch (err) {
      debugPrint('downloads: notification channel unavailable: $err');
    }
  }

  /// Redraws the notification from the queue, or clears it when the queue is
  /// empty.
  Future<void> sync(List<DownloadRecord> pending) async {
    if (pending.isEmpty) {
      await cancel();
      return;
    }

    final active = pending
        .where((record) => record.status == DownloadStatus.downloading)
        .toList();

    final done = pending.fold<int>(0, (sum, r) => sum + r.bytesDone);
    final total = pending.fold<int>(0, (sum, r) => sum + r.bytesTotal);
    final percent = total > 0 ? ((done / total) * 100).round() : 0;

    final title = pending.length == 1
        ? 'Saving ${pending.first.title}'
        : 'Saving ${pending.length} lessons';

    final body = total > 0 ? '${_mb(done)} of ${_mb(total)}' : 'Starting…';

    await _show(
      title: title,
      body: body,
      percent: total > 0 ? percent : null,
      paused: active.isEmpty,
    );
  }

  /// The queue is parked because the student allows Wi-Fi only.
  Future<void> waitingForWifi(int count) async {
    await _show(
      title: count == 1 ? '1 lesson waiting' : '$count lessons waiting',
      body: 'Will continue when you are on Wi-Fi',
      percent: null,
      paused: true,
    );
  }

  Future<void> cancel() async {
    if (!_visible) return;
    _visible = false;
    try {
      await _plugin.cancel(_notificationId);
    } catch (err) {
      debugPrint('downloads: could not clear notification: $err');
    }
  }

  Future<void> _show({
    required String title,
    required String body,
    required int? percent,
    required bool paused,
  }) async {
    await _ensureChannel();

    final details = AndroidNotificationDetails(
      _channelId,
      'Downloads',
      channelDescription: 'Progress for lessons being saved to this device',
      importance: Importance.low,
      priority: Priority.low,
      ongoing: !paused,
      autoCancel: false,
      onlyAlertOnce: true,
      playSound: false,
      showProgress: percent != null,
      maxProgress: 100,
      progress: percent ?? 0,
      indeterminate: percent == null && !paused,
      color: const Color(0xFFF26A21),
      actions: [
        if (paused)
          const AndroidNotificationAction(
            actionResume,
            'Resume',
            showsUserInterface: false,
            cancelNotification: false,
          )
        else
          const AndroidNotificationAction(
            actionPause,
            'Pause',
            showsUserInterface: false,
            cancelNotification: false,
          ),
        const AndroidNotificationAction(
          actionCancel,
          'Cancel',
          showsUserInterface: false,
          cancelNotification: false,
        ),
      ],
    );

    try {
      await _plugin.show(
        _notificationId,
        title,
        body,
        NotificationDetails(android: details),
      );
      _visible = true;
    } catch (err) {
      debugPrint('downloads: could not post notification: $err');
    }
  }

  void _handleAction(String actionId, String? payload) {
    switch (actionId) {
      case actionPause:
        _onPauseAll();
      case actionResume:
        _onResumeAll();
      case actionCancel:
        _onCancelAll();
    }
  }

  static String _mb(int bytes) {
    if (bytes <= 0) return '0 MB';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
    }
    return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
  }
}
