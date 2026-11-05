import 'dart:io';

import 'package:path/path.dart' as p;

/// Where downloaded files live, and how they are removed.
///
/// Every file saved for a lesson goes in `<support>/offline/<contentItemId>/`:
/// the video or main document, and since lessons can carry several
/// attachments, each of those beside it. Removing a lesson then means removing
/// one folder, and nothing that belonged to it can be left behind by a list
/// that forgot an entry.
abstract final class OfflinePaths {
  static const String root = 'offline';

  /// The lesson's folder under [base], the app's private support directory.
  static String lessonFolder(String base, String contentItemId) =>
      p.join(base, root, contentItemId);

  /// Where one attachment is saved.
  ///
  /// Derived from the file's id rather than random, so an interrupted
  /// download finds its own partial file again and resumes it. The id is an
  /// opaque UUID, so the name still says nothing about what was bought.
  static String attachmentPath(
    String base,
    String contentItemId,
    String fileId,
    String extension,
  ) {
    final stem = fileId.replaceAll('-', '');
    final short = stem.length > 12 ? stem.substring(0, 12) : stem;
    final ext = extension.isEmpty ? 'bin' : extension;
    return p.join(lessonFolder(base, contentItemId), 'f$short.$ext');
  }

  /// The lesson folder [path] sits in, or null when it does not sit in one.
  ///
  /// Only a folder named for this exact lesson, directly inside `offline/`,
  /// qualifies. Anything else -- a path from an older layout, a row that was
  /// written wrong -- gets its single file deleted instead, so a bad row can
  /// never take a whole directory with it.
  static String? lessonFolderOf(String path, String contentItemId) {
    if (contentItemId.isEmpty) return null;
    final folder = p.dirname(path);
    if (p.basename(folder) != contentItemId) return null;
    if (p.basename(p.dirname(folder)) != root) return null;
    return folder;
  }

  /// Deletes everything saved for one lesson.
  ///
  /// [mainPath] is the row's own `local_path`; [others] are the attachment
  /// paths recorded beside it. Failures are swallowed: bytes outliving their
  /// record cost storage, but nothing can open them, because the record is
  /// what the player and the reader check.
  static Future<void> deleteLesson({
    required String contentItemId,
    String? mainPath,
    Iterable<String?> others = const [],
  }) async {
    final paths = [mainPath, ...others].whereType<String>().toList();

    for (final path in paths) {
      final folder = lessonFolderOf(path, contentItemId);
      if (folder != null) {
        await _deleteDirectory(folder);
        return;
      }
    }

    for (final path in paths) {
      await _deleteFile(path);
    }
  }

  static Future<void> _deleteDirectory(String path) async {
    try {
      final directory = Directory(path);
      if (await directory.exists()) await directory.delete(recursive: true);
    } on FileSystemException {
      // See deleteLesson.
    }
  }

  static Future<void> _deleteFile(String path) async {
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();

      final folder = file.parent;
      if (await folder.exists() && folder.listSync().isEmpty) {
        await folder.delete();
      }
    } on FileSystemException {
      // See deleteLesson.
    }
  }
}
