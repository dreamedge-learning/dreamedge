/// What the app can do with an attachment.
enum LessonFileKind {
  /// Opened in the PDF reader.
  pdf,

  /// Opened full screen with pinch to zoom.
  image,

  /// Anything else -- an ePub, a zip. The website offers these as downloads;
  /// the app has nothing that opens them, so it does not list them rather
  /// than showing a tile that leads nowhere.
  other;

  bool get isViewable => this != LessonFileKind.other;

  static const Set<String> _imageExtensions = {'png', 'jpg', 'jpeg', 'webp'};

  /// Decided from the MIME type when the upload recorded one, and from the
  /// extension otherwise. An admin can rename a file to anything, so the
  /// display name is the last thing asked.
  static LessonFileKind of({String? mimeType, String? extension}) {
    final mime = mimeType?.toLowerCase().trim() ?? '';
    if (mime == 'application/pdf') return LessonFileKind.pdf;
    if (mime == 'image/png' || mime == 'image/jpeg' || mime == 'image/webp') {
      return LessonFileKind.image;
    }

    final ext = extension?.toLowerCase() ?? '';
    if (ext == 'pdf') return LessonFileKind.pdf;
    if (_imageExtensions.contains(ext)) return LessonFileKind.image;
    return LessonFileKind.other;
  }
}

/// The extension at the end of [name], lower-cased, or null if it has none.
String? fileExtensionOf(String? name) {
  if (name == null) return null;
  final match = RegExp(r'\.([A-Za-z0-9]{1,6})$').firstMatch(name.trim());
  return match?.group(1)?.toLowerCase();
}

/// One file attached to a lesson, as the server lists it.
///
/// A lesson can carry several: the chapter notes, a worksheet, a diagram. The
/// teachers-only originals (PowerPoint, Word) never reach the app -- the
/// database withholds them from students -- so everything here is something
/// the student is allowed to have.
class LessonFile {
  final String id;
  final String name;
  final int sizeBytes;
  final int weight;

  /// Lower-cased, without the dot. Taken from the stored object's key, which
  /// keeps the extension the file was uploaded with even when the display
  /// name was edited to drop it.
  final String extension;

  final LessonFileKind kind;

  const LessonFile({
    required this.id,
    required this.name,
    required this.sizeBytes,
    required this.weight,
    required this.extension,
    required this.kind,
  });

  bool get isViewable => kind.isViewable;

  factory LessonFile.fromJson(Map<String, dynamic> json) {
    final name = (json['display_name'] as String?)?.trim();
    final extension = fileExtensionOf(json['storage_path'] as String?) ??
        fileExtensionOf(name) ??
        '';

    return LessonFile(
      id: json['id'] as String,
      name: (name == null || name.isEmpty) ? 'Attachment' : name,
      sizeBytes: (json['size_bytes'] as num?)?.toInt() ?? 0,
      weight: (json['weight'] as num?)?.toInt() ?? 0,
      extension: extension,
      kind: LessonFileKind.of(
        mimeType: json['mime_type'] as String?,
        extension: extension,
      ),
    );
  }

  /// The files the app can open, in the order the admin arranged them.
  static List<LessonFile> viewable(Iterable<LessonFile> files) {
    final list = files.where((file) => file.isViewable).toList();
    // Stable: equal weights keep the server's order, which breaks ties by
    // upload time.
    final indexed = list.asMap().entries.toList()
      ..sort((a, b) {
        final byWeight = a.value.weight.compareTo(b.value.weight);
        return byWeight != 0 ? byWeight : a.key.compareTo(b.key);
      });
    return [for (final entry in indexed) entry.value];
  }
}
