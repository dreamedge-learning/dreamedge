import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'enrollment_provider.dart';
import 'supabase_provider.dart';

/// All ratings the current student has written, as a map from `course_id` to
/// stars. One cheap query per screen beats a per-card fetch: the My Learning
/// list renders every enrolled course, and a round-trip per row would make
/// the stars arrive long after the thumbnail.
///
/// The widget writes back to the table directly and then invalidates this
/// provider, so the next list render starts from the row the server now
/// holds rather than whatever the widget remembers.
final myCourseRatingsProvider = FutureProvider<Map<String, int>>((ref) async {
  final studentId = await ref.watch(currentStudentIdProvider.future);
  if (studentId == null) return const {};

  final client = ref.watch(supabaseClientProvider);
  final data = await client
      .from('course_ratings')
      .select('course_id, stars')
      .eq('student_id', studentId);

  final out = <String, int>{};
  for (final row in data as List) {
    final map = row as Map<String, dynamic>;
    final courseId = map['course_id'] as String?;
    final stars = map['stars'];
    if (courseId != null && stars is int) {
      out[courseId] = stars;
    }
  }
  return out;
});
