class Student {
  final String id;
  final String userId;
  final String fullName;
  final String email;
  final String? phone;
  final String? avatarUrl;
  final String? studentClass;
  final String? board;
  final String? schoolName;
  final String? city;
  final String? state;
  final String? pincode;
  final String? addressLine;
  final DateTime? dateOfBirth;
  final String? gender;
  final String? parentName;
  final String? parentPhone;
  final String? referralCode;
  final String? referredBy;

  /// Printed on receipts at the Kalmeshwar centre. Assigned by a trigger on
  /// insert, so null only on a row written before that trigger existed.
  final String? studentCode;

  /// The gate. False until the profile form has been finished, and the app
  /// refuses to show anything but that form while it is.
  final bool profileCompleted;

  /// Where the record came from: `self_online`, `admin_offline`,
  /// `admin_import`.
  final String registrationSource;

  final bool isActive;
  final DateTime? freeTrialExpiresAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  Student({
    required this.id,
    required this.userId,
    required this.fullName,
    required this.email,
    this.phone,
    this.avatarUrl,
    this.studentClass,
    this.board,
    this.schoolName,
    this.city,
    this.state,
    this.pincode,
    this.addressLine,
    this.dateOfBirth,
    this.gender,
    this.parentName,
    this.parentPhone,
    this.referralCode,
    this.referredBy,
    this.studentCode,
    this.profileCompleted = false,
    this.registrationSource = 'self_online',
    this.isActive = true,
    this.freeTrialExpiresAt,
    required this.createdAt,
    required this.updatedAt,
  });

  /// True for an address the platform invented for a student who has none.
  ///
  /// `students.email` is NOT NULL, and a phone-OTP sign-in gives us no
  /// address, so one is synthesised on a domain we own. Showing it to the
  /// student as their email would be a lie.
  bool get hasRealEmail =>
      email.isNotEmpty &&
      !email.endsWith('@phone.dreamedge.local') &&
      !email.endsWith('@user.dreamedge.local');

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      fullName: json['full_name'] as String,
      email: json['email'] as String? ?? '',
      phone: json['phone'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      studentClass: json['class'] as String?,
      board: json['board'] as String?,
      schoolName: json['school_name'] as String?,
      city: json['city'] as String?,
      state: json['state'] as String?,
      pincode: json['pincode'] as String?,
      addressLine: json['address_line'] as String?,
      dateOfBirth: json['date_of_birth'] != null
          ? DateTime.tryParse(json['date_of_birth'] as String)
          : null,
      gender: json['gender'] as String?,
      parentName: json['parent_name'] as String?,
      parentPhone: json['parent_phone'] as String?,
      referralCode: json['referral_code'] as String?,
      referredBy: json['referred_by'] as String?,
      studentCode: json['student_code'] as String?,
      // Absent rather than false would let a student past the gate, so an
      // unexpected shape has to read as "not finished".
      profileCompleted: json['profile_completed'] as bool? ?? false,
      registrationSource:
          json['registration_source'] as String? ?? 'self_online',
      // Live column is `status` (student_status), not `is_active`.
      isActive: json['is_active'] as bool? ??
          (json['status'] as String? ?? 'active') == 'active',
      freeTrialExpiresAt: json['free_trial_expires_at'] != null
          ? DateTime.parse(json['free_trial_expires_at'] as String)
          : null,
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? '') ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'full_name': fullName,
      'email': email,
      'phone': phone,
      'avatar_url': avatarUrl,
      'class': studentClass,
      'board': board,
      'school_name': schoolName,
      'city': city,
      'state': state,
      'pincode': pincode,
      'address_line': addressLine,
      'date_of_birth': dateOfBirth?.toIso8601String().split('T').first,
      'gender': gender,
      'parent_name': parentName,
      'parent_phone': parentPhone,
      'referral_code': referralCode,
      'referred_by': referredBy,
      'student_code': studentCode,
      'profile_completed': profileCompleted,
      'registration_source': registrationSource,
      'is_active': isActive,
      'free_trial_expires_at': freeTrialExpiresAt?.toIso8601String(),
    };
  }

  Student copyWith({
    String? fullName,
    String? phone,
    String? avatarUrl,
    String? studentClass,
    String? board,
    String? schoolName,
    String? city,
    String? state,
    String? pincode,
    String? addressLine,
    DateTime? dateOfBirth,
    String? gender,
    String? parentName,
    String? parentPhone,
    bool? profileCompleted,
  }) {
    return Student(
      id: id,
      userId: userId,
      fullName: fullName ?? this.fullName,
      email: email,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      studentClass: studentClass ?? this.studentClass,
      board: board ?? this.board,
      schoolName: schoolName ?? this.schoolName,
      city: city ?? this.city,
      state: state ?? this.state,
      pincode: pincode ?? this.pincode,
      addressLine: addressLine ?? this.addressLine,
      dateOfBirth: dateOfBirth ?? this.dateOfBirth,
      gender: gender ?? this.gender,
      parentName: parentName ?? this.parentName,
      parentPhone: parentPhone ?? this.parentPhone,
      referralCode: referralCode,
      referredBy: referredBy,
      studentCode: studentCode,
      profileCompleted: profileCompleted ?? this.profileCompleted,
      registrationSource: registrationSource,
      isActive: isActive,
      freeTrialExpiresAt: freeTrialExpiresAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
