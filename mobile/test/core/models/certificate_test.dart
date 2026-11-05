import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/certificate.dart';

void main() {
  group('CertificateStatus.parse', () {
    test('reads every status the database writes', () {
      expect(CertificateStatus.parse('pending'), CertificateStatus.pending);
      expect(CertificateStatus.parse('issued'), CertificateStatus.issued);
      expect(CertificateStatus.parse('rejected'), CertificateStatus.rejected);
      expect(CertificateStatus.parse('revoked'), CertificateStatus.revoked);
    });

    test('treats anything unknown as not ready rather than issued', () {
      expect(CertificateStatus.parse('archived'), CertificateStatus.pending);
      expect(CertificateStatus.parse(null), CertificateStatus.pending);
    });

    test('sorts issued first and revoked last', () {
      final sorted = [...CertificateStatus.values]
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      expect(sorted.first, CertificateStatus.issued);
      expect(sorted.last, CertificateStatus.revoked);
    });
  });

  group('Certificate.fromJson', () {
    final issuedJson = {
      'id': 'cert-001',
      'status': 'issued',
      'certificate_number': 'DE-CERT-2026-000123',
      'verification_code': '7KQ2M9XD4TRP',
      'requested_at': '2026-11-01T10:00:00Z',
      'issued_at': '2026-11-03T12:30:00Z',
      'rejected_reason': null,
      'revoked_at': null,
      'course_title': 'Class 8 Maths — Foundation Course',
      'courses': {'title': 'Class 8 Maths (renamed later)'},
    };

    test('parses an issued certificate', () {
      final certificate = Certificate.fromJson(issuedJson);

      expect(certificate.id, 'cert-001');
      expect(certificate.status, CertificateStatus.issued);
      expect(certificate.isIssued, isTrue);
      expect(certificate.certificateNumber, 'DE-CERT-2026-000123');
      expect(certificate.requestedAt, DateTime.parse('2026-11-01T10:00:00Z'));
      expect(certificate.issuedAt, DateTime.parse('2026-11-03T12:30:00Z'));
      expect(certificate.revokedAt, isNull);
    });

    test('prefers the title frozen on the certificate', () {
      final certificate = Certificate.fromJson(issuedJson);
      expect(certificate.courseTitle, 'Class 8 Maths — Foundation Course');
    });

    test('falls back to the course title while still pending', () {
      final certificate = Certificate.fromJson({
        'id': 'cert-002',
        'status': 'pending',
        'certificate_number': null,
        'verification_code': 'ABCDEFGHJKLM',
        'requested_at': '2026-11-04T08:00:00Z',
        'course_title': null,
        'courses': [
          {'title': 'Class 9 Science'},
        ],
      });

      expect(certificate.status, CertificateStatus.pending);
      expect(certificate.isIssued, isFalse);
      expect(certificate.courseTitle, 'Class 9 Science');
      expect(certificate.certificateNumber, isNull);
      expect(certificate.issuedAt, isNull);
    });

    test('carries the reason a request was turned down', () {
      final certificate = Certificate.fromJson({
        'id': 'cert-003',
        'status': 'rejected',
        'verification_code': 'ABCDEFGHJKLM',
        'requested_at': '2026-11-04T08:00:00Z',
        'rejected_reason': 'Please finish the chapter tests first.',
      });

      expect(certificate.status, CertificateStatus.rejected);
      expect(certificate.rejectedReason, 'Please finish the chapter tests first.');
      expect(certificate.courseTitle, 'Course');
    });
  });

  group('Certificate links', () {
    Certificate withCode(String code) => Certificate.fromJson({
          'id': 'cert-004',
          'status': 'issued',
          'verification_code': code,
          'requested_at': '2026-11-01T10:00:00Z',
          'issued_at': '2026-11-02T10:00:00Z',
        });

    test('formats the code in groups of four, as printed', () {
      expect(withCode('7KQ2M9XD4TRP').formattedCode, '7KQ2-M9XD-4TRP');
    });

    test('normalises a code that arrives lower case or already dashed', () {
      expect(withCode('7kq2-m9xd-4trp').formattedCode, '7KQ2-M9XD-4TRP');
    });

    test('builds the public page URL on the website', () {
      final certificate = withCode('7KQ2M9XD4TRP');

      expect(
        certificate.pageUri('https://www.dreamedgelearning.com').toString(),
        'https://www.dreamedgelearning.com/certificate/7KQ2-M9XD-4TRP',
      );
      expect(
        certificate.pageUri('https://www.dreamedgelearning.com/').toString(),
        'https://www.dreamedgelearning.com/certificate/7KQ2-M9XD-4TRP',
      );
    });
  });
}
