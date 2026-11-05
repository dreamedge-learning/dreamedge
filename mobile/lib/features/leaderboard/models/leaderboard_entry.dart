/// One row in the weekly leaderboard.
///
/// The server redacts every other student to first name + last initial --
/// we never see their surname, phone, email, student id or school on the
/// device. Only the caller's own row carries their name in full. Keeping the
/// Dart model to the same five columns makes it impossible to leak more even
/// if a future query starts selecting it.
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
      // is_me is never null from the current RPC, but a defensive false
      // keeps a stray null from flipping another student's row into the
      // "that's you" highlight.
      isMe: row['is_me'] == true,
    );
  }
}

/// The rows a leaderboard screen draws: the unbroken run of ranks from the
/// top, and the caller's own row when the server sent it from further down.
///
/// Every student has a distinct rank, so the top block is 1, 2, 3, ... and
/// anything after the first gap is the caller's row. Splitting on the gap
/// rather than on a hard-coded ten keeps the app in step with the server's
/// cut-off. A caller at rank 11 has no gap before them and simply continues
/// the list, which reads the same.
class LeaderboardSplit {
  final List<LeaderboardEntry> top;
  final LeaderboardEntry? pinned;

  const LeaderboardSplit({required this.top, this.pinned});

  factory LeaderboardSplit.of(List<LeaderboardEntry> entries) {
    final top = <LeaderboardEntry>[];
    LeaderboardEntry? pinned;
    for (final e in entries) {
      if (top.isEmpty || e.rank == top.last.rank + 1) {
        top.add(e);
      } else {
        pinned = e;
        break;
      }
    }
    return LeaderboardSplit(top: top, pinned: pinned);
  }
}
