import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// The on-device database behind offline mode.
///
/// Two different jobs live here and it is worth being clear which is which.
///
/// The `cached_*` tables are a copy of what the server said, so that Home,
/// Courses and My Learning can draw something the instant the app opens
/// rather than a spinner that may never resolve. They are disposable: losing
/// them costs a refresh.
///
/// `downloads` and `progress_queue` are not disposable. One records files that
/// exist on this device and the licence that makes them playable; the other
/// holds watched positions that have not reached the server yet. Losing either
/// loses something the student can see -- a lesson they saved, or the place
/// they got to.
///
/// The mirror tables keep the server row as JSON next to the few columns worth
/// querying on, rather than a column per field. This schema has changed
/// repeatedly -- `lessons` to `content_items`, a video URL to a Bunny GUID --
/// and a column-per-field mirror would need a migration for each of those on
/// top of the one the server already needed. The JSON is handed back to the
/// same `fromJson` the network path uses, so there is one parser and the cache
/// cannot disagree with the live code about what a row means.
class OfflineDb {
  OfflineDb._();

  static const String fileName = 'dreamedge_offline.db';

  /// Bump this and add a step to [_upgrade] for any schema change. Day one
  /// has a migration path because the alternative -- deleting the database on
  /// upgrade -- would delete downloads the student has paid for.
  static const int version = 1;

  static Database? _database;

  static Future<Database> open() async {
    final existing = _database;
    if (existing != null) return existing;

    final directory = await getDatabasesPath();
    final database = await openDatabase(
      p.join(directory, fileName),
      version: version,
      onConfigure: (db) async {
        // Content rows hang off courses and topics; an orphan row would show
        // as a lesson that belongs to nothing.
        await db.execute('pragma foreign_keys = on');
      },
      onCreate: (db, _) => _create(db),
      onUpgrade: (db, from, to) => _upgrade(db, from, to),
    );

    _database = database;
    return database;
  }

  /// Closes and forgets the handle. Used when a student signs out: the next
  /// account must not inherit the last one's cache.
  static Future<void> close() async {
    await _database?.close();
    _database = null;
  }

  static Future<void> _create(Database db) async {
    final batch = db.batch();

    // ----- Mirrors of the server's rows -------------------------------------

    batch.execute('''
      create table cached_courses (
        id         text primary key,
        payload    text not null,
        cached_at  integer not null
      )
    ''');

    batch.execute('''
      create table cached_subjects (
        id         text primary key,
        course_id  text not null,
        weight     integer not null default 0,
        payload    text not null,
        cached_at  integer not null
      )
    ''');
    batch.execute(
      'create index idx_cached_subjects_course on cached_subjects (course_id, weight)',
    );

    batch.execute('''
      create table cached_topics (
        id          text primary key,
        subject_id  text not null,
        weight      integer not null default 0,
        payload     text not null,
        cached_at   integer not null
      )
    ''');
    batch.execute(
      'create index idx_cached_topics_subject on cached_topics (subject_id, weight)',
    );

    batch.execute('''
      create table cached_content_items (
        id         text primary key,
        topic_id   text not null,
        weight     integer not null default 0,
        type       text not null default 'note',
        payload    text not null,
        cached_at  integer not null
      )
    ''');
    batch.execute(
      'create index idx_cached_content_topic on cached_content_items (topic_id, weight)',
    );

    // Entitlement has to be answerable with the radio off, or a downloaded
    // lesson could not be told apart from one the student never bought.
    batch.execute('''
      create table cached_enrollments (
        id           text primary key,
        course_id    text not null,
        status       text not null default 'active',
        valid_until  integer,
        payload      text not null,
        cached_at    integer not null
      )
    ''');
    batch.execute(
      'create index idx_cached_enrollments_course on cached_enrollments (course_id)',
    );

    // ----- Things that are not disposable -----------------------------------

    batch.execute('''
      create table downloads (
        content_item_id      text primary key,
        course_id            text,
        topic_id             text,
        title                text not null default '',
        type                 text not null default 'video',
        quality              text,
        local_path           text,
        bytes_total          integer not null default 0,
        bytes_done           integer not null default 0,
        status               text not null default 'queued',
        error                text,
        attempts             integer not null default 0,
        licence_expires_at   integer,
        created_at           integer not null,
        completed_at         integer
      )
    ''');
    batch.execute(
      'create index idx_downloads_status on downloads (status, created_at)',
    );

    batch.execute('''
      create table progress_queue (
        id                  integer primary key autoincrement,
        content_item_id     text not null,
        position_seconds    integer not null,
        progress_percentage real not null,
        status              text not null,
        queued_at           integer not null
      )
    ''');
    batch.execute(
      'create index idx_progress_queue_order on progress_queue (queued_at)',
    );

    // One row, holding when the last successful entitlement check happened.
    // Without it an aeroplane-mode device could keep its downloads forever.
    batch.execute('''
      create table offline_state (
        key    text primary key,
        value  text
      )
    ''');

    await batch.commit(noResult: true);
  }

  static Future<void> _upgrade(Database db, int from, int to) async {
    // Nothing to do yet: version 1 is the first shipped schema. Each future
    // version adds its own `if (from < n)` step here and never drops a table
    // that holds downloads or queued progress.
  }
}
