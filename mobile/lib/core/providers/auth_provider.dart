import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../offline/offline_db.dart';
import '../services/auth_service.dart';
import 'offline_provider.dart';
import 'supabase_provider.dart';

final authServiceProvider = Provider<AuthService>((ref) {
  final client = ref.watch(supabaseClientProvider);

  return AuthService(
    client,
    onSignOut: () async {
      // The cached catalogue belonged to the session that is ending. The
      // downloads do not go with it: they are scoped to a student id and
      // re-checked against the signed-in one, so keeping them is safe and
      // kinder than making a returning student re-fetch a course.
      await ref.read(offlineStoreProvider).forgetCachedMirrors();
      await OfflineDb.close();
    },
  );
});

final isAuthenticatedProvider = Provider<bool>((ref) {
  final session = ref.watch(currentSessionProvider);
  return session != null;
});
