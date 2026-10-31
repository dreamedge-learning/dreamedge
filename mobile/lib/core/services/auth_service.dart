import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  final SupabaseClient _client;

  AuthService(this._client);

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

  Future<void> logout() async {
    await _client.auth.signOut();
  }
}
