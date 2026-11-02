import 'package:flutter/material.dart';

import '../../../config/constants.dart';
import '../../../core/models/student_profile_draft.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// Everything the student typed, with a way back into each step.
class ProfileReviewList extends StatelessWidget {
  final StudentProfileDraft draft;
  final void Function(ProfileStep) onEdit;

  const ProfileReviewList({
    super.key,
    required this.draft,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Check your details', style: AppTypography.heading3),
        const SizedBox(height: 4),
        Text(
          'You can change any of this later from your profile.',
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 20),
        for (final step in profileSteps) ...[
          _Section(
            step: step,
            rows: _rowsFor(step),
            onEdit: () => onEdit(step),
          ),
          const SizedBox(height: 16),
        ],
      ],
    );
  }

  List<(String, String)> _rowsFor(ProfileStep step) => switch (step) {
        ProfileStep.student => [
            ('Full name', draft.fullName),
            ('Date of birth', draft.dateOfBirth),
            ('Gender', AppConstants.genders[draft.gender] ?? ''),
          ],
        ProfileStep.academics => [
            (
              'Current class',
              draft.studentClass.isEmpty ? '' : 'Class ${draft.studentClass}'
            ),
            (
              'Board',
              draft.board == 'State' ? 'State Board' : draft.board,
            ),
            ('School name', draft.schoolName),
          ],
        ProfileStep.contact => [
            ('Your mobile number', draft.phone),
            ('Contact email', draft.email),
            ('Parent or guardian name', draft.parentName),
            ('Parent or guardian mobile number', draft.parentPhone),
          ],
        ProfileStep.location => [
            ('City', draft.city),
            ('State', draft.state),
            ('PIN code', draft.pincode),
            ('Address', draft.addressLine),
          ],
      };
}

class _Section extends StatelessWidget {
  final ProfileStep step;
  final List<(String, String)> rows;
  final VoidCallback onEdit;

  const _Section({
    required this.step,
    required this.rows,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                step.title,
                style: AppTypography.bodyMedium
                    .copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            TextButton(
              onPressed: onEdit,
              child: const Text('Edit'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              for (var index = 0; index < rows.length; index++)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    border: index == 0
                        ? null
                        : const Border(
                            top: BorderSide(color: AppColors.border),
                          ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 130,
                        child: Text(
                          rows[index].$1,
                          style: AppTypography.bodySmall.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          rows[index].$2.isEmpty ? '—' : rows[index].$2,
                          style: AppTypography.bodySmall.copyWith(
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
