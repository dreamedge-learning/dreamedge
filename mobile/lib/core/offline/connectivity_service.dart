import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../logging/app_log.dart';

/// What kind of connection the device has, as far as downloads care.
enum NetworkKind { none, wifi, mobile, other }

/// Whether anything out there answered -- including "we have not asked yet".
///
/// The third case is not pedantry. The probe takes up to three seconds, and
/// treating "not yet known" as "offline" meant a fully online student saw the
/// offline banner and the downloads-only view on every single cold launch,
/// then watched the real Home replace it. Unknown has to be its own answer so
/// the screens can decline to act on it.
enum Reachability { unknown, online, offline }

class NetworkState {
  final NetworkKind kind;

  /// Whether something out there actually answered.
  ///
  /// This is the distinction that matters. `connectivity_plus` reports the
  /// interface, not the internet: a hotel Wi-Fi with a captive portal, a
  /// hostel router with no uplink and a phone holding onto a dead cell all
  /// report "connected" while nothing can be reached. Treating those as
  /// online is what makes an app sit on a spinner instead of showing the
  /// student their downloads.
  final Reachability reachability;

  const NetworkState({required this.kind, required this.reachability});

  /// Something answered. False while the first probe is still in flight, so
  /// never use this to decide to show an offline screen -- use [isOffline],
  /// which is only true once we know.
  bool get isOnline => reachability == Reachability.online;

  /// We asked, and nothing answered. This is the one that may hide content.
  bool get isOffline => reachability == Reachability.offline;

  bool get isKnown => reachability != Reachability.unknown;

  bool get isWifi => kind == NetworkKind.wifi;
  bool get isMetered => kind == NetworkKind.mobile;

  /// Before the first probe resolves.
  static const unknown = NetworkState(
    kind: NetworkKind.none,
    reachability: Reachability.unknown,
  );

  static const offline = NetworkState(
    kind: NetworkKind.none,
    reachability: Reachability.offline,
  );
}

/// Says whether the app can reach the internet, and tells anyone who asks
/// when that changes.
class ConnectivityService {
  ConnectivityService({Connectivity? connectivity})
    : _connectivity = connectivity ?? Connectivity() {
    _watch();
  }

  final Connectivity _connectivity;

  final StreamController<NetworkState> _states =
      StreamController<NetworkState>.broadcast();
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  Timer? _recheck;

  // Unknown, not offline. The probe has not run yet, and claiming the student
  // is offline before asking is what put the offline banner over Home on every
  // launch.
  NetworkState _current = NetworkState.unknown;

  /// Hosts worth asking. One is Supabase, because that is what the app
  /// actually needs to reach; the other is a public resolver, so a Supabase
  /// outage is not mistaken for the student being offline.
  static const List<String> _probeHosts = [
    'ubymqjdmeknoblkrlgrf.supabase.co',
    'one.one.one.one',
  ];

  static const Duration _probeTimeout = Duration(seconds: 3);

  /// Repeated while offline, so coming back is noticed even when the
  /// interface never changed -- which is exactly the dead-Wi-Fi case.
  static const Duration _offlineRecheck = Duration(seconds: 20);

  NetworkState get state => _current;

  /// A cheap, synchronous answer for code that cannot await, such as deciding
  /// whether to show the offline banner during a build.
  bool get isOnline => _current.isOnline;

  /// Known to be offline, as opposed to not yet asked.
  bool get isOffline => _current.isOffline;

  Stream<NetworkState> get states => _states.stream;

  Future<void> dispose() async {
    _recheck?.cancel();
    await _subscription?.cancel();
    await _states.close();
  }

  Future<void> _watch() async {
    _subscription = _connectivity.onConnectivityChanged.listen((results) {
      unawaited(_evaluate(results));
    });

    await refresh();
  }

  /// Re-examines the connection now. Called on resume and after a failure
  /// that might have been the network.
  Future<void> refresh() async {
    final results = await _connectivity.checkConnectivity();
    await _evaluate(results);
  }

  Future<void> _evaluate(List<ConnectivityResult> results) async {
    final kind = _kindOf(results);

    if (kind == NetworkKind.none) {
      _publish(NetworkState.offline);
      return;
    }

    final reachable = await _probe();
    _publish(
      NetworkState(
        kind: kind,
        reachability: reachable ? Reachability.online : Reachability.offline,
      ),
    );
  }

  NetworkKind _kindOf(List<ConnectivityResult> results) {
    if (results.contains(ConnectivityResult.wifi) ||
        results.contains(ConnectivityResult.ethernet)) {
      return NetworkKind.wifi;
    }
    if (results.contains(ConnectivityResult.mobile)) {
      return NetworkKind.mobile;
    }
    if (results.isEmpty || results.contains(ConnectivityResult.none)) {
      return NetworkKind.none;
    }
    return NetworkKind.other;
  }

  /// A DNS lookup rather than an HTTP request: it is a couple of packets, it
  /// needs no server of ours to be healthy, and a captive portal cannot fake
  /// a successful resolution of a host it is not intercepting.
  Future<bool> _probe() async {
    for (final host in _probeHosts) {
      try {
        final addresses = await InternetAddress.lookup(host)
            .timeout(_probeTimeout);
        if (addresses.isNotEmpty && addresses.first.rawAddress.isNotEmpty) {
          return true;
        }
      } on SocketException {
        continue;
      } on TimeoutException {
        continue;
      }
    }
    return false;
  }

  void _publish(NetworkState next) {
    _recheck?.cancel();

    // While offline, keep looking. An interface that never changes is the
    // common way a connection comes back unnoticed.
    if (!next.isOnline) {
      _recheck = Timer(_offlineRecheck, () => unawaited(refresh()));
    }

    if (next.kind == _current.kind &&
        next.reachability == _current.reachability) {
      return;
    }

    _current = next;
    if (!_states.isClosed) _states.add(next);

    // The kind and the verdict, and deliberately not the host that answered:
    // this fired on every network change and named the Supabase project, which
    // is a student's logcat telling anyone reading it where the content lives.
    logDebug(
      'connectivity',
      '${next.kind.name}, reachability=${next.reachability.name}',
    );
  }
}
