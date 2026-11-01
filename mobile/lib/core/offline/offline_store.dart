import 'dart:async';
import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../models/content.dart';
import '../models/course.dart';
import '../models/enrollment.dart';
import '../models/subject.dart';
import '../models/topic.dart';
import 'download_record.dart';
import 'offline_db.dart';

/// Typed access to the on-device database.
///
/// Everything that touches sqflite goes through here, so the rest of the app
/// never writes SQL and the tables can be reshaped without hunting through
/// screens. Rows come back out through the same `fromJson` the network path
/// uses, which is what stops the cache and the live code drifting apart about
/// what a row means.
class OfflineStore {
  OfflineStore();

  Future<Database> get _db => OfflineDb.open();

  static const String _lastVerifiedKey = 'last_entitlement_check';

  int get _now => DateTime.now().millisecondsSinceEpoch;

  /// Notifies when anything in `downloads` changes.
  ///
  /// A broadcast stream rather than per-item streams: the Downloads screen,
  /// the lesson tiles and the player all want to know, and they come and go.
  Stream<void> get changes => _changes.stream;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  void _announce() {
    if (!_changes.isClosed) _changes.add(null);
  }

  Future<void> dispose() async {
    await _changes.close();
  }

  // ---------------------------------------------------------------------------
  // Mirrors
  // ---------------------------------------------------------------------------

  Future<void> cacheCourses(List<Course> courses) async {
    if (courses.isEmpty) return;
    final db = await _db;
    final batch = db.batch();

    for (final course in courses) {
      batch.insert('cached_courses', {
        'id': course.id,
        'payload': jsonEncode(course.toJson()),
        'cached_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await batch.commit(noResult: true);
  }

  Future<List<Course>> cachedCourses() async {
    final db = await _db;
    final rows = await db.query('cached_courses', orderBy: 'cached_at desc');
    return rows.map((row) => Course.fromJson(_payload(row))).toList();
  }

  Future<Course?> cachedCourse(String id) async {
    final db = await _db;
    final rows = await db.query(
      'cached_courses',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return Course.fromJson(_payload(rows.first));
  }

  Future<void> cacheSubjects(String courseId, List<Subject> subjects) async {
    final db = await _db;
    final batch = db.batch();

    // Replace rather than merge: a subject the admin deleted has to disappear
    // from the cache too, or it stays on the course page forever.
    batch.delete(
      'cached_subjects',
      where: 'course_id = ?',
      whereArgs: [courseId],
    );

    for (final subject in subjects) {
      batch.insert('cached_subjects', {
        'id': subject.id,
        'course_id': courseId,
        'weight': subject.weight,
        'payload': jsonEncode(subject.toJson()),
        'cached_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await batch.commit(noResult: true);
  }

  Future<List<Subject>> cachedSubjects(String courseId) async {
    final db = await _db;
    final rows = await db.query(
      'cached_subjects',
      where: 'course_id = ?',
      whereArgs: [courseId],
      orderBy: 'weight asc',
    );
    return rows.map((row) => Subject.fromJson(_payload(row))).toList();
  }

  Future<void> cacheTopics(String subjectId, List<Topic> topics) async {
    final db = await _db;
    final batch = db.batch();

    batch.delete(
      'cached_topics',
      where: 'subject_id = ?',
      whereArgs: [subjectId],
    );

    for (final topic in topics) {
      batch.insert('cached_topics', {
        'id': topic.id,
        'subject_id': subjectId,
        'weight': topic.weight,
        'payload': jsonEncode(topic.toJson()),
        'cached_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await batch.commit(noResult: true);
  }

  Future<List<Topic>> cachedTopics(String subjectId) async {
    final db = await _db;
    final rows = await db.query(
      'cached_topics',
      where: 'subject_id = ?',
      whereArgs: [subjectId],
      orderBy: 'weight asc',
    );
    return rows.map((row) => Topic.fromJson(_payload(row))).toList();
  }

  Future<void> cacheContentItems(String topicId, List<Content> items) async {
    final db = await _db;
    final batch = db.batch();

    batch.delete(
      'cached_content_items',
      where: 'topic_id = ?',
      whereArgs: [topicId],
    );

    for (final item in items) {
      batch.insert('cached_content_items', {
        'id': item.id,
        'topic_id': topicId,
        'weight': item.weight,
        'type': item.type.wireValue,
        'payload': jsonEncode(item.toJson()),
        'cached_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await batch.commit(noResult: true);
  }

  /// Caches one item on its own, for the paths that fetch a single lesson.
  Future<void> cacheContentItem(Content item) async {
    final db = await _db;
    await db.insert('cached_content_items', {
      'id': item.id,
      'topic_id': item.topicId,
      'weight': item.weight,
      'type': item.type.wireValue,
      'payload': jsonEncode(item.toJson()),
      'cached_at': _now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Content>> cachedContentItems(String topicId) async {
    final db = await _db;
    final rows = await db.query(
      'cached_content_items',
      where: 'topic_id = ?',
      whereArgs: [topicId],
      orderBy: 'weight asc',
    );
    return rows.map((row) => Content.fromJson(_payload(row))).toList();
  }

  Future<Content?> cachedContentItem(String id) async {
    final db = await _db;
    final rows = await db.query(
      'cached_content_items',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return Content.fromJson(_payload(rows.first));
  }

  Future<void> cacheEnrollments(List<Enrollment> enrollments) async {
    final db = await _db;
    final batch = db.batch();

    batch.delete('cached_enrollments');

    for (final enrollment in enrollments) {
      batch.insert('cached_enrollments', {
        'id': enrollment.id,
        'course_id': enrollment.courseId,
        'status': enrollment.status,
        'valid_until': enrollment.validUntil?.millisecondsSinceEpoch,
        'payload': jsonEncode(enrollment.toJson()),
        'cached_at': _now,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await batch.commit(noResult: true);
  }

  Future<List<Enrollment>> cachedEnrollments() async {
    final db = await _db;
    final rows = await db.query('cached_enrollments');
    return rows.map((row) => Enrollment.fromJson(_payload(row))).toList();
  }

  Map<String, dynamic> _payload(Map<String, Object?> row) {
    final decoded = jsonDecode(row['payload'] as String);
    return Map<String, dynamic>.from(decoded as Map);
  }

  // ---------------------------------------------------------------------------
  // Downloads
  // ---------------------------------------------------------------------------

  Future<DownloadRecord?> download(String contentItemId) async {
    final db = await _db;
    final rows = await db.query(
      'downloads',
      where: 'content_item_id = ?',
      whereArgs: [contentItemId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return DownloadRecord.fromRow(rows.first);
  }

  Future<List<DownloadRecord>> allDownloads() async {
    final db = await _db;
    final rows = await db.query('downloads', orderBy: 'created_at asc');
    return rows.map(DownloadRecord.fromRow).toList();
  }

  /// Everything still wanting bytes, oldest first.
  ///
  /// Paused rows are included: the queue has to be able to pick them up again
  /// when Wi-Fi returns without the student asking twice.
  Future<List<DownloadRecord>> pendingDownloads({
    bool includePaused = false,
  }) async {
    final db = await _db;
    final statuses = <String>[
      DownloadStatus.queued.name,
      DownloadStatus.downloading.name,
      if (includePaused) DownloadStatus.paused.name,
    ];

    final rows = await db.query(
      'downloads',
      where: 'status in (${List.filled(statuses.length, '?').join(',')})',
      whereArgs: statuses,
      orderBy: 'created_at asc',
    );
    return rows.map(DownloadRecord.fromRow).toList();
  }

  Future<void> putDownload(DownloadRecord record) async {
    final db = await _db;
    await db.insert(
      'downloads',
      record.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    _announce();
  }

  /// Writes a few columns without reading the row back first.
  ///
  /// Used for progress, which arrives many times a second: a read-modify-write
  /// per chunk would make the database the slowest part of a download.
  Future<void> patchDownload(
    String contentItemId,
    Map<String, Object?> values, {
    bool announce = true,
  }) async {
    final db = await _db;
    await db.update(
      'downloads',
      values,
      where: 'content_item_id = ?',
      whereArgs: [contentItemId],
    );
    if (announce) _announce();
  }

  Future<void> removeDownload(String contentItemId) async {
    final db = await _db;
    await db.delete(
      'downloads',
      where: 'content_item_id = ?',
      whereArgs: [contentItemId],
    );
    _announce();
  }

  /// Total bytes actually on the device, for the Downloads screen's header.
  Future<int> bytesStored() async {
    final db = await _db;
    final rows = await db.rawQuery(
      'select coalesce(sum(bytes_done), 0) as total from downloads '
      'where status != ?',
      [DownloadStatus.expired.name],
    );
    return (rows.first['total'] as num?)?.toInt() ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Queued progress
  // ---------------------------------------------------------------------------

  Future<void> queueProgress({
    required String contentItemId,
    required int positionSeconds,
    required double progressPercentage,
    required String status,
  }) async {
    final db = await _db;
    await db.insert('progress_queue', {
      'content_item_id': contentItemId,
      'position_seconds': positionSeconds,
      'progress_percentage': progressPercentage,
      'status': status,
      'queued_at': _now,
    });
  }

  Future<List<QueuedProgress>> queuedProgress({int limit = 200}) async {
    final db = await _db;
    final rows = await db.query(
      'progress_queue',
      orderBy: 'queued_at asc, id asc',
      limit: limit,
    );
    return rows.map(QueuedProgress.fromRow).toList();
  }

  Future<void> dropQueuedProgress(Iterable<int> ids) async {
    if (ids.isEmpty) return;
    final db = await _db;
    final list = ids.toList();
    await db.delete(
      'progress_queue',
      where: 'id in (${List.filled(list.length, '?').join(',')})',
      whereArgs: list,
    );
  }

  /// The most recent queued position for one item, which is what the player
  /// should resume from while offline -- the server's copy is older.
  Future<QueuedProgress?> latestQueuedProgress(String contentItemId) async {
    final db = await _db;
    final rows = await db.query(
      'progress_queue',
      where: 'content_item_id = ?',
      whereArgs: [contentItemId],
      orderBy: 'position_seconds desc',
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return QueuedProgress.fromRow(rows.first);
  }

  // ---------------------------------------------------------------------------
  // The entitlement heartbeat
  // ---------------------------------------------------------------------------

  /// When the app last managed a successful entitlement check.
  ///
  /// This is the only thing standing between an indefinitely offline device
  /// and downloads that never expire, so it is stored rather than inferred.
  Future<DateTime?> lastVerifiedAt() async {
    final db = await _db;
    final rows = await db.query(
      'offline_state',
      where: 'key = ?',
      whereArgs: [_lastVerifiedKey],
      limit: 1,
    );
    if (rows.isEmpty) return null;

    final value = int.tryParse(rows.first['value'] as String? ?? '');
    if (value == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(value);
  }

  Future<void> markVerifiedNow() async {
    final db = await _db;
    await db.insert('offline_state', {
      'key': _lastVerifiedKey,
      'value': '$_now',
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// Wipes everything. Called on sign-out: the next account must not inherit
  /// the last one's cache or its downloads.
  Future<void> clearAll() async {
    final db = await _db;
    final batch = db.batch();
    for (final table in [
      'cached_courses',
      'cached_subjects',
      'cached_topics',
      'cached_content_items',
      'cached_enrollments',
      'downloads',
      'progress_queue',
      'offline_state',
    ]) {
      batch.delete(table);
    }
    await batch.commit(noResult: true);
    _announce();
  }
}
