import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'supabase_provider.dart';

/// Whether the session in hand came from a password-reset link and the new
/// password has not been chosen yet.
///
/// Opening the reset link signs the student in. Without this flag the router
/// would treat that like any other sign-in and drop them on Home, with the
/// password they forgot still the only one on the account. While it is set,
/// the router holds them on the screen that sets a new one.
///
/// Raised by the `passwordRecovery` auth event, which the Supabase client
/// emits when it exchanges a reset code it issued on this phone. Lowered when
/// the password is saved or the session ends.
class PasswordRecovery extends Notifier<bool> {
  @override
  bool build() {
    ref.listen<AsyncValue<AuthState>>(authStateProvider, (_, next) {
      final event = next.valueOrNull?.event;
      if (event == AuthChangeEvent.passwordRecovery) {
        state = true;
      } else if (event == AuthChangeEvent.signedOut) {
        state = false;
      }
    });

    // The auth stream replays its latest event to a new listener, so a reset
    // link that cold-started the app is still seen here; this covers the read
    // made before the listener above has fired.
    return ref.read(authStateProvider).valueOrNull?.event ==
        AuthChangeEvent.passwordRecovery;
  }

  void completed() => state = false;
}

final passwordRecoveryProvider =
    NotifierProvider<PasswordRecovery, bool>(PasswordRecovery.new);
