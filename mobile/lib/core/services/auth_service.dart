import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config/app_config.dart';

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
          // `students` has no `is_active` column -- state lives in the
          // `status` enum -- and `student_code` and `referral_code` are
          // assigned by a trigger on insert, so neither is sent from here.
          //
          // `referred_by` holds the referral code as typed -- it is a plain
          // text column, not a foreign key to students(id) as an earlier note
          // here claimed, which is why the code was being dropped on the
          // floor. The website's signup path has always stored it.
          if (referralCode != null && referralCode.trim().isNotEmpty)
            'referred_by': referralCode.trim(),
        } as Map<String, dynamic>);
      } catch (_) {
        // Student row creation is handled by DB trigger as fallback
      }
    }

    return response;
  }

  /// Where the reset email's link lands before it hands over to the app.
  ///
  /// The link cannot point at the app directly: Supabase only redirects to
  /// addresses on its allow-list, and the website's domain is on it while the
  /// app's own scheme is not. So the email opens a page on the website, which
  /// passes the one-time code on to `com.dreamedge.mobile://reset-password`.
  /// The code is useless anywhere but this phone -- the matching verifier was
  /// stored here when the reset was requested -- which is also why the web
  /// page cannot finish the reset itself.
  static const String passwordResetRedirect =
      '${AppConfig.apiBaseUrl}/auth/open-app?to=reset-password';

  Future<void> forgotPassword(String email) async {
    await _client.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo: passwordResetRedirect,
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
