import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/services/doubt_service.dart';

void main() {
  group('DoubtPhoto', () {
    test('takes the extension from a picked file name', () {
      expect(DoubtPhoto.extensionOf('IMG_2041.PNG'), 'png');
      expect(DoubtPhoto.extensionOf('scaled_photo.jpeg'), 'jpeg');
      expect(DoubtPhoto.extensionOf('no-extension'), 'jpg');
      expect(DoubtPhoto.extensionOf('trailing.'), 'jpg');
    });

    test('only ever sends a type the bucket accepts', () {
      DoubtPhoto photo(String ext) =>
          DoubtPhoto(bytes: utf8.encode(''), extension: ext);

      expect(photo('png').contentType, 'image/png');
      expect(photo('png').storedExtension, 'png');
      expect(photo('webp').contentType, 'image/webp');
      expect(photo('webp').storedExtension, 'webp');
      expect(photo('jpeg').contentType, 'image/jpeg');
      expect(photo('jpeg').storedExtension, 'jpg');
      // Anything else is sent as the JPEG the picker re-encoded it to.
      expect(photo('heic').contentType, 'image/jpeg');
      expect(photo('heic').storedExtension, 'jpg');
    });
  });

  group('describeDoubtError', () {
    test('passes through the messages the database words for students', () {
      const limited = 'You have asked a lot of doubts recently. '
          'Please try again in 40 minutes.';
      expect(describeDoubtError('PT429', limited), limited);
      expect(
        describeDoubtError('42501', 'This doubt has been closed.'),
        'This doubt has been closed.',
      );
    });

    test('rewords a row-level security refusal', () {
      expect(
        describeDoubtError(
          '42501',
          'new row violates row-level security policy for table "doubts"',
        ),
        'You can only ask about lessons in a course you are enrolled in.',
      );
    });

    test('never shows a raw database error', () {
      expect(
        describeDoubtError('XX000', 'internal error'),
        'Something went wrong. Please try again.',
      );
      expect(
        describeDoubtError(null, null),
        'Something went wrong. Please try again.',
      );
    });
  });
}
