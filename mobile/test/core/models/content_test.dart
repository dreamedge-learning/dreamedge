import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/content.dart';

void main() {
  group('ContentItemType', () {
    test('maps every value of the content_type enum', () {
      expect(ContentItemType.fromString('video'), ContentItemType.video);
      expect(ContentItemType.fromString('pdf'), ContentItemType.pdf);
      expect(ContentItemType.fromString('note'), ContentItemType.note);
      expect(ContentItemType.fromString('ebook'), ContentItemType.ebook);
      expect(ContentItemType.fromString('pyp'), ContentItemType.pyp);
      expect(ContentItemType.fromString('quiz'), ContentItemType.quiz);
    });

    test('an unrecognised type does not crash the list', () {
      expect(ContentItemType.fromString('hologram'), ContentItemType.unknown);
      expect(ContentItemType.fromString(null), ContentItemType.unknown);
      // Unknown must still be writable, or saving a row we half-understand
      // would fail the enum check in Postgres.
      expect(ContentItemType.unknown.wireValue, 'note');
    });
  });

  group('Content', () {
    // Shaped like a real `content_items` row for a video hosted on Bunny.
    final bunnyVideo = {
      'id': 'ct-001',
      'topic_id': 't-001',
      'type': 'video',
      'title': 'Introduction to Algebra',
      'description': 'Learn the basics of algebraic expressions.',
      'file_url': null,
      'video_id': null,
      'video_provider': 'bunny',
      'bunny_video_guid': 'a1b2c3d4-0000-0000-0000-000000000000',
      'video_status': 'ready',
      'video_thumbnail_url': 'https://vz-test.b-cdn.net/a1b2/thumbnail.jpg',
      'video_resolutions': ['360p', '720p'],
      'offline_license_days': 14,
      'duration_seconds': 2700,
      'is_paid': true,
      'is_downloadable': true,
      'is_printable': false,
      'play_limit': 3,
      'status': 'published',
      'weight': 1,
    };

    test('fromJson parses a hosted video', () {
      final content = Content.fromJson(bunnyVideo);

      expect(content.id, 'ct-001');
      expect(content.topicId, 't-001');
      expect(content.type, ContentItemType.video);
      expect(content.title, 'Introduction to Algebra');
      expect(content.videoProvider, 'bunny');
      expect(content.bunnyVideoGuid, 'a1b2c3d4-0000-0000-0000-000000000000');
      expect(content.videoStatus, 'ready');
      expect(content.videoResolutions, ['360p', '720p']);
      expect(content.offlineLicenseDays, 14);
      expect(content.playLimit, 3);
      expect(content.isPaid, true);
      expect(content.isFree, false);
    });

    test('fromJson falls back to safe defaults for the video columns', () {
      final content = Content.fromJson({
        'id': 'ct-002',
        'topic_id': 't-001',
        'type': 'pdf',
        'title': 'Equations Practice',
      });

      expect(content.videoProvider, 'none');
      expect(content.videoStatus, 'none');
      expect(content.bunnyVideoGuid, isNull);
      expect(content.videoResolutions, isEmpty);
      expect(content.offlineLicenseDays, 30);
      expect(content.durationSeconds, 0);
      // Paid unless the row says otherwise: guessing "free" would give content
      // away, and guessing "paid" only shows a lock that can be corrected.
      expect(content.isPaid, true);
      expect(content.isDownloadable, false);
    });

    group('playability', () {
      test('a ready hosted video is playable', () {
        final content = Content.fromJson(bunnyVideo);

        expect(content.isVideo, true);
        expect(content.isBunnyVideo, true);
        expect(content.isVideoReady, true);
        expect(content.hasVideo, true);
      });

      test('a video still transcoding is not playable', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'video_status': 'processing',
        });

        expect(content.isVideoProcessing, true);
        // Bunny has no playlist yet, so a play button would only produce an
        // error the student cannot act on.
        expect(content.hasVideo, false);
      });

      test('a failed transcode is not playable', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'video_status': 'failed',
        });

        expect(content.isVideoFailed, true);
        expect(content.hasVideo, false);
      });

      test('an external video plays from its own URL', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'video_provider': 'external',
          'bunny_video_guid': null,
          'video_resolutions': <String>[],
          'file_url': 'https://example.com/lesson.mp4',
        });

        expect(content.isExternalVideo, true);
        expect(content.videoUrl, 'https://example.com/lesson.mp4');
        expect(content.hasVideo, true);
      });

      test('a storage path is not a playable URL', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'video_provider': 'external',
          'file_url': 'content/ct-001/lesson.mp4',
        });

        expect(content.videoUrl, isNull);
        expect(content.hasVideo, false);
      });

      test('an external video with no URL is not playable', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'video_provider': 'external',
          'file_url': '',
        });

        expect(content.hasVideo, false);
      });
    });

    group('offline', () {
      test('a ready hosted video can be downloaded', () {
        expect(Content.fromJson(bunnyVideo).canDownload, true);
      });

      test('the offline switch decides, not the type', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'is_downloadable': false,
        });

        expect(content.canDownload, false);
      });

      test('a document can be downloaded', () {
        final content = Content.fromJson({
          'id': 'ct-003',
          'topic_id': 't-001',
          'type': 'pyp',
          'title': '2025 Paper',
          'is_downloadable': true,
        });

        expect(content.isReadable, true);
        expect(content.canDownload, true);
      });

      test('an external video cannot be downloaded', () {
        final content = Content.fromJson({
          ...bunnyVideo,
          'video_provider': 'external',
          'file_url': 'https://example.com/lesson.mp4',
        });

        // No renditions and no token of ours: there is nothing to fetch.
        expect(content.canDownload, false);
      });

      test('a quiz is neither readable nor downloadable', () {
        final content = Content.fromJson({
          'id': 'ct-004',
          'topic_id': 't-001',
          'type': 'quiz',
          'title': 'Chapter test',
          'is_downloadable': true,
        });

        expect(content.isReadable, false);
        expect(content.canDownload, false);
      });
    });

    group('formattedDuration', () {
      Content withSeconds(int seconds) => Content.fromJson({
            ...bunnyVideo,
            'duration_seconds': seconds,
          });

      test('shows a dash when nothing is known', () {
        expect(withSeconds(0).formattedDuration, '—');
      });

      test('shows seconds under a minute', () {
        expect(withSeconds(45).formattedDuration, '45s');
      });

      test('shows minutes under an hour', () {
        expect(withSeconds(2700).formattedDuration, '45 min');
      });

      test('shows hours and minutes', () {
        expect(withSeconds(5400).formattedDuration, '1 hr 30 min');
      });

      test('shows hours alone when they divide evenly', () {
        expect(withSeconds(7200).formattedDuration, '2 hr');
      });
    });

    test('toJson round-trips the columns the table owns', () {
      final json = Content.fromJson(bunnyVideo).toJson();

      expect(json['type'], 'video');
      expect(json['video_provider'], 'bunny');
      expect(json['video_status'], 'ready');
      expect(json['video_resolutions'], ['360p', '720p']);
      expect(json['offline_license_days'], 14);
      expect(json['play_limit'], 3);
    });
  });

  group('PlaybackPayload', () {
    Map<String, dynamic> payloadJson({
      String? expiresAt,
      Map<String, Object?>? mp4,
    }) {
      return {
        'provider': 'bunny',
        'hls': 'https://vz-test.b-cdn.net/bcdn_token=HS256-x/a1b2/playlist.m3u8',
        'mp4': mp4 ??
            {
              '360': 'https://vz-test.b-cdn.net/a1b2/play_360p.mp4?token=x',
              '720': 'https://vz-test.b-cdn.net/a1b2/play_720p.mp4?token=x',
              '1080': 'https://vz-test.b-cdn.net/a1b2/play_1080p.mp4?token=x',
            },
        'thumbnail': 'https://vz-test.b-cdn.net/a1b2/thumbnail.jpg?token=x',
        'durationSeconds': 2700,
        'isDownloadable': true,
        'offlineLicenseDays': 14,
        'validUntil': '2027-01-31T00:00:00Z',
        'expiresAt': expiresAt ??
            DateTime.now().add(const Duration(hours: 6)).toIso8601String(),
        'serverNow': DateTime.now().toUtc().toIso8601String(),
      };
    }

    test('fromJson parses the Edge Function response', () {
      final payload = PlaybackPayload.fromJson(payloadJson());

      expect(payload.provider, 'bunny');
      expect(payload.hls, contains('playlist.m3u8'));
      expect(payload.mp4.length, 3);
      expect(payload.durationSeconds, 2700);
      expect(payload.isDownloadable, true);
      expect(payload.offlineLicenseDays, 14);
      expect(payload.validUntil, DateTime.utc(2027, 1, 31));
    });

    test('qualities are listed highest first', () {
      final payload = PlaybackPayload.fromJson(payloadJson());
      expect(payload.qualities, ['1080', '720', '360']);
    });

    test('an empty rendition map means MP4 fallback is off', () {
      final payload = PlaybackPayload.fromJson(payloadJson(mp4: const {}));
      expect(payload.mp4, isEmpty);
      expect(payload.qualities, isEmpty);
    });

    test('a blank rendition URL is dropped rather than played', () {
      final payload = PlaybackPayload.fromJson(
        payloadJson(mp4: const {'720': '', '360': null}),
      );
      expect(payload.mp4, isEmpty);
    });

    test('a fresh payload is usable', () {
      expect(PlaybackPayload.fromJson(payloadJson()).isUsable, true);
    });

    test('a payload inside its last five minutes is not usable', () {
      final payload = PlaybackPayload.fromJson(
        payloadJson(
          expiresAt:
              DateTime.now().add(const Duration(minutes: 2)).toIso8601String(),
        ),
      );

      // Handing this out would start a request that cannot finish.
      expect(payload.isUsable, false);
    });

    test('a payload with no expiry is treated as already spent', () {
      final json = payloadJson()..remove('expiresAt');
      expect(PlaybackPayload.fromJson(json).isUsable, false);
    });

    test('a payload with no server clock is refused, not anchored locally',
        () {
      // Falling back to the handset's clock would let a student extend an
      // offline licence from their date settings.
      final json = payloadJson()..remove('serverNow');
      expect(() => PlaybackPayload.fromJson(json), throwsFormatException);
    });

    test('an unparseable server clock is refused too', () {
      final json = payloadJson()..['serverNow'] = 'not a date';
      expect(() => PlaybackPayload.fromJson(json), throwsFormatException);
    });
  });
}
