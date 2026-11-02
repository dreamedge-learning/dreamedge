class Validators {
  Validators._();

  static String? email(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Email is required';
    }
    final emailRegex = RegExp(
      r'^[a-zA-Z0-9.!#$%&*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$',
    );
    if (!emailRegex.hasMatch(value.trim())) {
      return 'Enter a valid email address';
    }
    return null;
  }

  static String? password(String? value) {
    if (value == null || value.isEmpty) {
      return 'Password is required';
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  }

  static String? confirmPassword(String? value, String password) {
    if (value == null || value.isEmpty) {
      return 'Please confirm your password';
    }
    if (value != password) {
      return 'Passwords do not match';
    }
    return null;
  }

  static String? name(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Name is required';
    }
    if (value.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    return null;
  }

  static String? phone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null; // Phone is optional
    }
    final phoneRegex = RegExp(r'^[6-9]\d{9}$');
    if (!phoneRegex.hasMatch(value.trim())) {
      return 'Enter a valid 10-digit phone number';
    }
    return null;
  }

  static String? required(String? value, [String fieldName = 'This field']) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required';
    }
    return null;
  }

  /// A mobile number that must be there.
  ///
  /// The parent's or guardian's number, chiefly: plenty of Class 6 students
  /// have no phone of their own, so it is the one number the centre can
  /// actually reach a family on. Deliberately not compared against the
  /// student's own number -- in many families they are the same.
  static String? requiredPhone(String? value, [String fieldName = 'Mobile number']) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required';
    }
    return phone(value);
  }

  /// Six digits, never starting at zero: the shape India Post uses.
  static String? pincode(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }
    if (!RegExp(r'^[1-9][0-9]{5}$').hasMatch(value.trim())) {
      return 'A PIN code is six digits and does not start with zero';
    }
    return null;
  }

  /// A date of birth that could belong to a school student.
  ///
  /// The window is wide on purpose -- a repeating Class 10 student and an
  /// exceptionally young Class 6 student both have to get through -- but a
  /// fat-fingered year is worth catching here rather than on a certificate
  /// three months later.
  static String? dateOfBirth(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }

    final parsed = DateTime.tryParse(value.trim());
    if (parsed == null) {
      return 'Enter the date as YYYY-MM-DD';
    }

    final years = DateTime.now().difference(parsed).inDays / 365.25;
    if (years < 5 || years > 30) {
      return 'Enter a date of birth between 5 and 30 years ago';
    }
    return null;
  }
}
