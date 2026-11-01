-- Pure Option C: restore foreign keys that CASCADE-dropped when the
-- Oct 17 migrations recreated students / courses with new schemas.
-- Columns still exist on the referencing tables (they're just UUIDs);
-- the constraints vanished with the parent tables. Re-add them here.

-- ------------------------------------------------------------
-- Course FKs (lost when 20261017100000_courses_table dropped courses)
-- ------------------------------------------------------------
alter table subjects
  drop constraint if exists subjects_course_id_fkey,
  add constraint subjects_course_id_fkey
    foreign key (course_id) references courses(id) on delete cascade;

alter table tests
  drop constraint if exists tests_course_id_fkey,
  add constraint tests_course_id_fkey
    foreign key (course_id) references courses(id) on delete set null;

alter table notifications
  drop constraint if exists notifications_course_id_fkey,
  add constraint notifications_course_id_fkey
    foreign key (course_id) references courses(id) on delete set null;

alter table orders
  drop constraint if exists orders_course_id_fkey,
  add constraint orders_course_id_fkey
    foreign key (course_id) references courses(id) on delete cascade;

alter table live_classes
  drop constraint if exists live_classes_course_id_fkey,
  add constraint live_classes_course_id_fkey
    foreign key (course_id) references courses(id) on delete cascade;

alter table batches
  drop constraint if exists batches_course_id_fkey,
  add constraint batches_course_id_fkey
    foreign key (course_id) references courses(id) on delete cascade;

-- ------------------------------------------------------------
-- Student FKs (lost when 20261016200000_students_table dropped students)
-- ------------------------------------------------------------
alter table test_attempts
  drop constraint if exists test_attempts_student_id_fkey,
  add constraint test_attempts_student_id_fkey
    foreign key (student_id) references students(id) on delete cascade;

alter table orders
  drop constraint if exists orders_student_id_fkey,
  add constraint orders_student_id_fkey
    foreign key (student_id) references students(id) on delete cascade;

alter table student_notifications
  drop constraint if exists student_notifications_student_id_fkey,
  add constraint student_notifications_student_id_fkey
    foreign key (student_id) references students(id) on delete cascade;

alter table referral_codes
  drop constraint if exists referral_codes_student_id_fkey,
  add constraint referral_codes_student_id_fkey
    foreign key (student_id) references students(id) on delete set null;

alter table batch_students
  drop constraint if exists batch_students_student_id_fkey,
  add constraint batch_students_student_id_fkey
    foreign key (student_id) references students(id) on delete cascade;

-- ------------------------------------------------------------
-- Legacy course columns that later migrations (notably
-- payment_hardening's verify_and_record_payment RPC) still read.
-- payment_hardening does: `select coalesce(validity_days, 365)
-- from public.courses` to compute enrolment valid_until.
-- Keep validity_days present so purchases work; status column
-- is no longer needed since qa_rls_public_read now reads
-- is_published instead.
-- ------------------------------------------------------------
alter table public.courses
  add column if not exists validity_days integer default 365;
