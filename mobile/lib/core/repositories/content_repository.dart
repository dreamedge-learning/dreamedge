import '../models/content.dart';
import '../offline/connectivity_service.dart';
import '../offline/offline_store.dart';
import '../services/content_service.dart';

/// Lessons, read cache-first.
///
/// The one place where offline is not merely a nicety: a student with the
/// radio off still has to be able to see the lesson list to find the lesson
/// they downloaded. Without the cache, Downloads would be the only screen
/// that worked.
class ContentRepository {
  ContentRepository({
    required this.service,
    required this.store,
    required this.connectivity,
  });

  final ContentService service;
  final OfflineStore store;
  final ConnectivityService connectivity;

  Stream<List<Content>> watchTopicContents(String topicId) async* {
    final cached = await store.cachedContentItems(topicId);
    if (cached.isNotEmpty) yield cached;

    if (!connectivity.isOnline) {
      if (cached.isEmpty) yield const [];
      return;
    }

    try {
      final fresh = await service.getContentsByTopic(topicId);
      await store.cacheContentItems(topicId, fresh);
      yield fresh;
    } catch (error) {
      if (cached.isEmpty) rethrow;
    }
  }

  /// One lesson, best available.
  ///
  /// Network-first while online, and deliberately so -- the opposite of
  /// [watchTopicContents] above, which paints from the cache and refreshes
  /// behind it.
  ///
  /// The difference is what the two are for. A lesson *list* is navigation:
  /// painting it instantly from the cache is the whole point, and a title that
  /// is a few minutes stale costs nothing. A single lesson *row* is what the
  /// player then acts on, and it carries `is_downloadable`, `play_limit`,
  /// `video_status` and the Bunny guid. Serving those from the cache first
  /// would mean opening a lesson against an offline permission the admin has
  /// since revoked, or a replay limit that has since changed, and only
  /// correcting it after the student had already started.
  ///
  /// So the list is fast and the lesson is current. Cached still wins over an
  /// error, because a student who can see the lesson should be able to open
  /// it.
  Future<Content> content(String id) async {
    if (connectivity.isOnline) {
      try {
        final fresh = await service.getContentById(id);
        await store.cacheContentItem(fresh);
        return fresh;
      } catch (error) {
        final cached = await store.cachedContentItem(id);
        if (cached != null) return cached;
        rethrow;
      }
    }

    final cached = await store.cachedContentItem(id);
    if (cached != null) return cached;
    throw StateError('This lesson has not been opened on this device yet.');
  }

  /// The furthest position known for one lesson, server or queue.
  ///
  /// While offline the queue is ahead of the server by definition, so the
  /// player has to look at both or it would offer to resume from where the
  /// student was two sessions ago.
  Future<int> resumePosition(String studentId, String contentItemId) async {
    final queued = await store.latestQueuedProgress(contentItemId);
    var furthest = queued?.positionSeconds ?? 0;

    if (connectivity.isOnline) {
      try {
        final progress = await service.getProgressFor(studentId, [
          contentItemId,
        ]);
        final saved = progress[contentItemId];
        if (saved != null && !saved.isCompleted) {
          if (saved.lastPositionSeconds > furthest) {
            furthest = saved.lastPositionSeconds;
          }
        }
      } catch (_) {
        // The queue's answer stands.
      }
    }

    return furthest;
  }
}
