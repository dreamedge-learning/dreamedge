-- ---------------------------------------------------------------------------
-- Doubts: a student's question on a lesson, and the thread that answers it.
--
-- A doubt belongs to one student and one lesson (`content_items` row) and is
-- private between that student and the teaching staff. Other students never
-- see it -- a Class 8 child asking about something they did not follow should
-- not have the question read by the rest of the batch.
--
-- The thread is `doubt_replies`. The opening question lives on the doubt row
-- itself, so a doubt with no replies is a complete record; each reply is
-- either the student following up or a teacher answering. A teacher's reply
-- marks the doubt answered and puts a notice in the student's inbox; a
-- student's follow-up puts it back in the open queue.
--
-- Most of the rules are enforced here rather than in the website or the app,
-- because both talk to these tables directly with the student's own token:
--
--   * who the author is, which student owns a doubt and which course it is
--     filed under are set by triggers from the session, never taken from the
--     request body;
--   * a student may only ask about a lesson they are entitled to, using the
--     same `check_offline_entitlements` rule that decides whether they may
--     watch it;
--   * asking is rate limited per student through `check_rate_limit`, so a
--     runaway client (or a bored child) cannot bury the inbox;
--   * an attached photo must already be in the student's own folder of the
--     `doubt-images` bucket, so a crafted path cannot attach somebody else's.
-- ---------------------------------------------------------------------------

create table public.doubts (
  id               uuid        primary key default gen_random_uuid(),
  student_id       uuid        not null references public.students(id) on delete cascade,
  content_item_id  uuid        not null references public.content_items(id) on delete cascade,
  -- Denormalised from content_items -> topics -> subjects so the inbox can
  -- filter by course without a three-table join on every page.
  course_id        uuid        not null references public.courses(id) on delete cascade,
  body             text        not null,
  image_path       text,
  status           text        not null default 'open',
  assigned_to      uuid        references public.admin_users(id) on delete set null,
  created_at       timestamptz not null default now(),
  -- Last activity on the doubt or its thread. The inbox sorts on it.
  updated_at       timestamptz not null default now(),
  answered_at      timestamptz,
  closed_at        timestamptz,
  constraint doubts_status_check
    check (status in ('open', 'answered', 'closed')),
  -- Long enough for a worked step or two, short enough that it is a question
  -- rather than a pasted chapter.
  constraint doubts_body_length
    check (char_length(btrim(body)) between 5 and 2000),
  constraint doubts_image_path_length
    check (image_path is null or char_length(image_path) between 1 and 300)
);

create table public.doubt_replies (
  id                 uuid        primary key default gen_random_uuid(),
  doubt_id           uuid        not null references public.doubts(id) on delete cascade,
  author_kind        text        not null,
  author_student_id  uuid        references public.students(id) on delete cascade,
  -- Set null rather than cascade: a teacher leaving must not delete the
  -- answers they gave. `author_kind` and `author_name` still say who it was.
  author_admin_id    uuid        references public.admin_users(id) on delete set null,
  -- Copied at insert time. A student cannot read `admin_users`, and the
  -- thread has to say who answered.
  author_name        text        not null,
  body               text        not null,
  image_path         text,
  created_at         timestamptz not null default now(),
  constraint doubt_replies_author_check check (
    (author_kind = 'student' and author_student_id is not null and author_admin_id is null)
    or (author_kind = 'admin' and author_student_id is null)
  ),
  constraint doubt_replies_body_length
    check (char_length(btrim(body)) between 1 and 2000),
  constraint doubt_replies_image_path_length
    check (image_path is null or char_length(image_path) between 1 and 300)
);

-- The student's own list, and the per-lesson panel.
create index doubts_student_created_idx on public.doubts (student_id, created_at desc);
create index doubts_content_item_idx    on public.doubts (content_item_id, student_id);
-- The staff inbox: by status, most recent activity first.
create index doubts_status_updated_idx  on public.doubts (status, updated_at desc);
create index doubts_course_idx          on public.doubts (course_id);
create index doubts_assigned_to_idx     on public.doubts (assigned_to);

create index doubt_replies_doubt_idx          on public.doubt_replies (doubt_id, created_at);
create index doubt_replies_author_student_idx on public.doubt_replies (author_student_id);
create index doubt_replies_author_admin_idx   on public.doubt_replies (author_admin_id);

-- ---------------------------------------------------------------------------
-- Privileges. Nothing here is for anonymous visitors. Signed-in users keep
-- SELECT, INSERT and (on doubts) UPDATE, and the policies below decide which
-- rows; nobody deletes through the API, because a deleted doubt is a
-- conversation with a child that the centre can no longer account for.
-- ---------------------------------------------------------------------------
alter table public.doubts        enable row level security;
alter table public.doubt_replies enable row level security;

revoke all on public.doubts        from anon;
revoke all on public.doubt_replies from anon;
revoke delete, truncate, references, trigger on public.doubts from authenticated;
revoke update, delete, truncate, references, trigger on public.doubt_replies from authenticated;

-- ---------------------------------------------------------------------------
-- Policies.
--
-- Reading: the student who asked, plus super admin, teachers and support
-- staff. Support staff can see the queue (they field the "nobody answered my
-- question" calls) but only super admin and teachers answer or close.
-- ---------------------------------------------------------------------------
create policy doubts_read on public.doubts
  for select
  to authenticated
  using (
    student_id = (select public.current_student_id())
    or (select public.has_admin_role(array['super_admin', 'teacher', 'support_staff']::public.user_role[]))
  );

-- `student_id` has been filled from the session by the BEFORE trigger by the
-- time this runs, so the first clause is about the row, not the request.
create policy doubts_student_insert on public.doubts
  for insert
  to authenticated
  with check (
    student_id = (select public.current_student_id())
    and exists (select 1 from public.check_offline_entitlements(content_item_id))
  );

create policy doubts_staff_update on public.doubts
  for update
  to authenticated
  using ((select public.has_admin_role(array['super_admin', 'teacher']::public.user_role[])))
  with check ((select public.has_admin_role(array['super_admin', 'teacher']::public.user_role[])));

create policy doubt_replies_read on public.doubt_replies
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.doubts d
       where d.id = doubt_id
         and d.student_id = (select public.current_student_id())
    )
    or (select public.has_admin_role(array['super_admin', 'teacher', 'support_staff']::public.user_role[]))
  );

create policy doubt_replies_insert on public.doubt_replies
  for insert
  to authenticated
  with check (
    (
      author_kind = 'student'
      and exists (
        select 1
          from public.doubts d
         where d.id = doubt_id
           and d.student_id = (select public.current_student_id())
           and d.status <> 'closed'
      )
    )
    or (
      author_kind = 'admin'
      and (select public.has_admin_role(array['super_admin', 'teacher']::public.user_role[]))
    )
  );

-- ---------------------------------------------------------------------------
-- doubts_prepare_insert
--
-- Fills in everything about a new doubt that the caller must not choose:
-- whose it is, which course it belongs to, its status and timestamps. The
-- client sends the lesson, the text and optionally a photo path; anything
-- else in the request is overwritten.
--
-- Security definer because `check_rate_limit` is not executable by signed-in
-- users (it would let them reset their own counters) and because it checks
-- `storage.objects`, which they cannot read directly.
-- ---------------------------------------------------------------------------
create or replace function public.doubts_prepare_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_student_id uuid := public.current_student_id();
  v_course_id  uuid;
  v_rule       record;
  v_limit      jsonb;
  v_wait       integer;
begin
  if v_student_id is null then
    raise exception 'Only a signed-in student can ask a doubt.'
      using errcode = '42501';
  end if;

  select s.course_id
    into v_course_id
    from public.content_items ci
    join public.topics   t on t.id = ci.topic_id
    join public.subjects s on s.id = t.subject_id
   where ci.id = new.content_item_id;

  if v_course_id is null then
    raise exception 'That lesson could not be found.'
      using errcode = 'P0002';
  end if;

  new.student_id  := v_student_id;
  new.course_id   := v_course_id;
  new.body        := btrim(new.body);
  new.status      := 'open';
  new.assigned_to := null;
  new.answered_at := null;
  new.closed_at   := null;
  new.created_at  := now();
  new.updated_at  := now();

  -- The photo must be one this student uploaded, and it must exist. The
  -- prefix check is what stops a student attaching another student's
  -- notebook by guessing its path; the existence check stops a doubt pointing
  -- at nothing because an upload failed halfway.
  if new.image_path is not null then
    if left(new.image_path, 37) <> (auth.uid()::text || '/') -- uid (36) plus the slash
       or new.image_path !~* '\.(png|jpe?g|webp)$'
       or not exists (
         select 1
           from storage.objects o
          where o.bucket_id = 'doubt-images'
            and o.name = new.image_path
       ) then
      raise exception 'That photo could not be attached. Please upload it again.'
        using errcode = '22023';
    end if;
  end if;

  -- Two windows: a burst limit that stops a stuck client looping, and a daily
  -- ceiling that keeps one student from monopolising the teachers. Both are
  -- generous for a real student working through a chapter. The hit is only
  -- kept if the insert commits, so a refused doubt does not count.
  for v_rule in
    select *
      from (values ('doubt_ask_hour', 10, 3600),
                   ('doubt_ask_day',  30, 86400)) as r(bucket, max_hits, window_seconds)
  loop
    v_limit := public.check_rate_limit(
      v_rule.bucket, v_student_id::text, v_rule.max_hits, v_rule.window_seconds
    );

    if not coalesce((v_limit ->> 'allowed')::boolean, true) then
      v_wait := greatest(coalesce((v_limit ->> 'retry_after')::integer, 60), 60);
      -- PT429 is PostgREST's convention for "answer with HTTP 429", so both
      -- clients see a rate-limit status and can show this message as it is.
      raise exception '%', format(
        'You have asked a lot of doubts recently. Please try again in %s.',
        case
          when v_wait <= 60 then '1 minute'
          when v_wait <= 5400 then ceil(v_wait / 60.0)::integer || ' minutes'
          else ceil(v_wait / 3600.0)::integer || ' hours'
        end
      ) using errcode = 'PT429';
    end if;
  end loop;

  return new;
end;
$f$;

revoke execute on function public.doubts_prepare_insert() from public, anon, authenticated;

create or replace trigger doubts_prepare_insert
  before insert on public.doubts
  for each row execute function public.doubts_prepare_insert();

-- ---------------------------------------------------------------------------
-- doubts_guard_update
--
-- Staff may change a doubt's status and who it is assigned to. Everything
-- else is the student's question and stays as they wrote it.
--
-- Not security definer, on purpose, for the same reason as
-- `guard_student_managed_columns`: the test is on the effective role, and
-- inside a definer function that is always the owner. The reply trigger below
-- updates `answered_at` as the owner, which is how the one sanctioned path
-- gets past the guard.
-- ---------------------------------------------------------------------------
create or replace function public.doubts_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $f$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id              is distinct from old.id
       or new.student_id      is distinct from old.student_id
       or new.content_item_id is distinct from old.content_item_id
       or new.course_id       is distinct from old.course_id
       or new.body            is distinct from old.body
       or new.image_path      is distinct from old.image_path
       or new.created_at      is distinct from old.created_at
       or new.answered_at     is distinct from old.answered_at then
      raise exception 'Only the status and the assigned teacher of a doubt can be changed.'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();

  if new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := now();
  elsif new.status <> 'closed' then
    new.closed_at := null;
  end if;

  return new;
end;
$f$;

revoke execute on function public.doubts_guard_update() from public, anon, authenticated;

create or replace trigger doubts_guard_update
  before update on public.doubts
  for each row execute function public.doubts_guard_update();

-- ---------------------------------------------------------------------------
-- doubt_replies_prepare_insert
--
-- Decides who is writing. The student who owns the doubt is always the
-- student, even if the same account also holds an admin role (the owner's
-- own account does); anybody else must be super admin or a teacher.
--
-- A closed doubt takes no more follow-ups from the student: closing is the
-- teacher saying the matter is settled, and a new question belongs in a new
-- doubt where it will be seen as unanswered.
-- ---------------------------------------------------------------------------
create or replace function public.doubt_replies_prepare_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_owner      uuid;
  v_status     text;
  v_student_id uuid := public.current_student_id();
  v_prefix     text;
  v_limit      jsonb;
  v_wait       integer;
begin
  select d.student_id, d.status
    into v_owner, v_status
    from public.doubts d
   where d.id = new.doubt_id;

  if v_owner is null then
    raise exception 'That doubt could not be found.'
      using errcode = 'P0002';
  end if;

  if v_student_id is not null and v_student_id = v_owner then
    if v_status = 'closed' then
      raise exception 'This doubt has been closed. Ask a new doubt if you are still stuck.'
        using errcode = '42501';
    end if;

    new.author_kind       := 'student';
    new.author_student_id := v_student_id;
    new.author_admin_id   := null;
    select s.full_name into new.author_name
      from public.students s
     where s.id = v_student_id;
    v_prefix := auth.uid()::text || '/';

    v_limit := public.check_rate_limit('doubt_reply_hour', v_student_id::text, 30, 3600);
    if not coalesce((v_limit ->> 'allowed')::boolean, true) then
      v_wait := greatest(coalesce((v_limit ->> 'retry_after')::integer, 60), 60);
      raise exception '%', format(
        'You have sent a lot of messages recently. Please try again in %s.',
        case
          when v_wait <= 60 then '1 minute'
          else ceil(v_wait / 60.0)::integer || ' minutes'
        end
      ) using errcode = 'PT429';
    end if;
  elsif public.has_admin_role(array['super_admin', 'teacher']::public.user_role[]) then
    select au.id, au.full_name
      into new.author_admin_id, new.author_name
      from public.admin_users au
     where au.user_id = auth.uid()
       and au.is_active;

    new.author_kind       := 'admin';
    new.author_student_id := null;
    v_prefix := 'staff/' || auth.uid()::text || '/';
  else
    raise exception 'You cannot reply to this doubt.'
      using errcode = '42501';
  end if;

  new.body       := btrim(new.body);
  new.created_at := now();

  if new.image_path is not null then
    if left(new.image_path, char_length(v_prefix)) <> v_prefix
       or new.image_path !~* '\.(png|jpe?g|webp)$'
       or not exists (
         select 1
           from storage.objects o
          where o.bucket_id = 'doubt-images'
            and o.name = new.image_path
       ) then
      raise exception 'That photo could not be attached. Please upload it again.'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$f$;

revoke execute on function public.doubt_replies_prepare_insert() from public, anon, authenticated;

create or replace trigger doubt_replies_prepare_insert
  before insert on public.doubt_replies
  for each row execute function public.doubt_replies_prepare_insert();

-- ---------------------------------------------------------------------------
-- doubt_replies_after_insert
--
-- Moves the doubt along. A teacher's reply marks it answered, assigns it to
-- that teacher if nobody had picked it up, and tells the student. A student's
-- follow-up on an answered doubt puts it back in the unanswered queue, which
-- is the only way a teacher would notice it.
--
-- The notice is an ordinary in-app notification so it lands in the inbox
-- both clients already have. It is tagged target_type 'doubt' (with the doubt
-- as target_id) so the admin's broadcast log can leave these out, and its
-- action URL is a path both the website and the app route.
-- ---------------------------------------------------------------------------
create or replace function public.doubt_replies_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_student_id   uuid;
  v_course_id    uuid;
  v_item_id      uuid;
  v_lesson       text;
  v_notification uuid;
begin
  if new.author_kind = 'admin' then
    update public.doubts d
       set status      = 'answered',
           answered_at = now(),
           assigned_to = coalesce(d.assigned_to, new.author_admin_id)
     where d.id = new.doubt_id
    returning d.student_id, d.course_id, d.content_item_id
         into v_student_id, v_course_id, v_item_id;

    select ci.title into v_lesson
      from public.content_items ci
     where ci.id = v_item_id;

    insert into public.notifications (
      title, message, channel, action_url, target_type, target_id, course_id, sent_by
    )
    values (
      'Your doubt has been answered',
      format('%s replied to your doubt on "%s".', new.author_name, coalesce(v_lesson, 'a lesson')),
      'in_app'::public.notification_channel,
      '/doubts/' || new.doubt_id::text,
      'doubt',
      new.doubt_id,
      v_course_id,
      new.author_admin_id
    )
    returning id into v_notification;

    insert into public.student_notifications (student_id, notification_id)
    values (v_student_id, v_notification);
  else
    update public.doubts d
       set status = case when d.status = 'answered' then 'open' else d.status end
     where d.id = new.doubt_id;
  end if;

  return null;
end;
$f$;

revoke execute on function public.doubt_replies_after_insert() from public, anon, authenticated;

create or replace trigger doubt_replies_after_insert
  after insert on public.doubt_replies
  for each row execute function public.doubt_replies_after_insert();

-- ---------------------------------------------------------------------------
-- admin_list_doubts
--
-- One page of the staff inbox, with the student, course and lesson resolved
-- and the total for the pager. A function rather than a PostgREST embed
-- because the search box looks at the question, the student's name and the
-- lesson title at once, and PostgREST cannot OR across embedded tables.
--
-- Security invoker: it reads through the caller's RLS, so a student calling
-- it sees only their own doubts and anybody else sees nothing.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_doubts(
  p_status    text    default null,
  p_course_id uuid    default null,
  p_search    text    default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
returns table (
  id              uuid,
  status          text,
  body            text,
  has_image       boolean,
  created_at      timestamptz,
  updated_at      timestamptz,
  answered_at     timestamptz,
  student_id      uuid,
  student_name    text,
  student_class   text,
  course_id       uuid,
  course_title    text,
  content_item_id uuid,
  lesson_title    text,
  assigned_to     uuid,
  assignee_name   text,
  reply_count     integer,
  total_count     bigint
)
language sql
stable
security invoker
set search_path = ''
as $f$
  with params as (
    select case
             when p_search is null or btrim(p_search) = '' then null
             -- Escape LIKE's wildcards so a search for "50%" means 50%.
             else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as pattern
  )
  select d.id,
         d.status,
         d.body,
         d.image_path is not null,
         d.created_at,
         d.updated_at,
         d.answered_at,
         d.student_id,
         s.full_name,
         s.class,
         d.course_id,
         c.title,
         d.content_item_id,
         ci.title,
         d.assigned_to,
         au.full_name,
         (select count(*)::integer from public.doubt_replies r where r.doubt_id = d.id),
         count(*) over ()
    from public.doubts d
    cross join params
    join public.students s            on s.id  = d.student_id
    left join public.courses c        on c.id  = d.course_id
    left join public.content_items ci on ci.id = d.content_item_id
    left join public.admin_users au   on au.id = d.assigned_to
   where (p_status is null or d.status = p_status)
     and (p_course_id is null or d.course_id = p_course_id)
     and (
       params.pattern is null
       or d.body      ilike params.pattern
       or s.full_name ilike params.pattern
       or ci.title    ilike params.pattern
     )
   order by d.updated_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$f$;

revoke execute on function public.admin_list_doubts(text, uuid, text, integer, integer) from public, anon;
grant  execute on function public.admin_list_doubts(text, uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- doubt-images: private. A photo of a child's notebook is not something to
-- put on a public CDN under a guessable name, so everything is read through
-- short-lived signed URLs.
--
-- Layout:
--   <student auth uid>/<uuid>.<ext>        the student's own uploads
--   staff/<admin auth uid>/<uuid>.<ext>    images a teacher attaches to a reply
--
-- Phone cameras produce large files; both clients scale a photo down before
-- uploading, so 5 MB is a ceiling for the odd one that slips through rather
-- than the expected size.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doubt-images',
  'doubt-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Doubt images are uploaded by students to their own folder" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'doubt-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.current_student_id()) is not null
  );

-- A student reads their own uploads, and any image a teacher attached to a
-- reply on one of their doubts. Only staff replies count: a student's own
-- reply images are already covered by the folder check, and counting them
-- here would let a reply that names another student's path unlock it.
create policy "Doubt images are readable by the student they concern" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'doubt-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
          from public.doubt_replies r
          join public.doubts d on d.id = r.doubt_id
         where r.image_path = objects.name
           and r.author_kind = 'admin'
           and d.student_id = (select public.current_student_id())
      )
    )
  );

create policy "Doubt images are readable by staff" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'doubt-images'
    and (select public.has_admin_role(array['super_admin', 'teacher', 'support_staff']::public.user_role[]))
  );

create policy "Doubt images are uploaded by teachers to their staff folder" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'doubt-images'
    and (storage.foldername(name))[1] = 'staff'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select public.has_admin_role(array['super_admin', 'teacher']::public.user_role[]))
  );

-- An upload can be taken back only while nothing points at it: the client
-- uploads first and then writes the doubt, and when the write is refused (a
-- rate limit, a lapsed enrolment) it removes the photo it just put there.
-- Once attached, the image is part of the record.
create policy "Unattached doubt images can be removed by their uploader" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'doubt-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        (storage.foldername(name))[1] = 'staff'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
    )
    and not exists (select 1 from public.doubts d where d.image_path = objects.name)
    and not exists (select 1 from public.doubt_replies r where r.image_path = objects.name)
  );
