import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import 'feedback_category.dart';
import 'feedback_service.dart';

/// Section label style: not in the theme because it's the shape bodyMedium
/// takes when it stands in for a form label, and introducing a new token for
/// one screen would widen the theme for no reason.
TextStyle _labelStyle() =>
    AppTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600);

/// Send-feedback screen, reached from the Profile tab.
///
/// Mirrors the student website's `/dashboard/feedback` page. The validation,
/// the character limit and the 24-hour cap are enforced by the database, so
/// the UI is safe to be permissive and informative rather than defensive.
class FeedbackScreen extends ConsumerStatefulWidget {
  const FeedbackScreen({super.key});

  @override
  ConsumerState<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends ConsumerState<FeedbackScreen> {
  final _messageController = TextEditingController();
  FeedbackCategory _category = FeedbackCategory.content;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _messageController.addListener(() {
      // Re-run build so the live counter and the submit button both update
      // with every keystroke.
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  bool get _valid {
    final raw = _messageController.text;
    final trimmed = raw.trim();
    return trimmed.length >= feedbackMessageMin &&
        raw.length <= feedbackMessageMax;
  }

  Future<void> _submit() async {
    if (!_valid || _submitting) return;

    setState(() => _submitting = true);

    final result = await ref.read(feedbackServiceProvider).submit(
          FeedbackSubmission(
            category: _category,
            message: _messageController.text,
          ),
        );

    if (!mounted) return;
    setState(() => _submitting = false);

    switch (result) {
      case FeedbackOk():
        _messageController.clear();
        setState(() => _category = FeedbackCategory.content);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Thanks -- we've received your feedback."),
            behavior: SnackBarBehavior.floating,
          ),
        );
      case FeedbackFailure(:final message):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final length = _messageController.text.length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Send feedback')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Text(
              "Found a bug, have an idea, or something not working the way you expected? Tell us -- Rahul Sir and the team read every message.",
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 20),

            Text('What is this about?', style: _labelStyle()),
            const SizedBox(height: 8),
            _CategoryPicker(
              value: _category,
              onChanged: (next) => setState(() => _category = next),
            ),

            const SizedBox(height: 20),

            Row(
              children: [
                Expanded(
                  child: Text(
                    'Your message',
                    style: _labelStyle(),
                  ),
                ),
                Text(
                  '$length/$feedbackMessageMax',
                  style: AppTypography.caption.copyWith(
                    color: length > feedbackMessageMax
                        ? AppColors.error
                        : AppColors.textSecondary,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _messageController,
              minLines: 6,
              maxLines: 12,
              textCapitalization: TextCapitalization.sentences,
              maxLength: feedbackMessageMax + 50,
              buildCounter: (
                _, {
                required int currentLength,
                required bool isFocused,
                int? maxLength,
              }) =>
                  null,
              decoration: InputDecoration(
                hintText:
                    'What would you like to tell us? Minimum $feedbackMessageMin characters.',
                hintStyle: AppTypography.bodySmall.copyWith(
                  color: AppColors.textSecondary.withValues(alpha: 0.6),
                ),
                filled: true,
                fillColor: AppColors.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.orange),
                ),
              ),
            ),

            const SizedBox(height: 8),
            Text(
              'We look at every message. Please do not include passwords.',
              style: AppTypography.caption
                  .copyWith(color: AppColors.textSecondary),
            ),

            const SizedBox(height: 20),

            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _valid && !_submitting ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.orange,
                  foregroundColor: AppColors.white,
                  disabledBackgroundColor:
                      AppColors.orange.withValues(alpha: 0.4),
                  disabledForegroundColor: AppColors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(AppColors.white),
                        ),
                      )
                    : const Icon(Icons.send_outlined, size: 18),
                label: Text(_submitting ? 'Sending...' : 'Send'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryPicker extends StatelessWidget {
  final FeedbackCategory value;
  final ValueChanged<FeedbackCategory> onChanged;

  const _CategoryPicker({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<FeedbackCategory>(
          value: value,
          isExpanded: true,
          dropdownColor: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          style: AppTypography.bodyMedium,
          icon: const Icon(Icons.keyboard_arrow_down,
              color: AppColors.textSecondary),
          onChanged: (next) {
            if (next != null) onChanged(next);
          },
          items: [
            for (final category in FeedbackCategory.values)
              DropdownMenuItem(
                value: category,
                child: Text(category.label),
              ),
          ],
        ),
      ),
    );
  }
}
