import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../config/constants.dart';
import '../../../core/models/student_profile_draft.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// The fields of whichever step is on screen.
///
/// One widget rather than four screens: the steps share their decoration,
/// their validation and the way a value reaches the draft, and splitting them
/// would mean four copies of all three.
class ProfileStepFields extends StatelessWidget {
  final ProfileStep step;
  final StudentProfileDraft draft;

  /// The address the student signs in with, when it is a real one. Editing
  /// the contact email never changes it, and the hint says so.
  final String? signInEmail;

  final VoidCallback onChanged;

  const ProfileStepFields({
    super.key,
    required this.step,
    required this.draft,
    required this.signInEmail,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(step.title, style: AppTypography.heading3),
        const SizedBox(height: 4),
        Text(
          step.blurb,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 20),
        ...switch (step) {
          ProfileStep.student => _studentFields(),
          ProfileStep.academics => _academicFields(),
          ProfileStep.contact => _contactFields(),
          ProfileStep.location => _locationFields(),
        },
      ],
    );
  }

  List<Widget> _studentFields() => [
        _Text(
          label: 'Full name *',
          initial: draft.fullName,
          autofill: const [AutofillHints.name],
          capitalization: TextCapitalization.words,
          validator: Validators.name,
          onChanged: (value) => draft.fullName = value,
        ),
        _Text(
          label: 'Date of birth',
          hint: 'YYYY-MM-DD',
          helper: 'Used on certificates and for age-appropriate courses.',
          initial: draft.dateOfBirth,
          keyboard: TextInputType.datetime,
          validator: Validators.dateOfBirth,
          onChanged: (value) => draft.dateOfBirth = value,
        ),
        _Dropdown(
          label: 'Gender',
          value: draft.gender.isEmpty ? null : draft.gender,
          items: AppConstants.genders.entries
              .map((entry) => DropdownMenuItem(
                    value: entry.key,
                    child: Text(entry.value),
                  ))
              .toList(),
          placeholder: 'Prefer not to say',
          onChanged: (value) {
            draft.gender = value ?? '';
            onChanged();
          },
        ),
      ];

  List<Widget> _academicFields() => [
        _Dropdown(
          label: 'Current class *',
          value: draft.studentClass.isEmpty ? null : draft.studentClass,
          items: AppConstants.classes
              .map((value) => DropdownMenuItem(
                    value: value,
                    child: Text('Class $value'),
                  ))
              .toList(),
          placeholder: 'Select your class',
          validator: (value) => Validators.required(value, 'Class'),
          onChanged: (value) {
            draft.studentClass = value ?? '';
            onChanged();
          },
        ),
        _Dropdown(
          label: 'Board *',
          value: draft.board.isEmpty ? null : draft.board,
          items: AppConstants.boards
              .map((value) => DropdownMenuItem(
                    value: value,
                    child: Text(value == 'State' ? 'State Board' : value),
                  ))
              .toList(),
          placeholder: 'Select your board',
          validator: (value) => Validators.required(value, 'Board'),
          onChanged: (value) {
            draft.board = value ?? '';
            onChanged();
          },
        ),
        _Text(
          label: 'School name *',
          initial: draft.schoolName,
          capitalization: TextCapitalization.words,
          validator: (value) => Validators.required(value, 'School name'),
          onChanged: (value) => draft.schoolName = value,
        ),
      ];

  List<Widget> _contactFields() => [
        _Text(
          label: 'Your mobile number',
          hint: '9876543210',
          helper: 'Leave this blank if you do not have your own phone.',
          initial: draft.phone,
          keyboard: TextInputType.phone,
          maxLength: 10,
          digitsOnly: true,
          autofill: const [AutofillHints.telephoneNumber],
          validator: Validators.phone,
          onChanged: (value) => draft.phone = value,
        ),
        _Text(
          label: 'Parent or guardian name *',
          initial: draft.parentName,
          capitalization: TextCapitalization.words,
          validator: (value) =>
              Validators.required(value, 'Parent or guardian name'),
          onChanged: (value) => draft.parentName = value,
        ),
        _Text(
          label: 'Parent or guardian mobile number *',
          hint: '9876543210',
          helper: 'This can be the same number as yours.',
          initial: draft.parentPhone,
          keyboard: TextInputType.phone,
          maxLength: 10,
          digitsOnly: true,
          validator: (value) => Validators.requiredPhone(
            value,
            'Parent or guardian mobile number',
          ),
          onChanged: (value) => draft.parentPhone = value,
        ),
        _Text(
          label: 'Contact email',
          hint: 'you@example.com',
          helper: signInEmail == null
              ? 'We will use this for receipts and class updates.'
              : 'Changing this does not change how you sign in — that stays '
                  '$signInEmail.',
          initial: draft.email,
          keyboard: TextInputType.emailAddress,
          autofill: const [AutofillHints.email],
          validator: (value) =>
              (value == null || value.trim().isEmpty) ? null : Validators.email(value),
          onChanged: (value) => draft.email = value,
        ),
      ];

  List<Widget> _locationFields() => [
        _Text(
          label: 'City *',
          initial: draft.city,
          capitalization: TextCapitalization.words,
          autofill: const [AutofillHints.addressCity],
          validator: (value) => Validators.required(value, 'City'),
          onChanged: (value) => draft.city = value,
        ),
        _Dropdown(
          label: 'State *',
          value: draft.state.isEmpty ? null : draft.state,
          items: AppConstants.indianStates
              .map((value) => DropdownMenuItem(value: value, child: Text(value)))
              .toList(),
          placeholder: 'Select your state',
          validator: (value) => Validators.required(value, 'State'),
          onChanged: (value) {
            draft.state = value ?? '';
            onChanged();
          },
        ),
        _Text(
          label: 'PIN code',
          hint: '441501',
          initial: draft.pincode,
          keyboard: TextInputType.number,
          maxLength: 6,
          digitsOnly: true,
          autofill: const [AutofillHints.postalCode],
          validator: Validators.pincode,
          onChanged: (value) => draft.pincode = value,
        ),
        _Text(
          label: 'Address',
          initial: draft.addressLine,
          autofill: const [AutofillHints.streetAddressLine1],
          onChanged: (value) => draft.addressLine = value,
        ),
      ];
}

/// A text field that keeps its own controller so moving between steps does
/// not reset what was typed, and writes straight into the draft.
class _Text extends StatefulWidget {
  final String label;
  final String? hint;
  final String? helper;
  final String initial;
  final TextInputType keyboard;
  final TextCapitalization capitalization;
  final int? maxLength;
  final bool digitsOnly;
  final List<String>? autofill;
  final String? Function(String?)? validator;
  final void Function(String) onChanged;

  const _Text({
    required this.label,
    required this.initial,
    required this.onChanged,
    this.hint,
    this.helper,
    this.keyboard = TextInputType.text,
    this.capitalization = TextCapitalization.none,
    this.maxLength,
    this.digitsOnly = false,
    this.autofill,
    this.validator,
  });

  @override
  State<_Text> createState() => _TextState();
}

class _TextState extends State<_Text> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: _controller,
        keyboardType: widget.keyboard,
        textCapitalization: widget.capitalization,
        textInputAction: TextInputAction.next,
        autofillHints: widget.autofill,
        maxLength: widget.maxLength,
        inputFormatters:
            widget.digitsOnly ? [FilteringTextInputFormatter.digitsOnly] : null,
        // Validated as the student leaves the field rather than only on
        // Continue, so a mistyped number is caught while the keyboard is
        // still open.
        autovalidateMode: AutovalidateMode.onUserInteraction,
        validator: widget.validator,
        onChanged: widget.onChanged,
        decoration: InputDecoration(
          labelText: widget.label,
          hintText: widget.hint,
          helperText: widget.helper,
          helperMaxLines: 3,
          counterText: '',
        ),
      ),
    );
  }
}

class _Dropdown extends StatelessWidget {
  final String label;
  final String? value;
  final List<DropdownMenuItem<String>> items;
  final String placeholder;
  final String? Function(String?)? validator;
  final void Function(String?) onChanged;

  const _Dropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.placeholder,
    required this.onChanged,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: DropdownButtonFormField<String>(
        initialValue: value,
        isExpanded: true,
        hint: Text(placeholder),
        items: items,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        validator: validator,
        onChanged: onChanged,
        decoration: InputDecoration(labelText: label),
      ),
    );
  }
}
