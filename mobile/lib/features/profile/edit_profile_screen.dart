import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/student.dart';
import '../../core/models/student_profile_draft.dart';
import '../../core/providers/student_provider.dart';
import '../../core/utils/extensions.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/loading_indicator.dart';
import '../profile_setup/widgets/profile_step_fields.dart';

/// The profile, editable after the fact.
///
/// One page rather than the four steps of the setup form: a student coming
/// back to change a school name or move up a class wants the field in front
/// of them, not a wizard. The fields themselves are the same widgets in the
/// same order, so nothing can ask for a value one way here and another way
/// there.
///
/// Saving goes through the same `complete_student_profile` call as the setup
/// form, because that function is where the rule for a complete profile
/// lives: an edit must not be able to blank a field the setup form insisted
/// on.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();

  StudentProfileDraft? _draft;
  bool _saving = false;

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final draft = _draft;
    if (draft == null) return;

    setState(() => _saving = true);

    try {
      await ref
          .read(studentServiceProvider)
          .completeProfile(draft.toProfilePayload());

      ref.invalidate(currentStudentProvider);

      if (mounted) {
        context.showSnackBar('Profile updated');
        context.pop();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        context.showSnackBar(_readableError(error), isError: true);
      }
    }
  }

  String _readableError(Object error) {
    final message = error.toString();

    if (message.contains('already uses that email')) {
      return 'Another Dream Edge account already uses that email address.';
    }
    if (message.contains('missing something we need')) {
      return 'Something required is blank. Fill it in and save again.';
    }
    return 'Could not save your profile. Please try again.';
  }

  @override
  Widget build(BuildContext context) {
    final studentAsync = ref.watch(currentStudentProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Edit Profile')),
      body: SafeArea(
        child: studentAsync.when(
          loading: () => const Center(child: LoadingIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'We could not load your profile. Check your connection and '
                'try again.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ),
          data: (student) {
            if (student == null) return const SizedBox.shrink();

            _draft ??= StudentProfileDraft.fromStudent(student);

            return _buildForm(student, _draft!);
          },
        ),
      ),
    );
  }

  Widget _buildForm(Student student, StudentProfileDraft draft) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (student.studentCode != null)
              Container(
                margin: const EdgeInsets.only(bottom: 20),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.badge_outlined,
                        size: 18, color: AppColors.textSecondary),
                    const SizedBox(width: 10),
                    Text(
                      'Student code',
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      student.studentCode!,
                      style: AppTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            for (final step in profileSteps) ...[
              ProfileStepFields(
                step: step,
                draft: draft,
                signInEmail: student.hasRealEmail ? student.email : null,
                onChanged: () => setState(() {}),
              ),
              const SizedBox(height: 8),
            ],
            const SizedBox(height: 12),
            AppButton(
              label: 'Save changes',
              isLoading: _saving,
              onPressed: _save,
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
