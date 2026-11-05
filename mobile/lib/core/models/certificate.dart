import 'package:intl/intl.dart';

/// Where a course certificate stands.
///
/// The database files a `pending` request on its own when the last lesson of
/// a course is completed; an admin then issues it or turns it down. `revoked`
/// is an issued certificate the centre has since withdrawn.
enum CertificateStatus {
  pending,
  issued,
  rejected,
  revoked;

  /// Unknown values read as pending rather than throwing: a status added on
  /// the server later should show as "not ready yet" in an older app, never
  /// as a certificate the student can share.
  static CertificateStatus parse(String? value) {
    for (final status in CertificateStatus.values) {
      if (status.name == value) return status;
    }
    return CertificateStatus.pending;
  }

  String get label {
    switch (this) {
      case CertificateStatus.pending:
        return 'Awaiting approval';
      case CertificateStatus.issued:
        return 'Issued';
      case CertificateStatus.rejected:
        return 'Not approved';
      case CertificateStatus.revoked:
        return 'Revoked';
    }
  }

  /// Issued first, then the ones still with the centre, then the rest.
  int get sortOrder {
    switch (this) {
      case CertificateStatus.issued:
        return 0;
      case CertificateStatus.pending:
        return 1;
      case CertificateStatus.rejected:
        return 2;
      case CertificateStatus.revoked:
        return 3;
    }
  }
}

/// One row of `certificates`, as the signed-in student may read it.
class Certificate {
  final String id;
  final CertificateStatus status;
  final String courseTitle;
  final String? certificateNumber;
  final String verificationCode;
  final DateTime requestedAt;
  final DateTime? issuedAt;
  final String? rejectedReason;
  final DateTime? revokedAt;

  const Certificate({
    required this.id,
    required this.status,
    required this.courseTitle,
    this.certificateNumber,
    required this.verificationCode,
    required this.requestedAt,
    this.issuedAt,
    this.rejectedReason,
    this.revokedAt,
  });

  /// Builds from a `certificates` row with `courses(title)` embedded.
  ///
  /// The title frozen on the certificate wins over the course's current one:
  /// once issued, the certificate says what it said on the day, and the list
  /// should match what the student will see when they open it.
  factory Certificate.fromJson(Map<String, dynamic> json) {
    final rawCourse = json['courses'];
    Map<String, dynamic>? course;
    if (rawCourse is Map) {
      course = Map<String, dynamic>.from(rawCourse);
    } else if (rawCourse is List && rawCourse.isNotEmpty && rawCourse.first is Map) {
      course = Map<String, dynamic>.from(rawCourse.first as Map);
    }

    return Certificate(
      id: json['id'] as String,
      status: CertificateStatus.parse(json['status'] as String?),
      courseTitle: (json['course_title'] as String?) ??
          (course?['title'] as String?) ??
          'Course',
      certificateNumber: json['certificate_number'] as String?,
      verificationCode: json['verification_code'] as String,
      requestedAt: DateTime.parse(json['requested_at'] as String),
      issuedAt: _date(json['issued_at']),
      rejectedReason: json['rejected_reason'] as String?,
      revokedAt: _date(json['revoked_at']),
    );
  }

  static DateTime? _date(Object? value) =>
      value is String ? DateTime.tryParse(value) : null;

  bool get isIssued => status == CertificateStatus.issued;

  /// `7KQ2M9XD4TRP` as printed: `7KQ2-M9XD-4TRP`.
  String get formattedCode {
    final clean =
        verificationCode.replaceAll(RegExp('[^0-9A-Za-z]'), '').toUpperCase();
    final groups = <String>[];
    for (var start = 0; start < clean.length; start += 4) {
      final end = start + 4 > clean.length ? clean.length : start + 4;
      groups.add(clean.substring(start, end));
    }
    return groups.join('-');
  }

  /// The public certificate page on the website. It needs no sign-in, so the
  /// app can hand it straight to the browser.
  Uri pageUri(String siteBaseUrl) {
    final base = siteBaseUrl.endsWith('/')
        ? siteBaseUrl.substring(0, siteBaseUrl.length - 1)
        : siteBaseUrl;
    return Uri.parse('$base/certificate/$formattedCode');
  }

  /// "5 Nov 2026" for the date that matters in this state.
  String get displayDate {
    final date = switch (status) {
      CertificateStatus.issued => issuedAt ?? requestedAt,
      CertificateStatus.revoked => revokedAt ?? issuedAt ?? requestedAt,
      _ => requestedAt,
    };
    return DateFormat('d MMM yyyy').format(date.toLocal());
  }
}
