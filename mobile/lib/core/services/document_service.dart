import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../config/app_config.dart';
import '../models/lesson_file.dart';

/// A document the reader can open, and the terms it came with.
class DocumentSource {
  final String url;
  final String fileName;

  /// Which attachment the route served, when it says. Older deployments of
  /// the route do not, and the callers do not depend on it.
  final String? fileId;

  final bool isDownloadable;
  final int offlineLicenseDays;

  /// When the enrolment behind this document runs out, or null if it never
  /// does.
  ///
  /// The offline licence is capped by it, exactly as the video path caps
  /// against the same field. Without it a student with ten days of enrolment
  /// left downloaded every booklet and past paper and kept each for thirty.
  final DateTime? validUntil;

  /// The server's clock when it answered, which is what the licence is
  /// measured from. The device's clock belongs to the student.
  final DateTime serverNow;

  const DocumentSource({
    required this.url,
    required this.fileName,
    this.fileId,
    required this.isDownloadable,
    required this.offlineLicenseDays,
    this.validUntil,
    required this.serverNow,
  });
}

/// Why a document could not be opened.
enum DocumentFailure { notSignedIn, notEntitled, missing, unavailable }

class DocumentException implements Exception {
  final DocumentFailure failure;
  final String message;

  const DocumentException(this.failure, this.message);

  @override
  String toString() => message;
}

/// Gets a signed address for one document.
///
/// The bucket it lives in is private, so there is no URL to store: the
/// website's `/api/content/[id]/file` route checks the paywall and signs one
/// that expires in minutes. `?json=1` asks for the address rather than the
/// bytes, which is what lets a download resume against it with a Range header
/// instead of re-following a redirect.
class DocumentService {
  final SupabaseClient _client;
  final Dio _dio;

  DocumentService(this._client, Dio dio) : _dio = dio;

  /// [deviceId] is sent when the caller is about to keep a copy, so the route
  /// can record a `content_downloads` row against this device. Reading a
  /// document inline leaves nothing behind and sends none.
  Future<DocumentSource> getSource(
    String contentItemId, {
    String? fileId,
    String? deviceId,
  }) async {
    final token = _client.auth.currentSession?.accessToken;
    if (token == null) {
      throw const DocumentException(
        DocumentFailure.notSignedIn,
        'Please sign in again to open this file.',
      );
    }

    final query = {
      'json': '1',
      if (fileId != null) 'f': fileId,
      if (deviceId != null) 'device': deviceId,
    };
    final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/content/$contentItemId/file')
        .replace(queryParameters: query);

    final response = await _dio.getUri<Map<String, dynamic>>(
      uri,
      options: Options(
        headers: {'Authorization': 'Bearer $token'},
        responseType: ResponseType.json,
        // The route answers 401, 403 and 404 with a reason worth relaying, so
        // they are read rather than thrown.
        validateStatus: (_) => true,
      ),
    );

    if (response.statusCode == 200) {
      final body = response.data;
      if (body != null && body['url'] is String) {
        final rawValidUntil = body['validUntil'] as String?;
        final rawServerNow = body['serverNow'] as String?;
        final serverNow = rawServerNow == null
            ? null
            : DateTime.tryParse(rawServerNow);

        // A missing or unparseable server clock has to fail here. The earlier
        // shape fell back to DateTime.now(), which turned the whole
        // clock-tampering defence into a device-side setting whenever a stale
        // deployment forgot the field. Fail the open rather than anchor a
        // licence against the handset's clock.
        if (serverNow == null) {
          throw const DocumentException(
            DocumentFailure.unavailable,
            'This file is temporarily unavailable.',
          );
        }

        return DocumentSource(
          url: body['url'] as String,
          fileName: body['fileName'] as String? ?? 'Document',
          fileId: body['fileId'] as String?,
          isDownloadable: body['isDownloadable'] as bool? ?? false,
          offlineLicenseDays:
              (body['offlineLicenseDays'] as num?)?.toInt() ?? 30,
          validUntil: rawValidUntil == null
              ? null
              : DateTime.tryParse(rawValidUntil)?.toUtc(),
          serverNow: serverNow.toUtc(),
        );
      }
      throw const DocumentException(
        DocumentFailure.unavailable,
        'This file is temporarily unavailable.',
      );
    }

    throw _describe(response.statusCode ?? 0);
  }

  /// Every attachment on a lesson that a student may have, in the admin's
  /// order.
  ///
  /// Read straight from `content_files`: row security already hides the
  /// teachers-only originals and anything on a lesson the student cannot see,
  /// and the filter here says the same thing again so the app never depends
  /// on one of the two alone. Listing a file is not opening it -- the signed
  /// address for each still comes from [getSource], behind the paywall check.
  ///
  /// Throws [DocumentException] when the list cannot be fetched, because an
  /// empty answer would be read as "this lesson has no attachments".
  Future<List<LessonFile>> listFiles(String contentItemId) async {
    try {
      final rows = await _client
          .from('content_files')
          .select('id, display_name, size_bytes, storage_path, mime_type, weight')
          .eq('content_item_id', contentItemId)
          .eq('is_source_document', false)
          .order('weight', ascending: true)
          .order('created_at', ascending: true);

      return [
        for (final row in rows) LessonFile.fromJson(Map<String, dynamic>.from(row)),
      ];
    } on Exception {
      // A refused query, no connection, a timeout: all the same to the
      // student, and all worth a retry.
      throw const DocumentException(
        DocumentFailure.unavailable,
        'Could not load the files for this lesson.',
      );
    }
  }

  DocumentException _describe(int status) {
    switch (status) {
      case 401:
        return const DocumentException(
          DocumentFailure.notSignedIn,
          'Please sign in again to open this file.',
        );
      case 403:
        return const DocumentException(
          DocumentFailure.notEntitled,
          'Enrol in this course to open this file.',
        );
      case 404:
        return const DocumentException(
          DocumentFailure.missing,
          'This lesson has no file attached.',
        );
      default:
        return const DocumentException(
          DocumentFailure.unavailable,
          'This file is temporarily unavailable.',
        );
    }
  }
}
