import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/doubt.dart';
import '../services/doubt_service.dart';
import 'supabase_provider.dart';

final doubtServiceProvider = Provider<DoubtService>((ref) {
  return DoubtService(ref.watch(supabaseClientProvider));
});

/// Every doubt the student has asked, most recent activity first.
final myDoubtsProvider = FutureProvider.autoDispose<List<Doubt>>((ref) {
  return ref.watch(doubtServiceProvider).myDoubts();
});

/// The student's own doubts on one lesson.
final lessonDoubtsProvider =
    FutureProvider.autoDispose.family<List<Doubt>, String>((ref, contentId) {
  return ref.watch(doubtServiceProvider).forLesson(contentId);
});

/// One doubt with its replies. Null when it is not the student's.
final doubtThreadProvider =
    FutureProvider.autoDispose.family<Doubt?, String>((ref, doubtId) {
  return ref.watch(doubtServiceProvider).thread(doubtId);
});

/// A signed address for one photo.
///
/// Auto-disposed so leaving a thread and coming back signs afresh: the link
/// expires in minutes, and a cached dead link is a broken image.
final doubtImageUrlProvider =
    FutureProvider.autoDispose.family<String?, String>((ref, path) {
  return ref.watch(doubtServiceProvider).imageUrl(path);
});

/// Refreshes every list a new doubt or reply could appear in.
///
/// Takes the container rather than a widget's ref because it runs after an
/// await, when the sheet that started the request may already have closed --
/// and the lesson screen underneath still needs its list refreshed.
void invalidateDoubts(
  ProviderContainer container, {
  String? contentId,
  String? doubtId,
}) {
  container.invalidate(myDoubtsProvider);
  if (contentId != null) container.invalidate(lessonDoubtsProvider(contentId));
  if (doubtId != null) container.invalidate(doubtThreadProvider(doubtId));
}
