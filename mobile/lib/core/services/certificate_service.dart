import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/certificate.dart';

/// Reads the signed-in student's certificates.
///
/// Read-only by design: requests are filed by the database when a course is
/// completed, and only an admin can issue one, so there is nothing here for
/// the app to write. Row security limits the rows to the student's own.
class CertificateService {
  final SupabaseClient _client;
  CertificateService(this._client);

  Future<List<Certificate>> getCertificates(String studentId) async {
    final data = await _client
        .from('certificates')
        .select(
          'id, status, certificate_number, verification_code, requested_at, '
          'issued_at, rejected_reason, revoked_at, course_title, '
          'courses(title)',
        )
        .eq('student_id', studentId)
        .order('requested_at', ascending: false);

    final certificates = (data as List)
        .map((row) => Certificate.fromJson(row as Map<String, dynamic>))
        .toList();

    certificates.sort((a, b) {
      final byStatus = a.status.sortOrder.compareTo(b.status.sortOrder);
      if (byStatus != 0) return byStatus;
      return b.requestedAt.compareTo(a.requestedAt);
    });

    return certificates;
  }
}
