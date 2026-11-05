import 'package:supabase_flutter/supabase_flutter.dart';

import 'models/leaderboard_entry.dart';

/// Which seven-day window the leaderboard screen is looking at.
enum LeaderboardWeek { thisWeek, lastWeek }

/// Thin wrapper over the `get_weekly_leaderboard` RPC.
///
/// The RPC is the single source of truth for the ranking rule, the IST week
/// boundary, the enrolment/admin gate and the privacy redaction. This class
/// is deliberately narrow -- resolve the week, call the function, parse the
/// rows. Nothing else lives here.
class LeaderboardService {
  final SupabaseClient _client;

  LeaderboardService(this._client);

  /// Monday 00:00 IST for the current IST calendar day, as a `date`-shaped
  /// string the RPC can bind to its `p_week_start date` parameter.
  ///
  /// IST is UTC+05:30 and does not observe DST, so we can just shift and read
  /// the weekday off the shifted instant. Keeping this on the client means
  /// "last week" costs one call, not a round trip to a `last_week_start()`
  /// helper on the server.
  static String _istMondayAsDate(DateTime whenUtc) {
    final ist = whenUtc.toUtc().add(const Duration(hours: 5, minutes: 30));
    // DateTime.weekday is 1 = Monday ... 7 = Sunday, matching ISO.
    final monday = DateTime.utc(ist.year, ist.month, ist.day)
        .subtract(Duration(days: ist.weekday - 1));
    return '${monday.year.toString().padLeft(4, '0')}-'
        '${monday.month.toString().padLeft(2, '0')}-'
        '${monday.day.toString().padLeft(2, '0')}';
  }

  /// The date the RPC should be called with for a given week selector. `null`
  /// is deliberate -- it tells the server "use the current IST week", which
  /// the server computes without the client's clock being involved.
  static String? weekStartParam(LeaderboardWeek week, {DateTime? now}) {
    switch (week) {
      case LeaderboardWeek.thisWeek:
        return null;
      case LeaderboardWeek.lastWeek:
        final base = (now ?? DateTime.now()).toUtc();
        // Subtract a week in IST-space by subtracting seven days from the
        // current IST Monday. IST has no DST so this is exactly 7 * 86400 s.
        return _istMondayAsDate(base.subtract(const Duration(days: 7)));
    }
  }

  Future<List<LeaderboardEntry>> fetch({
    required String courseId,
    required LeaderboardWeek week,
  }) async {
    final result = await _client.rpc(
      'get_weekly_leaderboard',
      params: {
        'p_course_id': courseId,
        'p_week_start': weekStartParam(week),
      },
    );
    if (result == null) return const [];
    return (result as List)
        .map((row) =>
            LeaderboardEntry.fromRpc(Map<String, dynamic>.from(row as Map)))
        .toList();
  }
}
