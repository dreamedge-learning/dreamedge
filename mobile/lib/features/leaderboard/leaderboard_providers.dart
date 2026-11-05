import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/supabase_provider.dart';
import 'leaderboard_service.dart';
import 'models/leaderboard_entry.dart';

final leaderboardServiceProvider = Provider<LeaderboardService>((ref) {
  return LeaderboardService(ref.watch(supabaseClientProvider));
});

/// Arguments for the family provider. Freezed-less by design -- a `record`
/// would do, but families need `==` and `hashCode` which the equatable
/// override below gives in a few lines.
class LeaderboardQuery {
  final String courseId;
  final LeaderboardWeek week;

  const LeaderboardQuery({required this.courseId, required this.week});

  @override
  bool operator ==(Object other) =>
      other is LeaderboardQuery &&
      other.courseId == courseId &&
      other.week == week;

  @override
  int get hashCode => Object.hash(courseId, week);
}

final leaderboardProvider = FutureProvider.family<List<LeaderboardEntry>,
    LeaderboardQuery>((ref, query) {
  return ref
      .watch(leaderboardServiceProvider)
      .fetch(courseId: query.courseId, week: query.week);
});
