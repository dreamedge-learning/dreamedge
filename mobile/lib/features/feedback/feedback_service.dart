import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/providers/supabase_provider.dart';
import 'feedback_category.dart';

/// A submission as the UI holds it just before the write.
class FeedbackSubmission {
  final FeedbackCategory category;
  final String message;

  const FeedbackSubmission({required this.category, required this.message});
}

/// The outcome worth telling the UI.
///
/// The rate-limit trigger raises SQLSTATE 53400 with a human-readable
/// message, so a refusal already carries a sentence the student can read.
/// We pass that through rather than inventing another one.
sealed class FeedbackResult {
  const FeedbackResult();
}

class FeedbackOk extends FeedbackResult {
  const FeedbackOk();
}

class FeedbackFailure extends FeedbackResult {
  final String message;
  const FeedbackFailure(this.message);
}

/// Thin wrapper around the student's own Supabase session.
///
/// Writes go through the student's auth token, so Row Level Security does
/// the gating. We never set `student_id` on the client -- the policy's
/// `with check (student_id = current_student_id())` is what proves the row
/// belongs to the caller.
class FeedbackService {
  FeedbackService(this._client, {Future<String?> Function()? versionLoader})
      : _versionLoader = versionLoader ?? _defaultAppVersion;

  final SupabaseClient _client;
  final Future<String?> Function() _versionLoader;

  Future<FeedbackResult> submit(FeedbackSubmission submission) async {
    final error = validateFeedbackMessage(submission.message);
    if (error != null) return FeedbackFailure(error);

    final student = _client.auth.currentUser;
    if (student == null) {
      return const FeedbackFailure(
        'You need to sign in again before sending feedback.',
      );
    }

    final version = await _versionLoader();

    try {
      // The student_id is set by RLS via a with-check; see the migration.
      // We still set it to the student's `students.id` here so the row has
      // a value to measure the policy against. That value comes from the
      // students row for the current auth user.
      final studentRow = await _client
          .from('students')
          .select('id')
          .eq('user_id', student.id)
          .maybeSingle();

      final studentId = studentRow?['id'] as String?;
      if (studentId == null) {
        return const FeedbackFailure(
          'Your account is not fully set up yet. Finish your profile and try again.',
        );
      }

      await _client.from('student_feedback').insert({
        'student_id': studentId,
        'category': submission.category.key,
        'message': submission.message.trim(),
        'source': 'app',
        'app_version': version,
      });

      return const FeedbackOk();
    } on PostgrestException catch (err) {
      // Trigger-raised rate limit, pass the human-readable sentence through.
      if (err.code == '53400') {
        return FeedbackFailure(err.message);
      }
      return FeedbackFailure(
        err.message.isNotEmpty
            ? err.message
            : 'Could not send your feedback. Please try again.',
      );
    } catch (_) {
      return const FeedbackFailure(
        'Could not send your feedback. Please try again.',
      );
    }
  }
}

Future<String?> _defaultAppVersion() async {
  try {
    final info = await PackageInfo.fromPlatform();
    final build = info.buildNumber.isEmpty ? '' : '+${info.buildNumber}';
    final combined = '${info.version}$build';
    return combined.isEmpty ? null : combined;
  } catch (_) {
    return null;
  }
}

final feedbackServiceProvider = Provider<FeedbackService>((ref) {
  return FeedbackService(ref.watch(supabaseClientProvider));
});
