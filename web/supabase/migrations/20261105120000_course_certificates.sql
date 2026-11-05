-- Course completion certificates.
--
-- A student who has completed every published lesson in a course is owed a
-- certificate, but nothing is printed until somebody at the centre has looked
-- at the request: a certificate goes out under a real person's signature, and
-- "watched every video" is a fact the database knows, not a judgement it can
-- make. So completion files a pending request on its own, and an admin turns
-- it into a numbered certificate -- or rejects it with a reason the student
-- can read.
--
-- What counts towards completion: every content item in the course that a
-- student can see -- published, under a visible topic in a visible subject,
-- the same rule `get_course_syllabus` applies. That includes items of type
-- `quiz`, which the website lets a student mark complete like any other
-- lesson. Rows in `tests` do not count. A test is a separate thing with its
-- own attempt limit and, often, a fixed window that closes; requiring a pass
-- would leave a student who missed one Saturday paper without a certificate
-- for a course they finished, and nothing in the schema links a test to "the
-- end of the course" anyway. The admin approving the request can see the
-- student's record and reject it if a test result matters.
--
-- An item is complete when any of these is true:
--   status = 'completed'         what both the website and the app write;
--   progress_percentage >= 100   the website's "mark as complete" writes 100;
--   completed_at is not null     the app rewrites status to 'in_progress'
--                                when a finished video is watched again, but
--                                leaves completed_at alone. Rewatching a
--                                lesson must not un-finish a course.
--
-- Only a student with an enrolment that was not cancelled is eligible. Free
-- lessons can be watched without enrolling, and a certificate says the course
-- was taken, not that its free previews were.

-- ---------------------------------------------------------------------------
-- Identifiers
-- ---------------------------------------------------------------------------

-- The serial in DE-CERT-2026-000123. It never restarts, so the number is
-- unique on its own; the year only says when the certificate was issued.
create sequence if not exists public.certificate_number_seq;
revoke all on sequence public.certificate_number_seq from public, anon, authenticated;

-- The code printed on the certificate and in its public URL. Twelve
-- characters from a 32-letter alphabet with no 0/O or 1/I to misread off
-- paper: 60 random bits, far past guessing, short enough to type. 256 is a
-- multiple of 32, so taking each byte modulo 32 has no bias.
create or replace function public.generate_certificate_code()
returns text
language plpgsql
volatile
set search_path = ''
as $f$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code text := '';
  i integer;
begin
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$f$;

revoke execute on function public.generate_certificate_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students(id) on delete cascade,
  course_id          uuid not null references public.courses(id) on delete cascade,
  status             text not null default 'pending'
                       check (status in ('pending', 'issued', 'rejected', 'revoked')),
  certificate_number text unique,
  verification_code  text not null unique default public.generate_certificate_code(),
  requested_at       timestamptz not null default now(),

  issued_at          timestamptz,
  issued_by          uuid references public.admin_users(id) on delete set null,

  rejected_at        timestamptz,
  rejected_by        uuid references public.admin_users(id) on delete set null,
  rejected_reason    text,

  revoked_at         timestamptz,
  revoked_by         uuid references public.admin_users(id) on delete set null,
  revoked_reason     text,

  -- Frozen at issue. A student who later changes their name, a course that is
  -- retitled, a new signatory in Settings: none of them may rewrite a
  -- certificate that has already been printed and shared.
  student_name       text,
  course_title       text,
  signatory_name     text,
  signatory_title    text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- One request per student per course. Completion fires on every progress
  -- write after the last lesson, and this is what makes that harmless.
  unique (student_id, course_id),

  constraint certificates_issued_is_complete check (
    status not in ('issued', 'revoked')
    or (certificate_number is not null
        and issued_at is not null
        and student_name is not null
        and course_title is not null)
  ),
  constraint certificates_rejection_has_reason check (
    status <> 'rejected' or (rejected_reason is not null and rejected_at is not null)
  ),
  constraint certificates_revocation_is_dated check (
    status <> 'revoked' or revoked_at is not null
  )
);

create index if not exists certificates_status_requested_idx
  on public.certificates (status, requested_at desc);
create index if not exists certificates_course_idx
  on public.certificates (course_id);

create or replace trigger certificates_updated_at
  before update on public.certificates
  for each row execute function public.update_updated_at();

alter table public.certificates enable row level security;

-- Every write goes through the functions below, which check the caller's role
-- and keep the number, the snapshot and the notification together. There is
-- deliberately no insert or update policy for anyone.
revoke all on table public.certificates from anon;

create policy certificates_self_read
  on public.certificates for select to authenticated
  using (student_id = public.current_student_id());

-- Support staff answer "where is my certificate?", so they can see the queue
-- without being able to act on it.
create policy certificates_staff_read
  on public.certificates for select to authenticated
  using (public.has_admin_role(
    array['super_admin', 'teacher', 'support_staff']::public.user_role[]));

-- Clearing a request entirely lets completion file a fresh one. Only the
-- owner may do that, since it also unpublishes an issued certificate.
create policy certificates_super_delete
  on public.certificates for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Eligibility
-- ---------------------------------------------------------------------------

-- Files a pending request for every student who has now completed the course,
-- or only for one student when p_student_id is given. Returns how many new
-- requests were filed. Safe to run any number of times.
create or replace function public.request_course_certificates(
  p_course_id uuid,
  p_student_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_filed integer;
begin
  -- A course part-way through being deleted cascades into its lessons, whose
  -- triggers land here. Filing a request against it would fail the delete.
  if not exists (select 1 from public.courses c where c.id = p_course_id) then
    return 0;
  end if;

  with items as (
    select ci.id
      from public.content_items ci
      join public.topics t   on t.id = ci.topic_id
      join public.subjects s on s.id = t.subject_id
     where s.course_id = p_course_id
       and ci.status = 'published'
       and coalesce(s.is_visible, true)
       and coalesce(t.is_visible, true)
  ),
  total as (
    select count(*) as n from items
  ),
  candidates as (
    select distinct e.student_id
      from public.enrollments e
     where e.course_id = p_course_id
       and e.status <> 'cancelled'
       and (p_student_id is null or e.student_id = p_student_id)
  ),
  finished as (
    select c.student_id
      from candidates c
      cross join total
     where total.n > 0
       and (
         select count(*)
           from public.student_progress sp
           join items i on i.id = sp.content_item_id
          where sp.student_id = c.student_id
            and (sp.status = 'completed'
                 or sp.progress_percentage >= 100
                 or sp.completed_at is not null)
       ) = total.n
  )
  insert into public.certificates (student_id, course_id)
  select f.student_id, p_course_id
    from finished f
  on conflict (student_id, course_id) do nothing;

  get diagnostics v_filed = row_count;
  return v_filed;
end;
$f$;

revoke execute on function public.request_course_certificates(uuid, uuid)
  from public, anon, authenticated;

-- A lesson has just been finished: check whether it was the last one.
create or replace function public.certificates_on_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_course uuid;
begin
  if not (new.status = 'completed'
          or new.progress_percentage >= 100
          or new.completed_at is not null) then
    return null;
  end if;

  -- Already finished before this write: the app keeps writing the playback
  -- position of a finished video every few seconds, and none of those writes
  -- can complete a course that the first one did not.
  if tg_op = 'UPDATE'
     and (old.status = 'completed'
          or old.progress_percentage >= 100
          or old.completed_at is not null) then
    return null;
  end if;

  select s.course_id into v_course
    from public.content_items ci
    join public.topics t   on t.id = ci.topic_id
    join public.subjects s on s.id = t.subject_id
   where ci.id = new.content_item_id;

  if v_course is not null then
    perform public.request_course_certificates(v_course, new.student_id);
  end if;

  return null;
end;
$f$;

revoke execute on function public.certificates_on_progress() from public, anon, authenticated;

create or replace trigger student_progress_request_certificate
  after insert or update of status, progress_percentage, completed_at
  on public.student_progress
  for each row execute function public.certificates_on_progress();

-- The other way a course becomes complete: the one lesson a student had not
-- done is unpublished, deleted or hidden, or the topic or subject holding it
-- is. Rare, so the whole course is rechecked rather than working out who it
-- affects.
--
-- Deleting a topic cascades into its lessons, whose own triggers can no
-- longer find the topic to resolve the course; the topic's trigger covers
-- that case. It runs after the cascade, because a table's AFTER triggers fire
-- in name order and the foreign-key ones are named "RI_ConstraintTrigger...".
create or replace function public.certificates_on_syllabus_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_course uuid;
begin
  if tg_table_name = 'content_items' then
    select s.course_id into v_course
      from public.topics t
      join public.subjects s on s.id = t.subject_id
     where t.id = old.topic_id;
  elsif tg_table_name = 'topics' then
    select s.course_id into v_course
      from public.subjects s
     where s.id = old.subject_id;
  elsif tg_table_name = 'subjects' then
    v_course := old.course_id;
  end if;

  if v_course is not null then
    perform public.request_course_certificates(v_course, null);
  end if;

  return null;
end;
$f$;

revoke execute on function public.certificates_on_syllabus_change() from public, anon, authenticated;

create or replace trigger content_items_certificate_unpublished
  after update of status on public.content_items
  for each row
  when (old.status = 'published' and new.status <> 'published')
  execute function public.certificates_on_syllabus_change();

create or replace trigger content_items_certificate_removed
  after delete on public.content_items
  for each row
  when (old.status = 'published')
  execute function public.certificates_on_syllabus_change();

create or replace trigger topics_certificate_hidden
  after update of is_visible on public.topics
  for each row
  when (old.is_visible and not new.is_visible)
  execute function public.certificates_on_syllabus_change();

create or replace trigger subjects_certificate_hidden
  after update of is_visible on public.subjects
  for each row
  when (old.is_visible and not new.is_visible)
  execute function public.certificates_on_syllabus_change();

create or replace trigger topics_certificate_removed
  after delete on public.topics
  for each row
  when (old.is_visible)
  execute function public.certificates_on_syllabus_change();

create or replace trigger subjects_certificate_removed
  after delete on public.subjects
  for each row
  when (old.is_visible)
  execute function public.certificates_on_syllabus_change();

-- ---------------------------------------------------------------------------
-- Admin decisions
-- ---------------------------------------------------------------------------

-- Super admin and teacher may approve and reject. A teacher is the person who
-- knows whether a student actually did the course, and the owner should not
-- have to be the bottleneck on every request. Revoking is super admin only:
-- it withdraws a document the student may already have shown a school.

-- Issues every listed request that is pending (or was rejected and is being
-- reconsidered). Rows in any other state are skipped, so a double-click or two
-- admins approving the same queue cannot issue anything twice. Returns one row
-- per certificate issued, with the inbox notification the student was sent.
create or replace function public.approve_certificates(p_ids uuid[])
returns table (
  certificate_id uuid,
  student_id uuid,
  verification_code text,
  notification_id uuid
)
language plpgsql
security definer
set search_path = ''
as $f$
#variable_conflict use_column
declare
  v_admin uuid;
  v_signatory_name text;
  v_signatory_title text;
  v_number text;
  v_notification uuid;
  r record;
begin
  if not public.has_admin_role(array['super_admin', 'teacher']::public.user_role[]) then
    raise exception 'Only a super admin or a teacher can approve certificates'
      using errcode = '42501';
  end if;

  select au.id into v_admin
    from public.admin_users au
   where au.user_id = auth.uid()
     and au.is_active
   limit 1;

  -- Settings -> Platform -> Certificates. Defaults so that an unconfigured
  -- signatory prints a sensible line rather than an empty one.
  select coalesce(nullif(btrim(ss.value #>> '{}'), ''), 'Director')
    into v_signatory_name
    from public.site_settings ss
   where ss.key = 'certificate_signatory_name';
  select coalesce(nullif(btrim(ss.value #>> '{}'), ''), 'Dream Edge Online')
    into v_signatory_title
    from public.site_settings ss
   where ss.key = 'certificate_signatory_title';
  v_signatory_name := coalesce(v_signatory_name, 'Director');
  v_signatory_title := coalesce(v_signatory_title, 'Dream Edge Online');

  for r in
    select c.id, c.student_id, c.course_id, c.certificate_number,
           c.verification_code, st.full_name, co.title
      from public.certificates c
      join public.students st on st.id = c.student_id
      join public.courses co  on co.id = c.course_id
     where c.id = any(p_ids)
       and c.status in ('pending', 'rejected')
     order by c.requested_at
       for update of c
  loop
    v_number := coalesce(
      r.certificate_number,
      'DE-CERT-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-'
        || lpad(nextval('public.certificate_number_seq')::text, 6, '0')
    );

    update public.certificates c
       set status = 'issued',
           certificate_number = v_number,
           issued_at = now(),
           issued_by = v_admin,
           student_name = r.full_name,
           course_title = r.title,
           signatory_name = v_signatory_name,
           signatory_title = v_signatory_title,
           rejected_at = null,
           rejected_by = null,
           rejected_reason = null
     where c.id = r.id;

    insert into public.notifications
      (title, message, channel, action_url, target_type, target_id, course_id, sent_by)
    values (
      'Your certificate is ready',
      'Congratulations! Your certificate for ' || r.title
        || ' has been issued. Open it to print, save or share.',
      'in_app',
      '/dashboard/certificates',
      'student',
      r.student_id,
      r.course_id,
      v_admin
    )
    returning id into v_notification;

    insert into public.student_notifications (student_id, notification_id)
    values (r.student_id, v_notification);

    certificate_id := r.id;
    student_id := r.student_id;
    verification_code := r.verification_code;
    notification_id := v_notification;
    return next;
  end loop;
end;
$f$;

revoke execute on function public.approve_certificates(uuid[]) from public, anon;
grant execute on function public.approve_certificates(uuid[]) to authenticated;

create or replace function public.reject_certificate(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_admin_role(array['super_admin', 'teacher']::public.user_role[]) then
    raise exception 'Only a super admin or a teacher can reject certificates'
      using errcode = '42501';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Give the student a reason' using errcode = '22023';
  end if;

  update public.certificates c
     set status = 'rejected',
         rejected_at = now(),
         rejected_by = (select au.id from public.admin_users au
                         where au.user_id = auth.uid() and au.is_active limit 1),
         rejected_reason = left(v_reason, 500)
   where c.id = p_id
     and c.status = 'pending';

  if not found then
    raise exception 'That request is no longer pending' using errcode = 'P0002';
  end if;
end;
$f$;

revoke execute on function public.reject_certificate(uuid, text) from public, anon;
grant execute on function public.reject_certificate(uuid, text) to authenticated;

create or replace function public.revoke_certificate(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can revoke a certificate'
      using errcode = '42501';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Record why it is being revoked' using errcode = '22023';
  end if;

  update public.certificates c
     set status = 'revoked',
         revoked_at = now(),
         revoked_by = (select au.id from public.admin_users au
                        where au.user_id = auth.uid() and au.is_active limit 1),
         revoked_reason = left(v_reason, 500)
   where c.id = p_id
     and c.status = 'issued';

  if not found then
    raise exception 'Only an issued certificate can be revoked' using errcode = 'P0002';
  end if;
end;
$f$;

revoke execute on function public.revoke_certificate(uuid, text) from public, anon;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public verification
-- ---------------------------------------------------------------------------

-- What anyone holding the code may learn: that the certificate exists, whose
-- it is, for what, when, and whether it still stands. Not why it was revoked,
-- not the student's contact details, and nothing at all about a request that
-- was never issued. Accepts the code with or without its dashes and in any
-- case, since people type it off paper.
create or replace function public.verify_certificate(p_code text)
returns table (
  certificate_number text,
  student_name text,
  course_title text,
  signatory_name text,
  signatory_title text,
  issued_at timestamptz,
  revoked_at timestamptz,
  status text,
  verification_code text
)
language sql
stable
security definer
set search_path = ''
as $f$
  select c.certificate_number,
         c.student_name,
         c.course_title,
         c.signatory_name,
         c.signatory_title,
         c.issued_at,
         c.revoked_at,
         case when c.status = 'revoked' then 'revoked' else 'valid' end,
         c.verification_code
    from public.certificates c
   where c.verification_code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
     and c.status in ('issued', 'revoked')
   limit 1;
$f$;

revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Students who finished a course before this existed get their requests now.
select public.request_course_certificates(c.id) from public.courses c;
