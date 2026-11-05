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
/// the gating. The client sends only what the student wrote: the database
/// fills `student_id`, the status and the timestamp from the session, and
/// refuses those columns outright if a client tries to send them.
class FeedbackService {
  FeedbackService(this._client, {Future<String?> Function()? versionLoader})
      : _versionLoader = versionLoader ?? _defaultAppVersion;

  final SupabaseClient _client;
  final Future<String?> Function() _versionLoader;

  Future<FeedbackResult> submit(FeedbackSubmission submission) async {
    final error = validateFeedbackMessage(submission.message);
    if (error != null) return FeedbackFailure(error);

    if (_client.auth.currentUser == null) {
      return const FeedbackFailure(
        'You need to sign in again before sending feedback.',
      );
    }

    final version = await _versionLoader();

    try {
      await _client.from('student_feedback').insert({
        'category': submission.category.key,
        'message': submission.message.trim(),
        'source': 'app',
        'app_version': version,
      });

      return const FeedbackOk();
    } on PostgrestException catch (err) {
      return FeedbackFailure(describeFeedbackError(err.code, err.message));
    } catch (_) {
      return const FeedbackFailure(
        'Could not send your feedback. Please try again.',
      );
    }
  }
}

/// Turns a database refusal into a sentence for the student.
///
/// Only the rate limit's own message is passed through, because that one is
/// written for students. Anything else (an RLS refusal, a constraint name)
/// is database wording and is replaced with something a student can act on.
String describeFeedbackError(String? code, String message) {
  switch (code) {
    case '53400':
      return message;
    // RLS refuses the row when the signed-in account has no student record
    // yet, which in practice means registration was never finished.
    case '42501':
      return 'Your account is not fully set up yet. Finish your profile and try again.';
    default:
      return 'Could not send your feedback. Please try again.';
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
