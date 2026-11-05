import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/lesson_file.dart';
import '../offline/local_library.dart';
import 'document_provider.dart';

/// One file on a lesson, as the reader shows it.
class LessonAttachment {
  /// The `content_files` id. Null only for an older lesson whose single
  /// document is served by the route's default -- a bare link on the item, or
  /// a copy saved before attachments were recorded.
  final String? fileId;

  final String name;
  final LessonFileKind kind;

  /// Set when the file is already on this device and may be opened.
  final String? localPath;

  const LessonAttachment({
    required this.fileId,
    required this.name,
    required this.kind,
    this.localPath,
  });

  bool get isLocal => localPath != null;

  /// Stable across rebuilds, for keying the viewer.
  String get key => fileId ?? 'default';
}

/// Every file on a lesson the app can open, saved copies first.
///
/// The order of preference is the one the reader always had: a copy already
/// on the phone is never fetched again at the student's expense. A lesson
/// saved before attachments were recorded still opens from its one saved
/// file, exactly as it did.
///
/// Throws when nothing is saved and the list cannot be fetched, so the reader
/// can say so and offer a retry rather than showing an empty lesson.
final lessonAttachmentsProvider = FutureProvider.autoDispose
    .family<List<LessonAttachment>, String>((ref, contentId) async {
  final library = ref.watch(localLibraryProvider);
  final documents = ref.watch(documentServiceProvider);

  final saved = await library.attachments(contentId);
  final savedViewable = [
    for (final file in saved)
      if (LessonFileKind.of(extension: file.extension).isViewable)
        LessonAttachment(
          fileId: file.fileId,
          name: file.name,
          kind: LessonFileKind.of(extension: file.extension),
          localPath: file.localPath,
        ),
  ];
  if (savedViewable.isNotEmpty) return savedViewable;

  // A document saved before version 3 has no attachment rows. Its one file
  // is the lesson's main document; a video's saved copy is the video, which
  // the reader has no business opening.
  final local = await library.find(contentId);
  if (local != null && local.quality == null) {
    return [
      LessonAttachment(
        fileId: null,
        name: 'Document',
        kind: LessonFileKind.pdf,
        localPath: local.path,
      ),
    ];
  }

  final files = LessonFile.viewable(
    await documents.listFiles(contentId),
  );
  if (files.isNotEmpty) {
    return [
      for (final file in files)
        LessonAttachment(fileId: file.id, name: file.name, kind: file.kind),
    ];
  }

  // Nothing listed: a lesson whose document is a link on the item rather than
  // an upload. The route serves it by default, as it always has.
  return const [
    LessonAttachment(fileId: null, name: 'Document', kind: LessonFileKind.pdf),
  ];
});
