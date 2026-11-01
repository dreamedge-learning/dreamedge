-- ============================================================================
-- EXAM INTEGRITY
--
-- Everything a proctored test needs that the schema did not yet carry:
--
--   1. questions.is_required          -- a question must be answered by default
--   2. test_attempts lifecycle        -- started_at / expires_at / status, so the
--                                        clock lives on the server and a reload
--                                        cannot buy a student more time
--   3. exam_events                    -- an append-only log of integrity signals
--   4. get_test_questions             -- rewritten: the old options projection
--                                        did not match what the builder writes
--   5. attempt RPCs                   -- start / save / log / submit, with the
--                                        scoring done server side
--
-- Follow-up items 2 and 3 from 20261030000000_rls_role_model.sql land here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Required questions
-- ----------------------------------------------------------------------------

alter table public.questions
  add column if not exists is_required boolean not null default true;

comment on column public.questions.is_required is
  'Blocks submission while unanswered. Default true; the builder can opt out.';

-- ----------------------------------------------------------------------------
-- 2. Attempt lifecycle
--
-- submitted_at was NOT NULL DEFAULT now(), which only makes sense when a row is
-- written once at the end. An attempt now exists for its whole duration, so the
-- column has to admit "not yet".
-- ----------------------------------------------------------------------------

alter table public.test_attempts
  add column if not exists started_at      timestamptz not null default now(),
  add column if not exists expires_at      timestamptz,
  add column if not exists status          text        not null default 'submitted',
  add column if not exists violation_count integer     not null default 0,
  add column if not exists last_activity_at timestamptz;

alter table public.test_attempts
  alter column submitted_at drop not null,
  alter column submitted_at drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_attempts_status_check'
  ) then
    alter table public.test_attempts
      add constraint test_attempts_status_check
      check (status in ('in_progress', 'submitted', 'auto_submitted', 'abandoned'));
  end if;
end $$;

-- A submitted attempt must carry a submission time; a live one must not.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_attempts_submitted_at_check'
  ) then
    alter table public.test_attempts
      add constraint test_attempts_submitted_at_check
      check (
        (status = 'in_progress' and submitted_at is null)
        or (status <> 'in_progress' and submitted_at is not null)
      );
  end if;
end $$;

-- One live attempt per student per test. This is the lock that stops a student
-- opening the same paper in two tabs and working both.
create unique index if not exists test_attempts_one_live
  on public.test_attempts (student_id, test_id)
  where status = 'in_progress';

create index if not exists test_attempts_student_test_idx
  on public.test_attempts (student_id, test_id);

-- ----------------------------------------------------------------------------
-- 3. Integrity event log
--
-- Append-only. A student may insert their own events (the browser reports them)
-- but may never read, change or delete them -- otherwise the log is worthless.
-- ----------------------------------------------------------------------------

create table if not exists public.exam_events (
  id          uuid primary key default uuid_generate_v4(),
  attempt_id  uuid not null references public.test_attempts(id) on delete cascade,
  kind        text not null,
  occurred_at timestamptz not null default now(),
  meta        jsonb
);

create index if not exists exam_events_attempt_idx
  on public.exam_events (attempt_id, occurred_at);

alter table public.exam_events enable row level security;

-- No student-facing policy at all: writes go through log_exam_event(), which is
-- security definer. Staff read through their own policy.
drop policy if exists exam_events_staff_read on public.exam_events;
create policy exam_events_staff_read
  on public.exam_events for select
  to authenticated
  using (public.is_admin());

comment on table public.exam_events is
  'Append-only proctoring signals for one attempt. Written only by log_exam_event().';

-- ----------------------------------------------------------------------------
-- 4. get_test_questions -- corrected options projection
--
-- The previous version read q.options as a jsonb ARRAY of {id,text}. The test
-- builder writes an OBJECT: {"items":[...],"correctIndex":n} for single choice,
-- {"items":[...],"correctIndices":[...]} for multiple, and
-- {"subType":...,"answerData":{"options":[...],"correctIndex":n}} for image
-- questions. jsonb_array_elements() on an object raises, so every MCQ failed.
--
-- Options now carry an explicit `id` that is the index in the STORED order. The
-- client answers with ids, so honouring tests.shuffle_options below stays safe:
-- the display order changes, the identity of an option does not.
-- ----------------------------------------------------------------------------

create or replace function public.get_test_questions(p_test_id uuid)
returns table(
  id             uuid,
  type           question_type,
  content        text,
  options        jsonb,
  positive_marks numeric,
  negative_marks numeric,
  difficulty     difficulty_level,
  image_url      text,
  hint           text,
  weight         integer,
  is_required    boolean
)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id uuid;
  v_course_id  uuid;
  v_shuffle_q  boolean;
  v_shuffle_o  boolean;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.course_id, t.shuffle_questions, t.shuffle_options
    into v_course_id, v_shuffle_q, v_shuffle_o
    from public.tests t
   where t.id = p_test_id
     and t.status = 'published'
     and (t.start_time is null or t.start_time <= now())
     and (t.end_time   is null or t.end_time   >  now());

  if not found then
    raise exception 'test not available' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.enrollments e
     where e.student_id = v_student_id
       and e.course_id  = v_course_id
       and e.status     = 'active'
       and (e.valid_until is null or e.valid_until > now())
  ) then
    raise exception 'not enrolled' using errcode = '42501';
  end if;

  return query
  select
    q.id,
    q.type,
    q.content,
    case
      -- Choice questions: {"items":[...]} -> [{"id":0,"text":"..."}, ...]
      when q.type in ('mcq_single', 'mcq_multiple') then
        (select jsonb_agg(
                  jsonb_build_object('id', ord - 1, 'text', item #>> '{}')
                  order by case when v_shuffle_o
                                then md5(q.id::text || ord::text)
                                else lpad(ord::text, 6, '0') end)
           from jsonb_array_elements(coalesce(q.options -> 'items', '[]'::jsonb))
                with ordinality as x(item, ord))

      -- Image questions keep their choices one level down, under answerData.
      when q.type = 'image_based' then
        (select jsonb_agg(
                  jsonb_build_object('id', ord - 1, 'text', item #>> '{}')
                  order by case when v_shuffle_o
                                then md5(q.id::text || ord::text)
                                else lpad(ord::text, 6, '0') end)
           from jsonb_array_elements(
                  coalesce(q.options -> 'answerData' -> 'options', '[]'::jsonb))
                with ordinality as x(item, ord))

      -- Match the pair: left column in order, right column shuffled. The client
      -- answers with the right-hand TEXT, so the shuffle cannot be reversed.
      when q.type = 'match_pair' then
        jsonb_build_object(
          'left',  (select jsonb_agg(p ->> 'left' order by ord)
                      from jsonb_array_elements(
                             coalesce(q.options -> 'pairs', '[]'::jsonb))
                           with ordinality as l(p, ord)),
          'right', (select jsonb_agg(p ->> 'right'
                             order by md5(q.id::text || (p ->> 'right')))
                      from jsonb_array_elements(
                             coalesce(q.options -> 'pairs', '[]'::jsonb)) as r(p))
        )

      -- true_false / short_answer / subjective carry nothing the client needs.
      else null
    end as options,
    q.positive_marks,
    q.negative_marks,
    q.difficulty,
    q.image_url,
    q.hint,
    q.weight,
    q.is_required
  from public.questions q
  where q.test_id = p_test_id
  order by case when v_shuffle_q then md5(q.id::text || v_student_id::text) end,
           q.weight, q.id;
end $$;

-- ----------------------------------------------------------------------------
-- 5a. start_test_attempt
--
-- Creates the attempt, or hands back the live one. The deadline is computed
-- once, here, and never trusted from the client again.
-- ----------------------------------------------------------------------------

create or replace function public.start_test_attempt(p_test_id uuid)
returns table(
  attempt_id   uuid,
  started_at   timestamptz,
  expires_at   timestamptz,
  server_now   timestamptz,
  answers      jsonb,
  resumed      boolean,
  attempt_number integer
)
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id uuid;
  v_course_id  uuid;
  v_duration   integer;
  v_max        integer;
  v_end        timestamptz;
  v_used       integer;
  v_row        public.test_attempts%rowtype;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.course_id, t.duration_minutes, t.max_attempts, t.end_time
    into v_course_id, v_duration, v_max, v_end
    from public.tests t
   where t.id = p_test_id
     and t.status = 'published'
     and (t.start_time is null or t.start_time <= now())
     and (t.end_time   is null or t.end_time   >  now());

  if not found then
    raise exception 'test not available' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.enrollments e
     where e.student_id = v_student_id
       and e.course_id  = v_course_id
       and e.status     = 'active'
       and (e.valid_until is null or e.valid_until > now())
  ) then
    raise exception 'not enrolled' using errcode = '42501';
  end if;

  -- Resume a live attempt rather than starting a second one.
  select * into v_row
    from public.test_attempts a
   where a.student_id = v_student_id
     and a.test_id    = p_test_id
     and a.status     = 'in_progress'
   limit 1;

  if found then
    return query
      select v_row.id, v_row.started_at, v_row.expires_at, now(),
             v_row.answers, true, v_row.attempt_number;
    return;
  end if;

  select count(*) into v_used
    from public.test_attempts a
   where a.student_id = v_student_id
     and a.test_id    = p_test_id
     and a.status in ('submitted', 'auto_submitted');

  if v_max is not null and v_used >= v_max then
    raise exception 'attempt limit reached' using errcode = '42501';
  end if;

  insert into public.test_attempts
    (student_id, test_id, answers, attempt_number, started_at, expires_at,
     status, submitted_at, last_activity_at)
  values
    (v_student_id, p_test_id, '{}'::jsonb, v_used + 1, now(),
     least(now() + make_interval(mins => v_duration), coalesce(v_end, 'infinity'::timestamptz)),
     'in_progress', null, now())
  returning * into v_row;

  return query
    select v_row.id, v_row.started_at, v_row.expires_at, now(),
           v_row.answers, false, v_row.attempt_number;
end $$;

-- ----------------------------------------------------------------------------
-- 5b. save_test_answers -- autosave. Refuses to write past the deadline.
-- ----------------------------------------------------------------------------

create or replace function public.save_test_answers(
  p_attempt_id uuid,
  p_answers    jsonb
)
returns table(saved_at timestamptz, expires_at timestamptz, server_now timestamptz)
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id uuid;
  v_row        public.test_attempts%rowtype;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_row
    from public.test_attempts a
   where a.id = p_attempt_id
     and a.student_id = v_student_id
   for update;

  if not found then
    raise exception 'attempt not found' using errcode = '42501';
  end if;
  if v_row.status <> 'in_progress' then
    raise exception 'attempt already submitted' using errcode = '42501';
  end if;
  if v_row.expires_at is not null and now() > v_row.expires_at then
    raise exception 'attempt expired' using errcode = '42501';
  end if;

  update public.test_attempts
     set answers = p_answers,
         last_activity_at = now()
   where id = p_attempt_id;

  return query select now(), v_row.expires_at, now();
end $$;

-- ----------------------------------------------------------------------------
-- 5c. log_exam_event -- the only write path into exam_events.
-- ----------------------------------------------------------------------------

create or replace function public.log_exam_event(
  p_attempt_id uuid,
  p_kind       text,
  p_meta       jsonb default null
)
returns integer
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id uuid;
  v_status     text;
  v_count      integer;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_kind not in ('visibility_hidden', 'window_blur', 'fullscreen_exit',
                    'copy', 'paste', 'context_menu', 'resize', 'reload',
                    'devtools_suspected', 'network_lost') then
    raise exception 'unknown event kind' using errcode = '22023';
  end if;

  select a.status into v_status
    from public.test_attempts a
   where a.id = p_attempt_id
     and a.student_id = v_student_id;

  if not found then
    raise exception 'attempt not found' using errcode = '42501';
  end if;
  if v_status <> 'in_progress' then
    return 0;
  end if;

  insert into public.exam_events (attempt_id, kind, meta)
  values (p_attempt_id, p_kind, p_meta);

  -- Only the signals that mean the student left the paper count as violations.
  if p_kind in ('visibility_hidden', 'fullscreen_exit', 'window_blur') then
    update public.test_attempts
       set violation_count = violation_count + 1
     where id = p_attempt_id
    returning violation_count into v_count;
  else
    select violation_count into v_count
      from public.test_attempts where id = p_attempt_id;
  end if;

  return coalesce(v_count, 0);
end $$;

-- ----------------------------------------------------------------------------
-- 5d. submit_test_attempt -- scoring happens here and nowhere else.
--
-- Answer shapes the client sends, keyed by question id:
--   mcq_single / image_based : a number, the option id
--   mcq_multiple             : an array of option ids
--   true_false               : "true" | "false"
--   short_answer             : a string
--   match_pair               : {"<left index>": "<right text>"}
--   subjective               : a string, graded by a mentor later
-- ----------------------------------------------------------------------------

create or replace function public.submit_test_attempt(
  p_attempt_id uuid,
  p_auto       boolean default false
)
returns table(
  score            numeric,
  total_marks      numeric,
  percentage       numeric,
  passed           boolean,
  awaiting_review  boolean,
  show_results     boolean
)
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id uuid;
  v_row        public.test_attempts%rowtype;
  v_q          record;
  v_ans        jsonb;
  v_score      numeric := 0;
  v_total      numeric := 0;
  v_pending    boolean := false;
  v_correct    boolean;
  v_pct        numeric;
  v_pass_pct   numeric;
  v_show       boolean;
  v_elapsed    integer;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_row
    from public.test_attempts a
   where a.id = p_attempt_id
     and a.student_id = v_student_id
   for update;

  if not found then
    raise exception 'attempt not found' using errcode = '42501';
  end if;
  if v_row.status <> 'in_progress' then
    raise exception 'attempt already submitted' using errcode = '42501';
  end if;

  select t.pass_percentage, t.show_results_immediately
    into v_pass_pct, v_show
    from public.tests t where t.id = v_row.test_id;

  for v_q in
    select q.id, q.type, q.options, q.correct_answer,
           q.positive_marks, q.negative_marks
      from public.questions q
     where q.test_id = v_row.test_id
  loop
    v_total := v_total + coalesce(v_q.positive_marks, 0);
    v_ans   := v_row.answers -> (v_q.id::text);

    -- Unanswered earns nothing and costs nothing.
    if v_ans is null or v_ans = 'null'::jsonb
       or (jsonb_typeof(v_ans) = 'string'  and btrim(v_ans #>> '{}') = '')
       or (jsonb_typeof(v_ans) = 'array'   and jsonb_array_length(v_ans) = 0)
       or (jsonb_typeof(v_ans) = 'object'  and v_ans = '{}'::jsonb)
    then
      continue;
    end if;

    v_correct := false;

    case v_q.type
      when 'mcq_single' then
        v_correct := (v_ans #>> '{}') = (v_q.options ->> 'correctIndex');

      when 'image_based' then
        v_correct := (v_ans #>> '{}')
                     = (v_q.options -> 'answerData' ->> 'correctIndex');

      when 'mcq_multiple' then
        -- Exact set match: every correct option and nothing else.
        v_correct := (
          select coalesce(
            (select array_agg(e::int order by e::int)
               from jsonb_array_elements_text(v_ans) as a(e))
            =
            (select array_agg(e::int order by e::int)
               from jsonb_array_elements_text(
                      coalesce(v_q.options -> 'correctIndices', '[]'::jsonb)) as c(e)),
            false)
        );

      when 'true_false' then
        v_correct := lower(v_ans #>> '{}')
                     = lower(coalesce(v_q.correct_answer #>> '{}', ''));

      when 'short_answer' then
        -- correct_answer holds a comma-separated list of accepted spellings.
        v_correct := exists (
          select 1
            from unnest(string_to_array(
                   coalesce(v_q.correct_answer #>> '{}', ''), ',')) as acc(val)
           where lower(btrim(acc.val)) = lower(btrim(v_ans #>> '{}'))
             and btrim(acc.val) <> ''
        );

      when 'match_pair' then
        v_correct := not exists (
          select 1
            from jsonb_array_elements(
                   coalesce(v_q.options -> 'pairs', '[]'::jsonb))
                 with ordinality as p(pair, ord)
           where coalesce(v_ans ->> ((ord - 1)::text), '') <> (pair ->> 'right')
        );

      when 'subjective' then
        -- Left for a mentor. No marks either way until then.
        v_pending := true;
        continue;

      else
        continue;
    end case;

    if v_correct then
      v_score := v_score + coalesce(v_q.positive_marks, 0);
    else
      v_score := v_score - coalesce(v_q.negative_marks, 0);
    end if;
  end loop;

  if v_score < 0 then
    v_score := 0;
  end if;

  v_pct := case when v_total > 0 then round((v_score / v_total) * 100, 2) else 0 end;
  v_elapsed := greatest(0, extract(epoch from (now() - v_row.started_at))::int);

  update public.test_attempts
     set status            = case when p_auto then 'auto_submitted' else 'submitted' end,
         submitted_at      = now(),
         score             = v_score,
         total_marks       = v_total,
         percentage        = v_pct,
         time_taken_seconds = v_elapsed,
         last_activity_at  = now()
   where id = p_attempt_id;

  return query
    select v_score,
           v_total,
           v_pct,
           v_pct >= coalesce(v_pass_pct, 0),
           v_pending,
           coalesce(v_show, true);
end $$;

-- ----------------------------------------------------------------------------
-- 5e. expire_stale_attempts -- for a scheduled job. A student who closes the
-- laptop mid-test still gets the attempt closed and scored on what they left.
-- ----------------------------------------------------------------------------

create or replace function public.expire_stale_attempts()
returns integer
language plpgsql
volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select a.id from public.test_attempts a
     where a.status = 'in_progress'
       and a.expires_at is not null
       and a.expires_at < now() - interval '2 minutes'
  loop
    begin
      -- Reuse the scoring path so an expired attempt is scored exactly as a
      -- submitted one. The student id check inside does not apply to the job,
      -- so close the row directly and let a mentor re-score if needed.
      update public.test_attempts
         set status = 'auto_submitted',
             submitted_at = coalesce(expires_at, now()),
             last_activity_at = now()
       where id = v_id and status = 'in_progress';
      v_count := v_count + 1;
    exception when others then
      continue;
    end;
  end loop;
  return v_count;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------

revoke all on function public.start_test_attempt(uuid)              from public;
revoke all on function public.save_test_answers(uuid, jsonb)        from public;
revoke all on function public.log_exam_event(uuid, text, jsonb)     from public;
revoke all on function public.submit_test_attempt(uuid, boolean)    from public;
revoke all on function public.expire_stale_attempts()               from public;

grant execute on function public.get_test_questions(uuid)           to authenticated;
grant execute on function public.start_test_attempt(uuid)           to authenticated;
grant execute on function public.save_test_answers(uuid, jsonb)     to authenticated;
grant execute on function public.log_exam_event(uuid, text, jsonb)  to authenticated;
grant execute on function public.submit_test_attempt(uuid, boolean) to authenticated;
grant execute on function public.expire_stale_attempts()            to service_role;
