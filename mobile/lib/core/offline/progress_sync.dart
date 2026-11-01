import 'package:flutter/foundation.dart';

import '../providers/playback_provider.dart';
import '../services/content_service.dart';
import 'connectivity_service.dart';
import 'offline_store.dart';

/// Writes watched positions, online or not.
///
/// The player should not have to know which, so it does not: it hands a
/// position here and this decides whether it goes to the server now or into
/// the queue. A failed write is queued too -- a position lost because the
/// request happened to fail is as annoying as one lost to no signal.
class QueuedProgressWriter implements ProgressWriter {
  QueuedProgressWriter({
    required this.store,
    required this.connectivity,
    required this.content,
    required this.studentId,
  });

  final OfflineStore store;
  final ConnectivityService connectivity;
  final ContentService content;
  final Future<String?> Function() studentId;

  @override
  Future<void> write({
    required String contentItemId,
    required int positionSeconds,
    required double progressPercentage,
  }) async {
    final status = progressPercentage >= 95 ? 'completed' : 'in_progress';

    if (!connectivity.isOnline) {
      await _queue(contentItemId, positionSeconds, progressPercentage, status);
      return;
    }

    try {
      final student = await studentId();
      if (student == null) return;

      await content.saveProgress(
        studentId: student,
        contentItemId: contentItemId,
        progressPercentage: progressPercentage,
        lastPositionSeconds: positionSeconds,
      );
    } catch (err) {
      debugPrint('progress: queued after a failed write: $err');
      await _queue(contentItemId, positionSeconds, progressPercentage, status);
    }
  }

  Future<void> _queue(
    String contentItemId,
    int positionSeconds,
    double progressPercentage,
    String status,
  ) async {
    await store.queueProgress(
      contentItemId: contentItemId,
      positionSeconds: positionSeconds,
      progressPercentage: progressPercentage,
      status: status,
    );
  }

  /// Sends everything that was queued, oldest first.
  ///
  /// Order matters only up to a point: what actually protects the student is
  /// taking the furthest position rather than the last one written. A queued
  /// row from Tuesday must not rewind a lesson watched online on Wednesday,
  /// so the rows for one item are collapsed to their maximum before anything
  /// is sent, and a position behind what the server already holds is dropped.
  Future<int> flush() async {
    if (!connectivity.isOnline) return 0;

    final queued = await store.queuedProgress();
    if (queued.isEmpty) return 0;

    final student = await studentId();
    if (student == null) return 0;

    // Collapse to the furthest point per item, keeping every id so the whole
    // batch can be cleared together.
    final furthest =
        <String, ({int position, double percentage, String status})>{};
    final ids = <int>[];

    for (final row in queued) {
      ids.add(row.id);
      final current = furthest[row.contentItemId];
      if (current == null || row.positionSeconds > current.position) {
        furthest[row.contentItemId] = (
          position: row.positionSeconds,
          percentage: row.progressPercentage,
          status: row.status,
        );
      }
    }

    final existing = await content.getProgressFor(
      student,
      furthest.keys.toList(),
    );

    var sent = 0;
    final written = <int>[];

    for (final entry in furthest.entries) {
      final server = existing[entry.key];

      // The server is already further along, from a session on another device
      // or online in between. Writing ours would be a rewind.
      if (server != null &&
          server.lastPositionSeconds >= entry.value.position) {
        continue;
      }

      try {
        await content.saveProgress(
          studentId: student,
          contentItemId: entry.key,
          progressPercentage: entry.value.percentage,
          lastPositionSeconds: entry.value.position,
        );
        sent++;
      } catch (err) {
        debugPrint('progress: ${entry.key} not flushed: $err');
        // Leave its rows queued for the next attempt.
        return sent;
      }
    }

    written.addAll(ids);
    await store.dropQueuedProgress(written);
    return sent;
  }
}
