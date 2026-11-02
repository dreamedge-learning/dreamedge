import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/student.dart';

class StudentService {
  final SupabaseClient _client;

  StudentService(this._client);

  Future<Student?> getCurrentStudent() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return null;

    final data = await _client
        .from('students')
        .select()
        .eq('user_id', userId)
        .maybeSingle();

    if (data == null) return null;
    return Student.fromJson(data);
  }

  Future<Student> createStudentProfile({
    required String userId,
    required String fullName,
    required String email,
    String? phone,
    String? studentClass,
  }) async {
    // `student_code` and `referral_code` are assigned by a trigger, and
    // `profile_completed` defaults to false, which is what sends a new
    // student to the profile form however they signed up.
    final data = await _client.from('students').insert({
      'user_id': userId,
      'full_name': fullName,
      'email': email,
      'phone': phone,
      'class': studentClass,
    }).select().single();
    return Student.fromJson(data);
  }

  Future<Student> updateStudentProfile(
    String studentId,
    Map<String, dynamic> updates,
  ) async {
    final data = await _client
        .from('students')
        .update(updates)
        .eq('id', studentId)
        .select()
        .single();
    return Student.fromJson(data);
  }

  /// Saves one step of the profile form as the student leaves it.
  ///
  /// A plain update, which row-level security allows on a student's own row.
  /// `profile_completed` is not among the columns a student may write, so an
  /// autosave can never open the gate halfway through — that is what
  /// [completeProfile] is for.
  Future<void> saveProfileStep(
    String studentId,
    Map<String, dynamic> columns,
  ) async {
    if (columns.isEmpty) return;

    await _client.from('students').update(columns).eq('id', studentId);
  }

  /// Opens the gate, and returns the student code to show once.
  ///
  /// Goes through `complete_student_profile` rather than writing the flag
  /// directly, because the flag is closed to students by a trigger and the app
  /// has no service-role key — nor should it. The function also owns the rule
  /// for which fields a finished profile must carry, so the app and the
  /// website cannot disagree about it.
  Future<String?> completeProfile(Map<String, dynamic> profile) async {
    final result = await _client.rpc<String?>(
      'complete_student_profile',
      params: {'p_profile': profile},
    );

    return result;
  }
}
