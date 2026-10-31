class Student {
  final String id;
  final String userId;
  final String fullName;
  final String email;
  final String? phone;
  final String? avatarUrl;
  final String? studentClass;
  final String? schoolName;
  final String? city;
  final String? state;
  final String? referralCode;
  final String? referredBy;
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
    this.schoolName,
    this.city,
    this.state,
    this.referralCode,
    this.referredBy,
    this.isActive = true,
    this.freeTrialExpiresAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      fullName: json['full_name'] as String,
      email: json['email'] as String? ?? '',
      phone: json['phone'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      studentClass: json['class'] as String?,
      schoolName: json['school_name'] as String?,
      city: json['city'] as String?,
      state: json['state'] as String?,
      referralCode: json['referral_code'] as String?,
      referredBy: json['referred_by'] as String?,
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
      'school_name': schoolName,
      'city': city,
      'state': state,
      'referral_code': referralCode,
      'referred_by': referredBy,
      'is_active': isActive,
      'free_trial_expires_at': freeTrialExpiresAt?.toIso8601String(),
    };
  }

  Student copyWith({
    String? fullName,
    String? phone,
    String? avatarUrl,
    String? studentClass,
    String? schoolName,
    String? city,
    String? state,
  }) {
    return Student(
      id: id,
      userId: userId,
      fullName: fullName ?? this.fullName,
      email: email,
      phone: phone ?? this.phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      studentClass: studentClass ?? this.studentClass,
      schoolName: schoolName ?? this.schoolName,
      city: city ?? this.city,
      state: state ?? this.state,
      referralCode: referralCode,
      referredBy: referredBy,
      isActive: isActive,
      freeTrialExpiresAt: freeTrialExpiresAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
