import '../models/student.dart';

/// The mandatory profile, in the four steps the form asks for them.
///
/// Field order matches the website's onboarding form and the printed sheet
/// handed across the counter at Kalmeshwar, deliberately: when all three
/// agree, an admin copying from paper can type without looking up what maps
/// to what.
enum ProfileStep { student, academics, contact, location }

const profileSteps = ProfileStep.values;

extension ProfileStepDetails on ProfileStep {
  String get title => switch (this) {
        ProfileStep.student => 'About you',
        ProfileStep.academics => 'Your school',
        ProfileStep.contact => 'How we reach you',
        ProfileStep.location => 'Where you are',
      };

  String get blurb => switch (this) {
        ProfileStep.student => 'The name that should appear on your certificates.',
        ProfileStep.academics =>
          'So your course list matches what you are studying this year.',
        ProfileStep.contact =>
          "A parent or guardian's number is required — we use it for fee and class updates.",
        ProfileStep.location => 'Helps us plan centres and offline test venues.',
      };
}

/// What the form holds while it is being filled in.
///
/// Mutable and flat on purpose: every field is a text value on the way to a
/// `students` column, and the step that was just left is written as-is.
class StudentProfileDraft {
  String fullName;
  String dateOfBirth;
  String gender;
  String studentClass;
  String board;
  String schoolName;
  String phone;
  String parentName;
  String parentPhone;
  String email;
  String city;
  String state;
  String pincode;
  String addressLine;

  StudentProfileDraft({
    this.fullName = '',
    this.dateOfBirth = '',
    this.gender = '',
    this.studentClass = '',
    this.board = '',
    this.schoolName = '',
    this.phone = '',
    this.parentName = '',
    this.parentPhone = '',
    this.email = '',
    this.city = '',
    this.state = '',
    this.pincode = '',
    this.addressLine = '',
  });

  /// Prefilled from what we already know, which for a Google sign-in is a
  /// name and an address and nothing else.
  factory StudentProfileDraft.fromStudent(Student student) {
    return StudentProfileDraft(
      // "Student" is the placeholder the phone-OTP path writes; it is not a
      // name anyone chose, so the field should start empty.
      fullName: student.fullName == 'Student' ? '' : student.fullName,
      dateOfBirth: student.dateOfBirth == null
          ? ''
          : student.dateOfBirth!.toIso8601String().split('T').first,
      gender: student.gender ?? '',
      studentClass: student.studentClass ?? '',
      board: student.board ?? '',
      schoolName: student.schoolName ?? '',
      phone: _tenDigits(student.phone),
      parentName: student.parentName ?? '',
      parentPhone: _tenDigits(student.parentPhone),
      email: student.hasRealEmail ? student.email : '',
      city: student.city ?? '',
      state: student.state ?? '',
      pincode: student.pincode ?? '',
      addressLine: student.addressLine ?? '',
    );
  }

  /// The ten digits a student recognises, not the +91 form the column holds.
  static String _tenDigits(String? stored) {
    if (stored == null) return '';
    final digits = stored.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 12 && digits.startsWith('91')) {
      return digits.substring(2);
    }
    return digits.length == 10 ? digits : '';
  }

  /// The columns one step owns, as the database names them.
  Map<String, dynamic> columnsFor(ProfileStep step) => switch (step) {
        ProfileStep.student => {
            'full_name': fullName.trim(),
            'date_of_birth': _orNull(dateOfBirth),
            'gender': _orNull(gender),
          },
        ProfileStep.academics => {
            'class': _orNull(studentClass),
            'board': _orNull(board),
            'school_name': _orNull(schoolName),
          },
        ProfileStep.contact => {
            'phone': _phoneOrNull(phone),
            'parent_name': _orNull(parentName),
            'parent_phone': _phoneOrNull(parentPhone),
          },
        ProfileStep.location => {
            'city': _orNull(city),
            'state': _orNull(state),
            'pincode': _orNull(pincode),
            'address_line': _orNull(addressLine),
          },
      };

  /// Everything, for the single call that opens the gate.
  Map<String, dynamic> toProfilePayload() => {
        'full_name': fullName.trim(),
        'date_of_birth': _orNull(dateOfBirth),
        'gender': _orNull(gender),
        'class': _orNull(studentClass),
        'board': _orNull(board),
        'school_name': _orNull(schoolName),
        'phone': _phoneOrNull(phone),
        'parent_name': _orNull(parentName),
        'parent_phone': _phoneOrNull(parentPhone),
        if (email.trim().isNotEmpty) 'email': email.trim().toLowerCase(),
        'city': _orNull(city),
        'state': _orNull(state),
        'pincode': _orNull(pincode),
        'address_line': _orNull(addressLine),
      };

  static String? _orNull(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  /// E.164, which is the form Supabase auth and the admin's search key on.
  static String? _phoneOrNull(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) return '+91$digits';
    if (digits.length == 12 && digits.startsWith('91')) {
      return '+$digits';
    }
    return null;
  }
}
