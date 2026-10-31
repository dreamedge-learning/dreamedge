import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/leaderboard_service.dart';
import 'enrollment_provider.dart';
import 'supabase_provider.dart';

final leaderboardServiceProvider = Provider<LeaderboardService>((ref) {
  return LeaderboardService(ref.watch(supabaseClientProvider));
});

final courseLeaderboardProvider =
    FutureProvider.family<LeaderboardSnapshot, String>((ref, courseId) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  return ref.watch(leaderboardServiceProvider).getCourseLeaderboard(
        courseId: courseId,
        currentStudentId: studentId,
      );
});
