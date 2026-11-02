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
/// Every row in both groups carries the `student_id` it belongs to. A phone in
/// Kalmeshwar is shared between siblings far more often than it is not, and
/// without that column the second sign-in both read the first student's paid
/// lessons and then revoked them.
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
  ///
  /// 2: every row that belongs to a student says so, downloads record the
  /// licence terms and the last server-confirmed check behind them, and a
  /// paused row says who paused it.
  static const int version = 2;

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

  /// Closes and forgets the handle, so the next `open` starts clean.
  ///
  /// Called from the sign-out path. It is not what keeps the next account out
  /// of this one's rows -- `student_id` on every row does that, and the
  /// downloads are deliberately kept so a student who signs back in does not
  /// re-fetch a gigabyte over a data pack. This is here so a handle cannot
  /// outlive the session that opened it.
  static Future<void> close() async {
    await _database?.close();
    _database = null;
  }

  static Future<void> _create(Database db) async {
    final batch = db.batch();

    // ----- Mirrors of the server's rows -------------------------------------
    //
    // Keyed on (id, student_id) rather than id alone. Two students on one
    // phone see different catalogues -- different paid courses, different
    // enrolment dates -- and a single-keyed mirror would let the second
    // sign-in overwrite the first student's view and then hand it back to
    // them as their own.

    batch.execute("""
      create table cached_courses (
        id         text not null,
        student_id text not null,
        payload    text not null,
        cached_at  integer not null,
        primary key (id, student_id)
      )
    """);

    batch.execute("""
      create table cached_subjects (
        id         text not null,
        student_id text not null,
        course_id  text not null,
        weight     integer not null default 0,
        payload    text not null,
        cached_at  integer not null,
        primary key (id, student_id)
      )
    """);
    batch.execute(
      'create index idx_cached_subjects_course '
      'on cached_subjects (student_id, course_id, weight)',
    );

    batch.execute("""
      create table cached_topics (
        id          text not null,
        student_id  text not null,
        subject_id  text not null,
        weight      integer not null default 0,
        payload     text not null,
        cached_at   integer not null,
        primary key (id, student_id)
      )
    """);
    batch.execute(
      'create index idx_cached_topics_subject '
      'on cached_topics (student_id, subject_id, weight)',
    );

    batch.execute("""
      create table cached_content_items (
        id         text not null,
        student_id text not null,
        topic_id   text not null,
        weight     integer not null default 0,
        type       text not null default 'note',
        payload    text not null,
        cached_at  integer not null,
        primary key (id, student_id)
      )
    """);
    batch.execute(
      'create index idx_cached_content_topic '
      'on cached_content_items (student_id, topic_id, weight)',
    );

    // Entitlement has to be answerable with the radio off, or a downloaded
    // lesson could not be told apart from one the student never bought.
    batch.execute("""
      create table cached_enrollments (
        id           text not null,
        student_id   text not null,
        course_id    text not null,
        status       text not null default 'active',
        valid_until  integer,
        payload      text not null,
        cached_at    integer not null,
        primary key (id, student_id)
      )
    """);
    batch.execute(
      'create index idx_cached_enrollments_course '
      'on cached_enrollments (student_id, course_id)',
    );

    // ----- Things that are not disposable -----------------------------------

    // Keyed on (content_item_id, student_id), so one item is held once per
    // student rather than once per quality. That is deliberate: two copies of
    // one lesson at different resolutions cost the student storage for
    // something they cannot tell apart in a list, and the quality menu during
    // playback streams rather than reading from disk. Widening the key to
    // include `quality` is the change to make if that ever stops being true.
    //
    // `course_id`, `subject_id` and `subject_name` are carried so the
    // Downloads screen can group by course and name the group, which it cannot
    // do from a topic id.
    //
    // `licence_days` and `last_verified_at` are the licence terms the server
    // set, kept next to the expiry so a row whose expiry was written wrong can
    // still not outlive its last real server check.
    batch.execute("""
      create table downloads (
        content_item_id      text not null,
        student_id           text not null,
        course_id            text,
        course_name          text,
        subject_id           text,
        subject_name         text,
        topic_id             text,
        title                text not null default '',
        type                 text not null default 'video',
        quality              text,
        local_path           text,
        bytes_total          integer not null default 0,
        bytes_done           integer not null default 0,
        status               text not null default 'queued',
        paused_reason        text,
        error                text,
        attempts             integer not null default 0,
        licence_expires_at   integer,
        licence_days         integer,
        last_verified_at     integer,
        created_at           integer not null,
        completed_at         integer,
        primary key (content_item_id, student_id)
      )
    """);
    batch.execute(
      'create index idx_downloads_status '
      'on downloads (student_id, status, created_at)',
    );

    batch.execute("""
      create table progress_queue (
        id                  integer primary key autoincrement,
        student_id          text not null,
        content_item_id     text not null,
        position_seconds    integer not null,
        progress_percentage real not null,
        status              text not null,
        queued_at           integer not null
      )
    """);
    batch.execute(
      'create index idx_progress_queue_order '
      'on progress_queue (student_id, queued_at)',
    );

    // Small facts that are not rows of anything: when this student's licences
    // were last confirmed, how many empty entitlement answers have arrived in
    // a row, and the server clock anchor. Keyed by student as well as by name,
    // because "when did we last confirm these licences" is not a fact about
    // the device -- while the clock anchor is, and uses the empty-string
    // student id for exactly that reason.
    batch.execute("""
      create table offline_state (
        key         text not null,
        student_id  text not null default '',
        value       text,
        primary key (key, student_id)
      )
    """);

    await batch.commit(noResult: true);
  }

  static Future<void> _upgrade(Database db, int from, int to) async {
    if (from < 2) await _addStudentOwnership(db);
  }

  /// Version 1 -> 2: every row gains an owner.
  ///
  /// The `cached_*` tables and `offline_state` are rebuilt empty. They mirror
  /// what the server said, and a lost mirror costs one refresh -- a far better
  /// trade than guessing which account a row belonged to.
  ///
  /// `downloads` keeps its rows, because losing those loses a file the student
  /// can see sitting on their device. They arrive with no owner, and an
  /// unowned row can never be proved to belong to whoever signs in next, so
  /// each becomes `expired` with a reason worth reading and
  /// `DownloadManager.purgeUnowned` deletes the bytes on the next run rather
  /// than leaving a gigabyte nothing can play.
  ///
  /// Queued positions are dropped outright. A position attributed to the wrong
  /// student is worse than a lost one, and the furthest-position rule means
  /// the server's own copy is never behind by more than one session.
  static Future<void> _addStudentOwnership(Database db) async {
    final setup = db.batch();

    for (final table in [
      'cached_courses',
      'cached_subjects',
      'cached_topics',
      'cached_content_items',
      'cached_enrollments',
      'offline_state',
      'progress_queue',
    ]) {
      setup.execute('drop table if exists $table');
    }

    setup.execute('drop index if exists idx_downloads_status');
    setup.execute('alter table downloads rename to downloads_v1');

    await setup.commit(noResult: true);

    await _create(db);

    // The empty string is the one owner value no student can have, so these
    // rows are reachable by the purge and by nothing else.
    await db.execute("""
      insert into downloads (
        content_item_id, student_id, course_id, topic_id, title, type, quality,
        local_path, bytes_total, bytes_done, status, error, attempts,
        licence_expires_at, created_at, completed_at
      )
      select content_item_id, '', course_id, topic_id, title, type, quality,
             local_path, bytes_total, bytes_done, 'expired',
             'Saved before this update. Please download it again.', attempts,
             licence_expires_at, created_at, completed_at
        from downloads_v1
    """);

    await db.execute('drop table downloads_v1');
  }
}
