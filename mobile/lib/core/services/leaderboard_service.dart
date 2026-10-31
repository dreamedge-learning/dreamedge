import 'package:supabase_flutter/supabase_flutter.dart';

class LeaderboardEntry {
  final String studentId;
  final String fullName;
  final String? avatarUrl;
  final double totalScore;
  final int testsTaken;
  int rank;

  LeaderboardEntry({
    required this.studentId,
    required this.fullName,
    this.avatarUrl,
    required this.totalScore,
    required this.testsTaken,
    this.rank = 0,
  });
}

class LeaderboardSnapshot {
  final List<LeaderboardEntry> topEntries;
  final LeaderboardEntry? currentUserEntry;
  final DateTime weekStart;
  final DateTime weekEnd;

  const LeaderboardSnapshot({
    required this.topEntries,
    required this.currentUserEntry,
    required this.weekStart,
    required this.weekEnd,
  });
}

class LeaderboardService {
  final SupabaseClient _client;

  LeaderboardService(this._client);

  /// Weekly leaderboard for a course: for each student, sum of best attempt
  /// score per test in that course this week.
  Future<LeaderboardSnapshot> getCourseLeaderboard({
    required String courseId,
    required String? currentStudentId,
  }) async {
    final now = DateTime.now();
    // Week starts Monday (local), 00:00:00.
    final weekStart = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: (now.weekday - 1) % 7));
    final weekEnd = weekStart.add(const Duration(days: 7));

    // Tests in this course.
    final testsData = await _client
        .from('tests')
        .select('id')
        .eq('course_id', courseId)
        .eq('status', 'published');
    final testIds = (testsData as List)
        .map((r) => (r as Map)['id'] as String)
        .toList();
    if (testIds.isEmpty) {
      return LeaderboardSnapshot(
        topEntries: const [],
        currentUserEntry: null,
        weekStart: weekStart,
        weekEnd: weekEnd,
      );
    }

    final attemptsData = await _client
        .from('test_attempts')
        .select('student_id, test_id, score, submitted_at')
        .inFilter('test_id', testIds)
        .gte('submitted_at', weekStart.toUtc().toIso8601String())
        .lt('submitted_at', weekEnd.toUtc().toIso8601String());

    // Pick best attempt per (student_id, test_id).
    final best = <String, Map<String, double>>{};
    final counts = <String, Set<String>>{};
    for (final row in attemptsData as List) {
      final r = row as Map;
      final sid = r['student_id'] as String;
      final tid = r['test_id'] as String;
      final sc = (r['score'] as num?)?.toDouble() ?? 0;
      final perStudent = best.putIfAbsent(sid, () => {});
      if (!perStudent.containsKey(tid) || sc > perStudent[tid]!) {
        perStudent[tid] = sc;
      }
      counts.putIfAbsent(sid, () => <String>{}).add(tid);
    }

    if (best.isEmpty) {
      return LeaderboardSnapshot(
        topEntries: const [],
        currentUserEntry: null,
        weekStart: weekStart,
        weekEnd: weekEnd,
      );
    }

    // Fetch student profiles for names/avatars.
    final studentIds = best.keys.toList();
    // `test_attempts.student_id` holds `students.id`, not the auth user id.
    final studentsData = await _client
        .from('students')
        .select('id, full_name, avatar_url')
        .inFilter('id', studentIds);
    final profiles = <String, Map<String, dynamic>>{};
    for (final row in studentsData as List) {
      final r = Map<String, dynamic>.from(row as Map);
      profiles[r['id'] as String] = r;
    }

    final entries = <LeaderboardEntry>[];
    for (final sid in studentIds) {
      final total = best[sid]!.values.fold<double>(0, (a, b) => a + b);
      final prof = profiles[sid];
      entries.add(LeaderboardEntry(
        studentId: sid,
        fullName: prof?['full_name'] as String? ?? 'Student',
        avatarUrl: prof?['avatar_url'] as String?,
        totalScore: total,
        testsTaken: counts[sid]?.length ?? 0,
      ));
    }

    entries.sort((a, b) => b.totalScore.compareTo(a.totalScore));
    for (var i = 0; i < entries.length; i++) {
      entries[i].rank = i + 1;
    }

    final top = entries.take(10).toList();
    LeaderboardEntry? me;
    if (currentStudentId != null) {
      final mine = entries
          .where((e) => e.studentId == currentStudentId)
          .cast<LeaderboardEntry?>()
          .firstWhere((e) => true, orElse: () => null);
      if (mine != null && !top.any((e) => e.studentId == currentStudentId)) {
        me = mine;
      }
    }

    return LeaderboardSnapshot(
      topEntries: top,
      currentUserEntry: me,
      weekStart: weekStart,
      weekEnd: weekEnd,
    );
  }
}
