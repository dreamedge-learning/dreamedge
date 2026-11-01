import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/content.dart';
import '../services/content_service.dart';
import 'offline_provider.dart';
import 'supabase_provider.dart';

final contentServiceProvider = Provider<ContentService>((ref) {
  return ContentService(ref.watch(supabaseClientProvider));
});

/// Cached first, then the server's answer. A student with no signal still has
/// to be able to see the lesson list to find the lesson they downloaded.
final topicContentsProvider = StreamProvider.family<List<Content>, String>((
  ref,
  topicId,
) {
  return ref.watch(contentRepositoryProvider).watchTopicContents(topicId);
});

final contentDetailProvider = FutureProvider.family<Content, String>((
  ref,
  contentId,
) {
  return ref.watch(contentRepositoryProvider).content(contentId);
});

final freeContentsProvider = FutureProvider<List<Content>>((ref) {
  return ref.watch(contentServiceProvider).getFreeContents();
});
