import 'dart:async';

import 'connectivity_service.dart';
import 'download_manager.dart';
import 'licence_sweeper.dart';
import 'offline_store.dart';
import 'progress_sync.dart';

/// What the last reconnect did, for anything that wants to say so.
class SyncOutcome {
  final int progressSent;
  final int licencesRevoked;

  /// True when the licence check could not be completed -- unreachable,
  /// unusable answer, or an answer that cannot be told apart from a fault.
  /// Nothing was revoked, and the Downloads screen says "could not check"
  /// rather than letting the student believe their licences are current.
  final bool licenceCheckInconclusive;

  final DateTime at;

  const SyncOutcome({
    required this.progressSent,
    required this.licencesRevoked,
    required this.licenceCheckInconclusive,
    required this.at,
  });
}

/// Everything that has to happen the moment the app can reach the server
/// again.
///
/// Three things, in this order and for this reason. Queued positions go first,
/// because they are the student's own work and a licence sweep that revoked
/// something would otherwise take the record of them watching it with it.
/// Licences come next, so a refund or a lapsed enrolment actually removes the
/// file. Enrolments are refreshed last, so the entitlement the app believes in
/// offline matches what the server just said.
///
/// It is one object because the order matters and because a reconnect should
/// do all of it or none of it -- three independent listeners on the same
/// connectivity stream would race.
class OfflineSync {
  OfflineSync({
    required this.connectivity,
    required this.progress,
    required this.licences,
    required this.store,
    required this.downloads,
    required this.refreshEnrollments,
  }) {
    _watch();
  }

  final ConnectivityService connectivity;
  final QueuedProgressWriter progress;
  final LicenceSweeper licences;
  final OfflineStore store;
  final DownloadManager downloads;
  final Future<void> Function() refreshEnrollments;

  StreamSubscription<NetworkState>? _watcher;
  bool _running = false;

  final StreamController<SyncOutcome> _outcomes =
      StreamController<SyncOutcome>.broadcast();

  /// Emits after each reconnect that did something worth mentioning.
  Stream<SyncOutcome> get outcomes => _outcomes.stream;

  Future<void> dispose() async {
    await _watcher?.cancel();
    await _outcomes.close();
  }

  void _watch() {
    _watcher = connectivity.states.listen((state) {
      if (state.isOnline) unawaited(run());
    });
  }

  /// Runs the whole sequence. Safe to call on launch, on resume and on
  /// reconnect; a second caller while one is running is ignored.
  Future<void> run() async {
    if (_running || !connectivity.isOnline) return;
    _running = true;

    try {
      final sent = await progress.flush();
      final swept = await licences.sweep();
      await refreshEnrollments();
      await downloads.restore();

      final inconclusive = swept.result == SweepResult.inconclusive;

      if (sent > 0 || swept.revoked > 0 || inconclusive) {
        _outcomes.add(
          SyncOutcome(
            progressSent: sent,
            licencesRevoked: swept.revoked,
            licenceCheckInconclusive: inconclusive,
            at: DateTime.now(),
          ),
        );
      }
    } catch (_) {
      // A reconnect that failed is not something to show the student: the
      // licences already on disk decide what plays, and the next connectivity
      // event tries again.
    } finally {
      _running = false;
    }
  }

  /// When the app last managed a successful entitlement check.
  ///
  /// The Downloads screen shows this when something has locked, because
  /// "connect once to keep watching" is only useful next to how long it has
  /// been.
  Future<DateTime?> lastVerifiedAt() => store.lastVerifiedAt();
}
