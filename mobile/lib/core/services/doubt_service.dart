import 'dart:math';
import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../logging/app_log.dart';
import '../models/doubt.dart';

/// A photo the student picked, ready to upload.
class DoubtPhoto {
  final Uint8List bytes;

  /// Lowercase, without the dot. Decides the content type the bucket sees.
  final String extension;

  const DoubtPhoto({required this.bytes, required this.extension});

  /// The bucket accepts these three and nothing else.
  String get contentType {
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  /// Normalised so a `.jpeg` or an unrecognised name is stored as `.jpg`,
  /// which the database's attach check accepts.
  String get storedExtension {
    switch (extension) {
      case 'png':
      case 'webp':
        return extension;
      default:
        return 'jpg';
    }
  }

  /// From a picked file's name, e.g. `IMG_2041.PNG`.
  static String extensionOf(String fileName) {
    final dot = fileName.lastIndexOf('.');
    if (dot < 0 || dot == fileName.length - 1) return 'jpg';
    return fileName.substring(dot + 1).toLowerCase();
  }
}

/// A refusal worded for the student.
class DoubtException implements Exception {
  final String message;

  const DoubtException(this.message);

  @override
  String toString() => message;
}

/// Reads and writes the signed-in student's doubts.
///
/// Everything here runs with the student's own token, so the database decides
/// what is allowed: which lessons they may ask about, how often, and which
/// photos they may attach. This class only shapes the requests and turns a
/// refusal into a sentence.
class DoubtService {
  final SupabaseClient _client;

  DoubtService(this._client);

  static const String bucket = 'doubt-images';

  /// Mirrors the website and the bucket's own limit.
  static const int maxImageBytes = 5 * 1024 * 1024;

  /// Signed photo links last long enough to read a thread, not to share one.
  static const int imageUrlSeconds = 10 * 60;

  static const String _columns =
      'id, content_item_id, status, body, image_path, created_at, updated_at, '
      'content_item:content_items(title), course:courses(title), '
      'doubt_replies(id, author_kind, author_name, body, image_path, '
      'created_at)';

  /// Resolves `students.id` for the signed-in user.
  ///
  /// Every read filters on it as well as relying on RLS: an account that is
  /// both a student and a teacher can read every doubt, and the app is only
  /// ever showing the student's own.
  Future<String> _studentId() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw const DoubtException('Please sign in again to continue.');
    }

    final row = await _client
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

    final id = row?['id'] as String?;
    if (id == null) {
      throw const DoubtException('Your student account could not be found.');
    }
    return id;
  }

  Future<List<Doubt>> myDoubts() async {
    final studentId = await _studentId();
    final rows = await _client
        .from('doubts')
        .select(_columns)
        .eq('student_id', studentId)
        .order('updated_at', ascending: false)
        .limit(100);
    return _parse(rows);
  }

  Future<List<Doubt>> forLesson(String contentItemId) async {
    final studentId = await _studentId();
    final rows = await _client
        .from('doubts')
        .select(_columns)
        .eq('student_id', studentId)
        .eq('content_item_id', contentItemId)
        .order('created_at', ascending: false);
    return _parse(rows);
  }

  Future<Doubt?> thread(String doubtId) async {
    final studentId = await _studentId();
    final row = await _client
        .from('doubts')
        .select(_columns)
        .eq('student_id', studentId)
        .eq('id', doubtId)
        .maybeSingle();
    return row == null ? null : Doubt.fromJson(row);
  }

  /// Asks a new doubt. The database fills in whose it is and which course it
  /// belongs to; the app sends only the lesson, the text and the photo.
  Future<String> ask({
    required String contentItemId,
    required String body,
    DoubtPhoto? photo,
  }) async {
    final imagePath = photo == null ? null : await _upload(photo);

    try {
      final row = await _client
          .from('doubts')
          .insert({
            'content_item_id': contentItemId,
            'body': body.trim(),
            'image_path': imagePath,
          })
          .select('id')
          .single();
      return row['id'] as String;
    } on PostgrestException catch (e) {
      await _discard(imagePath);
      throw DoubtException(describeDoubtError(e.code, e.message));
    }
  }

  /// A follow-up on one of the student's own doubts.
  Future<void> reply({
    required String doubtId,
    required String body,
    DoubtPhoto? photo,
  }) async {
    final imagePath = photo == null ? null : await _upload(photo);

    try {
      await _client.from('doubt_replies').insert({
        'doubt_id': doubtId,
        'body': body.trim(),
        'image_path': imagePath,
      });
    } on PostgrestException catch (e) {
      await _discard(imagePath);
      throw DoubtException(describeDoubtError(e.code, e.message));
    }
  }

  /// A short-lived address for one photo, or null when the student may not
  /// see it (the storage policy decides) or it has gone.
  Future<String?> imageUrl(String path) async {
    try {
      return await _client.storage
          .from(bucket)
          .createSignedUrl(path, imageUrlSeconds);
    } on StorageException catch (e) {
      logDebug('doubts', 'Signing a doubt photo failed: ${e.statusCode}');
      return null;
    }
  }

  /// Uploads into the student's own folder, which is the only place the
  /// bucket lets them write and the only prefix the database will attach.
  Future<String> _upload(DoubtPhoto photo) async {
    if (photo.bytes.length > maxImageBytes) {
      throw const DoubtException(
        'That photo is too large. Please choose one under 5 MB.',
      );
    }

    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw const DoubtException('Please sign in again to continue.');
    }

    final path = '$userId/${_randomName()}.${photo.storedExtension}';
    try {
      await _client.storage.from(bucket).uploadBinary(
            path,
            photo.bytes,
            fileOptions: FileOptions(
              contentType: photo.contentType,
              upsert: false,
            ),
          );
      return path;
    } on StorageException catch (e) {
      logDebug('doubts', 'Uploading a doubt photo failed: ${e.statusCode}');
      throw const DoubtException(
        'The photo could not be uploaded. Please try again.',
      );
    }
  }

  /// Takes back a photo whose doubt was refused, so a retry does not leave a
  /// stray file behind. Best effort: the bucket only allows removing an
  /// unattached upload, and a failure costs a few hundred kilobytes.
  Future<void> _discard(String? path) async {
    if (path == null) return;
    try {
      await _client.storage.from(bucket).remove([path]);
    } on StorageException catch (e) {
      logDebug('doubts', 'Removing an unattached photo failed: ${e.statusCode}');
    }
  }

  List<Doubt> _parse(List<Map<String, dynamic>> rows) =>
      rows.map(Doubt.fromJson).toList();

  /// 32 hex characters. Nothing about the student or the doubt is readable
  /// from an object's name.
  static String _randomName() {
    final random = Random.secure();
    final buffer = StringBuffer();
    for (var i = 0; i < 16; i++) {
      buffer.write(random.nextInt(256).toRadixString(16).padLeft(2, '0'));
    }
    return buffer.toString();
  }
}

/// Turns a database refusal into a sentence for the student.
///
/// The doubt triggers already word their refusals for a person (a rate limit,
/// a closed doubt, a photo that is not theirs), so those pass through. An RLS
/// refusal is worded for developers, and the only way a student meets one is
/// by asking about a lesson they no longer have.
String describeDoubtError(String? code, String? message) {
  final text = message ?? '';
  switch (code) {
    case 'PT429':
    case '22023':
    case 'P0002':
      return text.isNotEmpty ? text : 'Something went wrong. Please try again.';
    case '42501':
      if (text.isNotEmpty && !text.contains('row-level security')) return text;
      return 'You can only ask about lessons in a course you are enrolled in.';
    case '23514':
      return 'Please write a little more so your teacher understands the '
          'question.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
