/// One row in the weekly leaderboard.
///
/// The server redacts to first name + last initial already -- we never see
/// a real surname, phone, email, student id or school on the device. Keeping
/// the Dart model to the same five columns makes it impossible to leak those
/// even if a future query starts selecting more.
class LeaderboardEntry {
  final int rank;
  final String displayName;
  final double totalScore;
  final int testsTaken;
  final bool isMe;

  const LeaderboardEntry({
    required this.rank,
    required this.displayName,
    required this.totalScore,
    required this.testsTaken,
    required this.isMe,
  });

  /// Parse one row from `get_weekly_leaderboard`. Numbers come back as `num`
  /// over the wire (Supabase decodes numeric to num), which is why score and
  /// tests_taken are read as `num?` and widened here rather than cast.
  factory LeaderboardEntry.fromRpc(Map<String, dynamic> row) {
    return LeaderboardEntry(
      rank: (row['rank'] as num?)?.toInt() ?? 0,
      displayName: (row['display_name'] as String?)?.trim().isNotEmpty == true
          ? (row['display_name'] as String).trim()
          : 'Student',
      totalScore: (row['total_score'] as num?)?.toDouble() ?? 0,
      testsTaken: (row['tests_taken'] as num?)?.toInt() ?? 0,
      // is_me is always non-null in the current RPC, but a defensive false
      // keeps a stray null from flipping another student's row into the
      // "that's you" highlight.
      isMe: row['is_me'] == true,
    );
  }
}
