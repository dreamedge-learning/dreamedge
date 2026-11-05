import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/providers/auth_provider.dart';
import '../../core/providers/password_recovery_provider.dart';
import '../../core/utils/extensions.dart';
import '../../core/utils/validators.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_logo.dart';
import 'widgets/auth_text_field.dart';

/// Where a password-reset link lands: choose the new password.
///
/// The student is already signed in by the time this shows -- the link did
/// that -- so saving is a single update to the account, and on success they
/// go straight into the app rather than back to a sign-in form to type the
/// password they just chose.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_isSaving || !_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);

    try {
      await ref.read(authServiceProvider).resetPassword(_passwordController.text);
      ref.read(passwordRecoveryProvider.notifier).completed();
      if (!mounted) return;
      context.showSnackBar('Password updated. You are signed in.');
      context.go('/');
    } on AuthException catch (error) {
      if (!mounted) return;
      context.showSnackBar(_describe(error), isError: true);
    } catch (_) {
      if (!mounted) return;
      context.showSnackBar(
        'Could not update the password. Check your connection and try again.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  /// Supabase's own wording for the two refusals a student can cause, in
  /// words a student will act on.
  String _describe(AuthException error) {
    final message = error.message.toLowerCase();
    if (message.contains('different from the old')) {
      return 'Choose a password different from your old one.';
    }
    if (message.contains('weak') || message.contains('at least')) {
      return 'That password is too easy to guess. Try a longer one.';
    }
    return 'Could not update the password. Please request a new reset link.';
  }

  /// Leaving without a new password signs out. Staying signed in on a
  /// recovery session would leave the student in the app with a password they
  /// have already said they do not know.
  Future<void> _cancel() async {
    ref.read(passwordRecoveryProvider.notifier).completed();
    await ref.read(authServiceProvider).logout();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Form(
              key: _formKey,
              child: Column(
                children: [
                  const SizedBox(height: 56),
                  const AppLogo(size: LogoSize.small),
                  const SizedBox(height: 32),
                  Text('Choose a New Password', style: AppTypography.heading2),
                  const SizedBox(height: 8),
                  Text(
                    'At least ${Validators.minPasswordLength} characters. '
                    "You'll use it to sign in on the app and the website.",
                    style: AppTypography.bodyMedium.copyWith(
                      color: AppColors.textSecondary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 40),
                  AuthTextField(
                    controller: _passwordController,
                    label: 'New password',
                    hint: 'Enter a new password',
                    prefixIcon: Icons.lock_outline,
                    isPassword: true,
                    textInputAction: TextInputAction.next,
                    validator: Validators.newPassword,
                  ),
                  const SizedBox(height: 16),
                  AuthTextField(
                    controller: _confirmController,
                    label: 'Confirm password',
                    hint: 'Type it again',
                    prefixIcon: Icons.lock_outline,
                    isPassword: true,
                    textInputAction: TextInputAction.done,
                    validator: (value) => Validators.confirmPassword(
                      value,
                      _passwordController.text,
                    ),
                    onFieldSubmitted: (_) => _save(),
                  ),
                  const SizedBox(height: 28),
                  AppButton(
                    label: 'Save Password',
                    isLoading: _isSaving,
                    onPressed: _save,
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: _isSaving ? null : _cancel,
                    child: const Text('Cancel and sign out'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
