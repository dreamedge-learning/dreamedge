import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/leaderboard/leaderboard_service.dart';
import 'package:mobile/features/leaderboard/models/leaderboard_entry.dart';

void main() {
  group('LeaderboardEntry.fromRpc', () {
    // Supabase decodes PostgREST numerics to `num` (int or double depending on
    // the row), and some drivers hand us strings back when numeric has a
    // decimal. The model has to swallow both without dropping to zero.
    test('parses the five declared columns', () {
      final row = <String, dynamic>{
        'rank': 1,
        'display_name': 'Aarav S.',
        'total_score': 100.0,
        'tests_taken': 3,
        'is_me': true,
      };
      final entry = LeaderboardEntry.fromRpc(row);
      expect(entry.rank, 1);
      expect(entry.displayName, 'Aarav S.');
      expect(entry.totalScore, 100.0);
      expect(entry.testsTaken, 3);
      expect(entry.isMe, isTrue);
    });

    test('widens integer total_score to double', () {
      final row = <String, dynamic>{
        'rank': 2,
        'display_name': 'Bhavna S.',
        'total_score': 85,
        'tests_taken': 2,
        'is_me': false,
      };
      final entry = LeaderboardEntry.fromRpc(row);
      expect(entry.totalScore, 85.0);
      expect(entry.isMe, isFalse);
    });

    test('a null or false is_me never flips to true', () {
      // Admin callers see null for is_me because current_student_id() returns
      // null. A stray null must not highlight a random student's row.
      final nulled = LeaderboardEntry.fromRpc(<String, dynamic>{
        'rank': 3,
        'display_name': 'Chirag',
        'total_score': 90,
        'tests_taken': 2,
        'is_me': null,
      });
      expect(nulled.isMe, isFalse);
    });

    test('empty or whitespace display_name falls back to "Student"', () {
      final empty = LeaderboardEntry.fromRpc(<String, dynamic>{
        'rank': 1,
        'display_name': '   ',
        'total_score': 10,
        'tests_taken': 1,
        'is_me': false,
      });
      expect(empty.displayName, 'Student');
    });
  });

  group('LeaderboardService.weekStartParam', () {
    // IST = UTC + 5:30. "Last week" must be the ISO Monday one week before
    // the current IST Monday, formatted as YYYY-MM-DD.
    test('this week sends null -- the server resolves the IST window', () {
      expect(LeaderboardService.weekStartParam(LeaderboardWeek.thisWeek), isNull);
    });

    test('last week on Wed 2026-11-04 10:00 UTC (15:30 IST) is 2026-10-26',
        () {
      final now = DateTime.utc(2026, 11, 4, 10, 0);
      expect(
        LeaderboardService.weekStartParam(LeaderboardWeek.lastWeek, now: now),
        '2026-10-26',
      );
    });

    test(
        'last week straddling the IST day boundary uses the IST calendar date',
        () {
      // 2026-11-01 19:30 UTC == 2026-11-02 01:00 IST (Monday). The IST Monday
      // of that moment is the 2nd, so "last week" is 2026-10-26.
      final now = DateTime.utc(2026, 11, 1, 19, 30);
      expect(
        LeaderboardService.weekStartParam(LeaderboardWeek.lastWeek, now: now),
        '2026-10-26',
      );
    });
  });
}
