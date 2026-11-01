import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/playback_service.dart';
import 'content_provider.dart';
import 'student_provider.dart';
import 'supabase_provider.dart';

final playbackServiceProvider = Provider<PlaybackService>((ref) {
  return PlaybackService(ref.watch(supabaseClientProvider));
});

/// Where a watched position goes.
///
/// The player should not care whether the write reached the server or went
/// into a queue to be sent later, so it does not: it hands the position here
/// and this decides. Until the offline queue exists, that decision is "send
/// it", and a failure is swallowed -- losing a position is a small annoyance,
/// and an exception thrown out of a 15-second timer would take the player
/// down with it.
abstract class ProgressWriter {
  Future<void> write({
    required String contentItemId,
    required int positionSeconds,
    required double progressPercentage,
  });
}

class DirectProgressWriter implements ProgressWriter {
  DirectProgressWriter(this._ref);

  final Ref _ref;

  @override
  Future<void> write({
    required String contentItemId,
    required int positionSeconds,
    required double progressPercentage,
  }) async {
    try {
      final student = await _ref.read(currentStudentProvider.future);
      if (student == null) return;

      await _ref.read(contentServiceProvider).saveProgress(
            studentId: student.id,
            contentItemId: contentItemId,
            progressPercentage: progressPercentage,
            lastPositionSeconds: positionSeconds,
          );
    } catch (err) {
      debugPrint('progress: not saved: $err');
    }
  }
}

final progressWriterProvider = Provider<ProgressWriter>((ref) {
  return DirectProgressWriter(ref);
});
