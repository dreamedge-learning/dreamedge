import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/student.dart';
import '../../core/models/student_profile_draft.dart';
import '../../core/providers/student_provider.dart';
import '../../core/utils/extensions.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/loading_indicator.dart';
import 'widgets/profile_review_list.dart';
import 'widgets/profile_step_fields.dart';
import 'widgets/profile_step_indicator.dart';

/// The mandatory profile, in the app.
///
/// The website closed this hole first; without the same wall here, a student
/// who signs in with Google on the phone walks straight past it and the
/// centre still has no class, no school and no way to reach a parent.
///
/// Field order, wording and validation mirror the website's form on purpose:
/// the same student may fill one on a phone and the other on a laptop, and an
/// admin at the counter works from a printed sheet that follows the same
/// order.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _formKey = GlobalKey<FormState>();

  StudentProfileDraft? _draft;
  String? _studentId;
  int _stepIndex = 0;
  bool _reviewing = false;
  bool _saving = false;
  bool _submitting = false;
  String? _completedCode;

  ProfileStep get _step => profileSteps[_stepIndex];

  void _seed(Student student) {
    _draft ??= StudentProfileDraft.fromStudent(student);
    _studentId ??= student.id;
  }

  Future<void> _next() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final draft = _draft;
    final studentId = _studentId;
    if (draft == null || studentId == null) return;

    setState(() => _saving = true);

    try {
      // Autosave, so a student who stops at step 3 and comes back tomorrow
      // finds steps 1 and 2 still filled. The gate stays shut either way:
      // `profile_completed` is not a column a student may write.
      await ref
          .read(studentServiceProvider)
          .saveProfileStep(studentId, draft.columnsFor(_step));
    } catch (error) {
      if (mounted) {
        context.showSnackBar(
          'Could not save that step. Check your connection and try again.',
          isError: true,
        );
      }
      if (mounted) setState(() => _saving = false);
      return;
    }

    if (!mounted) return;

    setState(() {
      _saving = false;
      if (_stepIndex == profileSteps.length - 1) {
        _reviewing = true;
      } else {
        _stepIndex += 1;
      }
    });
  }

  void _back() {
    if (_reviewing) {
      setState(() => _reviewing = false);
      return;
    }
    if (_stepIndex > 0) setState(() => _stepIndex -= 1);
  }

  void _editStep(ProfileStep step) {
    setState(() {
      _reviewing = false;
      _stepIndex = profileSteps.indexOf(step);
    });
  }

  Future<void> _submit() async {
    final draft = _draft;
    if (draft == null) return;

    setState(() => _submitting = true);

    try {
      final code = await ref
          .read(studentServiceProvider)
          .completeProfile(draft.toProfilePayload());

      // The router gates on this, so the cached student has to be refetched
      // before the redirect is asked again.
      ref.invalidate(currentStudentProvider);

      if (mounted) {
        setState(() {
          _submitting = false;
          _completedCode = code ?? '';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() => _submitting = false);
        context.showSnackBar(_readableError(error), isError: true);
      }
    }
  }

  /// The database raises messages written for a student; anything else is a
  /// fault on our side and should not be shown verbatim.
  String _readableError(Object error) {
    final message = error.toString();

    if (message.contains('already uses that email')) {
      return 'Another Dream Edge account already uses that email address.';
    }
    if (message.contains('missing something we need')) {
      return 'Something required is still blank. Check each step and try again.';
    }
    return 'Could not save your profile. Please try again.';
  }

  @override
  Widget build(BuildContext context) {
    final studentAsync = ref.watch(currentStudentProvider);

    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: studentAsync.when(
          loading: () => const Center(child: LoadingIndicator()),
          error: (error, _) => _LoadFailure(
            onRetry: () => ref.invalidate(currentStudentProvider),
          ),
          data: (student) {
            if (student == null) {
              return _LoadFailure(
                onRetry: () => ref.invalidate(currentStudentProvider),
              );
            }

            _seed(student);

            if (_completedCode != null) {
              return _CompletionView(studentCode: _completedCode!);
            }

            return _buildForm(student);
          },
        ),
      ),
    );
  }

  Widget _buildForm(Student student) {
    final draft = _draft!;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Complete your profile', style: AppTypography.heading2),
            const SizedBox(height: 6),
            Text(
              'A few details before you start. This takes about two minutes.',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 20),
            ProfileStepIndicator(
              completed: _reviewing ? profileSteps.length : _stepIndex,
            ),
            const SizedBox(height: 24),
            if (_reviewing)
              ProfileReviewList(draft: draft, onEdit: _editStep)
            else
              ProfileStepFields(
                step: _step,
                draft: draft,
                signInEmail: student.hasRealEmail ? student.email : null,
                onChanged: () => setState(() {}),
              ),
            const SizedBox(height: 28),
            AppButton(
              label: _reviewing ? 'Finish' : 'Continue',
              isLoading: _saving || _submitting,
              onPressed: _reviewing ? _submit : _next,
            ),
            const SizedBox(height: 8),
            if (_stepIndex > 0 || _reviewing)
              TextButton(
                onPressed: (_saving || _submitting) ? null : _back,
                child: const Text('Back'),
              ),
            const SizedBox(height: 12),
            Text(
              'Fields marked with an asterisk are required. Your answers are '
              'saved as you go.',
              textAlign: TextAlign.center,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadFailure extends StatelessWidget {
  final VoidCallback onRetry;

  const _LoadFailure({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 40, color: AppColors.gray),
          const SizedBox(height: 12),
          Text(
            'We could not load your profile',
            style: AppTypography.heading3,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            'Check your connection and try again.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyMedium.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 20),
          AppButton(
            label: 'Try again',
            variant: ButtonVariant.outline,
            fullWidth: false,
            onPressed: onRetry,
          ),
        ],
      ),
    );
  }
}

class _CompletionView extends StatelessWidget {
  final String studentCode;

  const _CompletionView({required this.studentCode});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            height: 64,
            width: 64,
            decoration: BoxDecoration(
              color: AppColors.orange.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded,
                size: 32, color: AppColors.orange),
          ),
          const SizedBox(height: 20),
          Text("You're all set", style: AppTypography.heading2),
          const SizedBox(height: 8),
          Text(
            'Your profile is complete. Keep your student code handy — the '
            'Kalmeshwar centre uses it on receipts and enquiries.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyMedium.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          if (studentCode.isNotEmpty) ...[
            const SizedBox(height: 24),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  Text(
                    'YOUR STUDENT CODE',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.textSecondary,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    studentCode,
                    style: AppTypography.heading2.copyWith(letterSpacing: 2),
                  ),
                  const SizedBox(height: 12),
                  AppButton(
                    label: 'Copy code',
                    variant: ButtonVariant.outline,
                    fullWidth: false,
                    icon: Icons.copy_rounded,
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: studentCode));
                      context.showSnackBar('Student code copied');
                    },
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 28),
          // No navigation call: the router redirect that sent the student
          // here reruns once the refetched profile says it is complete, and
          // puts them wherever they were going.
          const LoadingIndicator(),
          const SizedBox(height: 12),
          Text(
            'Taking you to your courses…',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
