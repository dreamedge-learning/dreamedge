import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/certificate.dart';
import '../services/certificate_service.dart';
import 'student_provider.dart';
import 'supabase_provider.dart';

final certificateServiceProvider = Provider<CertificateService>((ref) {
  return CertificateService(ref.watch(supabaseClientProvider));
});

final certificatesProvider = FutureProvider<List<Certificate>>((ref) async {
  final student = await ref.watch(currentStudentProvider.future);
  if (student == null) return const [];
  return ref.watch(certificateServiceProvider).getCertificates(student.id);
});
