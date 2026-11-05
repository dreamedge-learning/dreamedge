import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config/app_config.dart';
import '../providers/document_provider.dart';
import '../providers/supabase_provider.dart';

/// Why a receipt could not be opened, in words worth showing.
class ReceiptUnavailable implements Exception {
  final String message;
  const ReceiptUnavailable(this.message);

  @override
  String toString() => message;
}

/// Gets a link to one of the student's receipts.
///
/// The receipt is a page on the website, and the browser the app opens it in
/// is not signed in. So the app asks the website for a link instead: the
/// route checks the order belongs to this student and hands back the address
/// with a signature that lasts fifteen minutes. A link that leaks opens one
/// receipt, briefly, and nothing else.
class ReceiptService {
  ReceiptService(this._client, this._dio);

  final SupabaseClient _client;
  final Dio _dio;

  Future<Uri> linkFor(String orderId) async {
    final token = _client.auth.currentSession?.accessToken;
    if (token == null) {
      throw const ReceiptUnavailable('Please sign in again to see this receipt.');
    }

    final Response<Map<String, dynamic>> response;
    try {
      response = await _dio.getUri<Map<String, dynamic>>(
        Uri.parse('${AppConfig.apiBaseUrl}/api/receipts/$orderId/link'),
        options: Options(
          headers: {'Authorization': 'Bearer $token'},
          responseType: ResponseType.json,
          validateStatus: (_) => true,
        ),
      );
    } on DioException {
      throw const ReceiptUnavailable(
        'Could not reach the server. Check your connection and try again.',
      );
    }

    final url = response.data?['url'];
    if (response.statusCode == 200 && url is String) {
      final uri = Uri.tryParse(url);
      if (uri != null && uri.hasScheme) return uri;
    }

    switch (response.statusCode) {
      case 401:
        throw const ReceiptUnavailable('Please sign in again to see this receipt.');
      case 409:
        throw const ReceiptUnavailable(
          'The receipt is issued once the payment completes.',
        );
      default:
        throw const ReceiptUnavailable('This receipt is not available right now.');
    }
  }
}

final receiptServiceProvider = Provider<ReceiptService>((ref) {
  return ReceiptService(
    ref.watch(supabaseClientProvider),
    ref.watch(dioProvider),
  );
});
