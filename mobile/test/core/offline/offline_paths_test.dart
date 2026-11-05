import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/offline/offline_paths.dart';
import 'package:path/path.dart' as p;

void main() {
  const lesson = '0f8fad5b-d9cb-469f-a165-70867728950e';

  group('attachmentPath', () {
    test('lands in the lesson folder and is the same every time', () {
      final first = OfflinePaths.attachmentPath('/base', lesson, 'ab-cd-ef', 'pdf');
      final again = OfflinePaths.attachmentPath('/base', lesson, 'ab-cd-ef', 'pdf');
      expect(first, again);
      expect(p.dirname(first), p.join('/base', 'offline', lesson));
      expect(p.basename(first), 'fabcdef.pdf');
    });

    test('a file with no extension still gets one', () {
      final path = OfflinePaths.attachmentPath('/base', lesson, 'id', '');
      expect(p.extension(path), '.bin');
    });
  });

  group('lessonFolderOf', () {
    test('finds the folder named for the lesson inside offline/', () {
      final path = p.join('/base', 'offline', lesson, 'x.pdf');
      expect(
        OfflinePaths.lessonFolderOf(path, lesson),
        p.join('/base', 'offline', lesson),
      );
    });

    test('refuses a folder named for another lesson', () {
      final path = p.join('/base', 'offline', 'another', 'x.pdf');
      expect(OfflinePaths.lessonFolderOf(path, lesson), isNull);
    });

    test('refuses a folder not inside offline/', () {
      final path = p.join('/base', 'documents', lesson, 'x.pdf');
      expect(OfflinePaths.lessonFolderOf(path, lesson), isNull);
    });

    test('refuses an empty lesson id', () {
      final path = p.join('/base', 'offline', '', 'x.pdf');
      expect(OfflinePaths.lessonFolderOf(path, ''), isNull);
    });
  });

  group('deleteLesson', () {
    late Directory base;

    setUp(() async {
      base = await Directory.systemTemp.createTemp('offline_paths_test');
    });

    tearDown(() async {
      if (await base.exists()) await base.delete(recursive: true);
    });

    test('removes the whole lesson folder with every file in it', () async {
      final folder = Directory(OfflinePaths.lessonFolder(base.path, lesson));
      await folder.create(recursive: true);
      final main = File(p.join(folder.path, 'main.mp4'))..writeAsStringSync('v');
      final sheet = File(
        OfflinePaths.attachmentPath(base.path, lesson, 'sheet', 'pdf'),
      )..writeAsStringSync('s');

      final neighbour = Directory(OfflinePaths.lessonFolder(base.path, 'other'));
      await neighbour.create(recursive: true);
      final kept = File(p.join(neighbour.path, 'keep.pdf'))..writeAsStringSync('k');

      await OfflinePaths.deleteLesson(
        contentItemId: lesson,
        mainPath: main.path,
        others: [sheet.path],
      );

      expect(await folder.exists(), isFalse);
      expect(await kept.exists(), isTrue);
    });

    test('a path outside the layout loses only its own file', () async {
      final stray = Directory(p.join(base.path, 'elsewhere'));
      await stray.create(recursive: true);
      final file = File(p.join(stray.path, 'a.pdf'))..writeAsStringSync('a');
      final sibling = File(p.join(stray.path, 'b.pdf'))..writeAsStringSync('b');

      await OfflinePaths.deleteLesson(contentItemId: lesson, mainPath: file.path);

      expect(await file.exists(), isFalse);
      expect(await sibling.exists(), isTrue);
      expect(await stray.exists(), isTrue);
    });

    test('nothing recorded is nothing deleted', () async {
      await OfflinePaths.deleteLesson(contentItemId: lesson);
      expect(await base.exists(), isTrue);
    });
  });
}
