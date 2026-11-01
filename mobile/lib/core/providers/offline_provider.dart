import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/router.dart';
import '../models/content.dart';
import '../offline/connectivity_service.dart';
import '../offline/device_identity.dart';
import '../offline/download_manager.dart';
import '../offline/download_notifier.dart';
import '../offline/download_record.dart';
import '../offline/download_settings.dart';
import '../offline/licence_sweeper.dart';
import '../offline/offline_store.dart';
import '../offline/offline_sync.dart';
import '../offline/progress_sync.dart';
import '../repositories/content_repository.dart';
import '../repositories/course_repository.dart';
import '../repositories/enrollment_repository.dart';
import 'content_provider.dart';
import 'course_provider.dart';
import 'document_provider.dart';
import 'playback_provider.dart';
import 'enrollment_provider.dart';
import 'student_provider.dart';
import 'supabase_provider.dart';

/// The on-device database, shared by everything.
final offlineStoreProvider = Provider<OfflineStore>((ref) {
  final store = OfflineStore();
  ref.onDispose(store.dispose);
  return store;
});

final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService();
  ref.onDispose(service.dispose);
  return service;
});

/// The connection, as a stream for widgets that rebuild on it.
///
/// Seeded with the service's current answer so the first frame is right: a
/// banner that flashes "you're offline" on every launch would be worse than
/// no banner.
final networkStateProvider = StreamProvider<NetworkState>((ref) {
  final service = ref.watch(connectivityServiceProvider);
  return service.states;
});

/// A synchronous read for code that cannot await, such as a build method.
final isOnlineProvider = Provider<bool>((ref) {
  final watched = ref.watch(networkStateProvider);
  return watched.valueOrNull?.isOnline ??
      ref.watch(connectivityServiceProvider).isOnline;
});

final downloadSettingsProvider = ChangeNotifierProvider<DownloadSettings>((
  ref,
) {
  return DownloadSettings(ref.watch(storageServiceProvider));
});

final deviceIdentityProvider = Provider<DeviceIdentity>((ref) {
  return DeviceIdentity(ref.watch(storageServiceProvider));
});

/// The ongoing download notification.
///
/// Its buttons act on the manager, and the manager needs the notifier to
/// draw -- a cycle broken by reading the manager lazily when a button is
/// actually pressed, which is long after both exist.
final Provider<DownloadNotifier> downloadNotifierProvider =
    Provider<DownloadNotifier>((ref) {
      return DownloadNotifier(
        onPauseAll: () async {
          final manager = ref.read(downloadManagerProvider);
          for (final record
              in await ref.read(offlineStoreProvider).pendingDownloads()) {
            await manager.pause(record.contentItemId);
          }
        },
        onResumeAll: () async {
          final manager = ref.read(downloadManagerProvider);
          final pending = await ref
              .read(offlineStoreProvider)
              .pendingDownloads(includePaused: true);
          for (final record in pending) {
            await manager.resume(record.contentItemId);
          }
        },
        onCancelAll: () => ref.read(downloadManagerProvider).removeAll(),
      );
    });

final Provider<DownloadManager> downloadManagerProvider =
    Provider<DownloadManager>((ref) {
      final manager = DownloadManager(
        store: ref.watch(offlineStoreProvider),
        playback: ref.watch(playbackServiceProvider),
        documents: ref.watch(documentServiceProvider),
        connectivity: ref.watch(connectivityServiceProvider),
        settings: ref.watch(downloadSettingsProvider),
        device: ref.watch(deviceIdentityProvider),
        notifier: ref.watch(downloadNotifierProvider),
        dio: ref.watch(dioProvider),
      );
      ref.onDispose(manager.dispose);
      return manager;
    });

final licenceSweeperProvider = Provider<LicenceSweeper>((ref) {
  return LicenceSweeper(
    client: ref.watch(supabaseClientProvider),
    store: ref.watch(offlineStoreProvider),
  );
});

final queuedProgressWriterProvider = Provider<QueuedProgressWriter>((ref) {
  return QueuedProgressWriter(
    store: ref.watch(offlineStoreProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    content: ref.watch(contentServiceProvider),
    studentId: () async {
      final student = await ref.read(currentStudentProvider.future);
      return student?.id;
    },
  );
});

/// Everything that happens on reconnect, in the one order that is safe.
final offlineSyncProvider = Provider<OfflineSync>((ref) {
  final sync = OfflineSync(
    connectivity: ref.watch(connectivityServiceProvider),
    progress: ref.watch(queuedProgressWriterProvider),
    licences: ref.watch(licenceSweeperProvider),
    store: ref.watch(offlineStoreProvider),
    downloads: ref.watch(downloadManagerProvider),
    refreshEnrollments: () async {
      final student = await ref.read(currentStudentProvider.future);
      if (student == null) return;
      await ref.read(enrollmentRepositoryProvider).refresh(student.id);
    },
  );
  ref.onDispose(sync.dispose);
  return sync;
});

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

final courseRepositoryProvider = Provider<CourseRepository>((ref) {
  return CourseRepository(
    service: ref.watch(courseServiceProvider),
    store: ref.watch(offlineStoreProvider),
    connectivity: ref.watch(connectivityServiceProvider),
  );
});

final contentRepositoryProvider = Provider<ContentRepository>((ref) {
  return ContentRepository(
    service: ref.watch(contentServiceProvider),
    store: ref.watch(offlineStoreProvider),
    connectivity: ref.watch(connectivityServiceProvider),
  );
});

final enrollmentRepositoryProvider = Provider<EnrollmentRepository>((ref) {
  return EnrollmentRepository(
    service: ref.watch(enrollmentServiceProvider),
    store: ref.watch(offlineStoreProvider),
    connectivity: ref.watch(connectivityServiceProvider),
  );
});

// ---------------------------------------------------------------------------
// Downloads, as the UI sees them
// ---------------------------------------------------------------------------

/// Every download record, re-read whenever one changes.
final downloadsProvider = StreamProvider<List<DownloadRecord>>((ref) {
  final store = ref.watch(offlineStoreProvider);

  // Kick the queue once something is listening, so a restart with items left
  // over starts moving without the student doing anything.
  ref.read(downloadManagerProvider).restore();

  return store.changes
      .asyncMap((_) => store.allDownloads())
      .startWith(store.allDownloads());
});

/// One item's record, for a lesson tile or the player's download button.
final downloadRecordProvider = Provider.family<DownloadRecord?, String>((
  ref,
  contentItemId,
) {
  final all = ref.watch(downloadsProvider).valueOrNull ?? const [];
  for (final record in all) {
    if (record.contentItemId == contentItemId) return record;
  }
  return null;
});

/// Bytes currently held on the device.
final downloadedBytesProvider = Provider<int>((ref) {
  final records = ref.watch(downloadsProvider).valueOrNull ?? const [];
  return records
      .where((r) => r.status != DownloadStatus.expired)
      .fold<int>(0, (sum, r) => sum + r.bytesDone);
});

/// The downloaded lessons, with the row each one came from.
///
/// What the Downloads screen lists, and what Home, Courses and My Learning
/// fall back to when there is no connection.
final downloadedLessonsProvider = FutureProvider<List<DownloadedLesson>>((
  ref,
) async {
  final records = ref.watch(downloadsProvider).valueOrNull ?? const [];
  final store = ref.watch(offlineStoreProvider);

  final lessons = <DownloadedLesson>[];
  for (final record in records) {
    final content = await store.cachedContentItem(record.contentItemId);
    lessons.add(DownloadedLesson(record: record, content: content));
  }

  lessons.sort((a, b) => a.record.createdAt.compareTo(b.record.createdAt));
  return lessons;
});

/// A download paired with the lesson it is a copy of.
class DownloadedLesson {
  final DownloadRecord record;

  /// Null when the lesson row was never cached -- an upgrade from before the
  /// cache existed, or a cache the system cleared. The record still carries
  /// the title, so the row is listable either way.
  final Content? content;

  const DownloadedLesson({required this.record, this.content});

  String get title =>
      content?.title.isNotEmpty == true ? content!.title : record.title;
}

extension _StartWith<T> on Stream<T> {
  /// Emits [first] before anything the source produces.
  ///
  /// `store.changes` only fires on a write, so without this a screen that
  /// opens while nothing is downloading would wait forever for its first
  /// frame.
  Stream<T> startWith(Future<T> first) async* {
    yield await first;
    yield* this;
  }
}
