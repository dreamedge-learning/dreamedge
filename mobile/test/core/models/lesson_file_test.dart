import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/lesson_file.dart';

Map<String, dynamic> _row({
  String id = 'f1',
  String? name = 'Chapter 1 notes.pdf',
  String path = 'items/abc/1712.pdf',
  String? mime,
  int size = 1024,
  int weight = 0,
}) =>
    {
      'id': id,
      'display_name': name,
      'storage_path': path,
      'mime_type': mime,
      'size_bytes': size,
      'weight': weight,
    };

void main() {
  group('LessonFileKind.of', () {
    test('reads the MIME type first', () {
      expect(LessonFileKind.of(mimeType: 'application/pdf'), LessonFileKind.pdf);
      expect(LessonFileKind.of(mimeType: 'image/png'), LessonFileKind.image);
      expect(LessonFileKind.of(mimeType: 'IMAGE/JPEG'), LessonFileKind.image);
      expect(LessonFileKind.of(mimeType: 'image/webp'), LessonFileKind.image);
    });

    test('falls back to the extension', () {
      expect(LessonFileKind.of(extension: 'pdf'), LessonFileKind.pdf);
      expect(LessonFileKind.of(extension: 'JPG'), LessonFileKind.image);
      expect(LessonFileKind.of(extension: 'jpeg'), LessonFileKind.image);
      expect(LessonFileKind.of(extension: 'webp'), LessonFileKind.image);
    });

    test('anything the app cannot open is hidden', () {
      expect(LessonFileKind.of(extension: 'epub'), LessonFileKind.other);
      expect(LessonFileKind.of(extension: 'zip'), LessonFileKind.other);
      expect(LessonFileKind.of(mimeType: 'application/zip'), LessonFileKind.other);
      expect(LessonFileKind.of(), LessonFileKind.other);
      expect(LessonFileKind.other.isViewable, isFalse);
      expect(LessonFileKind.pdf.isViewable, isTrue);
      expect(LessonFileKind.image.isViewable, isTrue);
    });
  });

  group('fileExtensionOf', () {
    test('lower-cases and drops the dot', () {
      expect(fileExtensionOf('Notes.PDF'), 'pdf');
      expect(fileExtensionOf('a/b/c.webp'), 'webp');
    });

    test('is null without one', () {
      expect(fileExtensionOf('Chapter one'), isNull);
      expect(fileExtensionOf(null), isNull);
      expect(fileExtensionOf('archive.'), isNull);
    });
  });

  group('LessonFile.fromJson', () {
    test('takes the extension from the stored key, not the display name', () {
      // An admin renamed the file and dropped the extension.
      final file = LessonFile.fromJson(_row(name: 'Worksheet', path: 'x/1.png'));
      expect(file.extension, 'png');
      expect(file.kind, LessonFileKind.image);
      expect(file.name, 'Worksheet');
    });

    test('a blank name still reads as something', () {
      final file = LessonFile.fromJson(_row(name: '  '));
      expect(file.name, 'Attachment');
    });

    test('reads size and weight', () {
      final file = LessonFile.fromJson(_row(size: 2048, weight: 3));
      expect(file.sizeBytes, 2048);
      expect(file.weight, 3);
    });
  });

  group('LessonFile.viewable', () {
    test('drops what the app cannot open and keeps the admin order', () {
      final files = [
        LessonFile.fromJson(_row(id: 'b', path: 'x/b.pdf', weight: 2)),
        LessonFile.fromJson(_row(id: 'zip', path: 'x/z.zip', weight: 0)),
        LessonFile.fromJson(_row(id: 'a', path: 'x/a.jpg', weight: 1)),
        LessonFile.fromJson(_row(id: 'epub', path: 'x/e.epub', weight: 1)),
      ];
      expect(LessonFile.viewable(files).map((f) => f.id), ['a', 'b']);
    });

    test('equal weights keep the order the server sent', () {
      final files = [
        LessonFile.fromJson(_row(id: 'first', path: 'x/1.pdf')),
        LessonFile.fromJson(_row(id: 'second', path: 'x/2.pdf')),
        LessonFile.fromJson(_row(id: 'third', path: 'x/3.png')),
      ];
      expect(
        LessonFile.viewable(files).map((f) => f.id),
        ['first', 'second', 'third'],
      );
    });
  });
}
