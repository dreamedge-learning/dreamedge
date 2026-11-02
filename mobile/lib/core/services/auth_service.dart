import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final SupabaseClient _client;

  /// What to tear down before the session goes.
  ///
  /// Sign-out used to be `signOut()` and nothing else, with the cleanup
  /// written into the one button that called it. Every other way a session
  /// ends -- and there are several -- skipped it, leaving the next student
  /// looking at this one's cached course list. It belongs here, where it
  /// cannot be forgotten.
  final Future<void> Function()? _onSignOut;

  AuthService(this._client, {this._onSignOut});

  Session? get currentSession => _client.auth.currentSession;
  User? get currentUser => _client.auth.currentUser;

  Future<AuthResponse> login(String email, String password) async {
    return await _client.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<AuthResponse> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
    String? studentClass,
    String? referralCode,
  }) async {
    final response = await _client.auth.signUp(
      email: email.trim(),
      password: password,
      data: {
        'full_name': fullName.trim(),
        if (phone != null && phone.isNotEmpty) 'phone': phone.trim(),
      },
    );

    if (response.user != null) {
      try {
        await _client.from('students').upsert({
          'user_id': response.user!.id,
          'full_name': fullName.trim(),
          'email': email.trim(),
          if (phone != null && phone.isNotEmpty) 'phone': phone.trim(),
          if (studentClass != null) 'class': studentClass,
          // `students` has no `is_active` column (it has `status`), and
          // `referred_by` is a uuid FK to students(id) — a referral *code*
          // cannot be written into it from here.
          // TODO(backend): resolve a referral code to the referring student
          // server-side (e.g. in the signup trigger) and set `referred_by`
          // there.
        } as Map<String, dynamic>);
      } catch (_) {
        // Student row creation is handled by DB trigger as fallback
      }
    }

    return response;
  }

  Future<void> forgotPassword(String email) async {
    await _client.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo: 'com.dreamedge.mobile://reset-password',
    );
  }

  Future<void> resetPassword(String newPassword) async {
    await _client.auth.updateUser(
      UserAttributes(password: newPassword),
    );
  }

  /// Ends the session, after clearing what belonged to it.
  ///
  /// The cleanup runs first, while the student's identity can still be
  /// resolved -- the cached mirrors are scoped by student id and dropping them
  /// afterwards would have nothing to scope by.
  ///
  /// Downloads are deliberately not touched. They are scoped to a student id
  /// and checked against the signed-in one before a file is opened, so keeping
  /// them is safe; deleting them would cost a student who signs back in a
  /// gigabyte of mobile data for nothing.
  Future<void> logout() async {
    try {
      await _onSignOut?.call();
    } catch (_) {
      // A failed teardown must not trap the student in a session they asked to
      // leave. The worst case is a stale cached catalogue, which the next
      // refresh replaces.
    }
    await _client.auth.signOut();
  }
}
