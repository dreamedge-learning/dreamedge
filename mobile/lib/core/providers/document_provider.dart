import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/document_service.dart';
import 'supabase_provider.dart';

/// One Dio for the app.
///
/// Shared so that connection pooling and the download queue's concurrency
/// limit actually mean something: a new client per request would open a new
/// socket per request, which on a weak mobile connection is the slowest part
/// of a small fetch.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 60),
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

final documentServiceProvider = Provider<DocumentService>((ref) {
  return DocumentService(
    ref.watch(supabaseClientProvider),
    ref.watch(dioProvider),
  );
});
