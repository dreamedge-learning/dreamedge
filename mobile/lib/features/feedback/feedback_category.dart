/// The categories a student can tag their feedback with.
///
/// Must match the `check` constraint on `public.student_feedback.category`.
/// If one is added here, add it to the migration as well, because the
/// database refuses an unknown value.
enum FeedbackCategory {
  content('content', 'Course content'),
  appProblem('app_problem', 'App problem'),
  websiteProblem('website_problem', 'Website problem'),
  payment('payment', 'Payment or billing'),
  suggestion('suggestion', 'Suggestion'),
  other('other', 'Something else');

  const FeedbackCategory(this.key, this.label);

  /// The value stored in the `category` column.
  final String key;

  /// The label the student sees in the picker.
  final String label;
}

/// How long the message can be. Mirrored in the database as a `check`
/// constraint, so a bad value is caught either way.
const int feedbackMessageMin = 10;
const int feedbackMessageMax = 2000;

/// One-off validator the form reuses and the test asserts on.
///
/// Returns `null` when the message is acceptable, or the user-facing reason
/// when it is not -- same shape as Flutter's `FormField` validators.
String? validateFeedbackMessage(String? value) {
  final text = (value ?? '').trim();
  if (text.length < feedbackMessageMin) {
    return 'Please write at least $feedbackMessageMin characters.';
  }
  if (text.length > feedbackMessageMax) {
    return 'Please keep it under $feedbackMessageMax characters.';
  }
  return null;
}
