-- ============================================================================
-- 20261101000000_missing_functions.sql
--
-- Captures functions that were hand-applied to the original Supabase project
-- but never written into a migration. Without this file the new project
-- (ubymqjdmeknoblkrlgrf) is missing every function below.
--
-- ADAPTATIONS FROM THE ORIGINALS:
--   - enroll_free_course: reads is_published (boolean) instead of the dropped
--     status (content_status) column. The new courses table has no status.
--   - sync_course_is_published: OMITTED — meaningless without a status column.
--   - admin_login_attempts: table created here (was hand-applied).
-- ============================================================================

begin;

-- ============================================================================
-- 1. ADMIN LOGIN ATTEMPTS — table + rate-limiting functions
-- ============================================================================

create table if not exists public.admin_login_attempts (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  ip         text,
  succeeded  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_login_attempts_email_recent
  on public.admin_login_attempts (lower(email), created_at)
  where succeeded = false;

alter table public.admin_login_attempts enable row level security;

create policy "admin_login_attempts_service_only"
  on public.admin_login_attempts for all
  to service_role
  using (true) with check (true);

-- admin_login_blocked: checks whether an email or IP has exceeded the
-- failure threshold (5 per email, 20 per IP in 15 minutes).
create or replace function public.admin_login_blocked(
  p_email text,
  p_ip    text default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email_fails int;
  v_ip_fails    int;
  v_oldest      timestamptz;
begin
  select count(*), min(created_at)
    into v_email_fails, v_oldest
    from public.admin_login_attempts
   where lower(email) = lower(coalesce(p_email, ''))
     and succeeded = false
     and created_at > now() - interval '15 minutes';

  select count(*)
    into v_ip_fails
    from public.admin_login_attempts
   where p_ip is not null
     and ip = p_ip
     and succeeded = false
     and created_at > now() - interval '15 minutes';

  if v_email_fails >= 5 or v_ip_fails >= 20 then
    return jsonb_build_object(
      'blocked', true,
      'retry_after_seconds',
        greatest(0, ceil(extract(epoch from
          (coalesce(v_oldest, now()) + interval '15 minutes' - now()))))::int
    );
  end if;

  return jsonb_build_object('blocked', false, 'remaining', 5 - v_email_fails);
end;
$$;

-- record_admin_login_attempt: logs a login attempt and prunes old records.
create or replace function public.record_admin_login_attempt(
  p_email     text,
  p_ip        text default null,
  p_succeeded boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.admin_login_attempts (email, ip, succeeded)
  values (left(coalesce(p_email, ''), 320), left(coalesce(p_ip, ''), 64), p_succeeded);

  if p_succeeded then
    delete from public.admin_login_attempts
     where lower(email) = lower(coalesce(p_email, ''))
       and succeeded = false;
  end if;

  -- Probabilistic cleanup: ~2% of calls prune entries older than 7 days.
  if random() < 0.02 then
    delete from public.admin_login_attempts
     where created_at < now() - interval '7 days';
  end if;
end;
$$;

-- touch_admin_last_login: stamps the current admin's last_login_at.
create or replace function public.touch_admin_last_login()
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.admin_users
     set last_login_at = now()
   where user_id = auth.uid();
$$;

-- Restrict the three admin-login helpers to authenticated only.
revoke execute on function public.admin_login_blocked(text, text) from public, anon;
revoke execute on function public.record_admin_login_attempt(text, text, boolean) from public, anon;
revoke execute on function public.touch_admin_last_login() from public, anon;
grant  execute on function public.admin_login_blocked(text, text) to authenticated;
grant  execute on function public.record_admin_login_attempt(text, text, boolean) to authenticated;
grant  execute on function public.touch_admin_last_login() to authenticated;

-- ============================================================================
-- 2. ENROLL_FREE_COURSE — the student enrolment path for free courses.
--    ADAPTED: uses is_published (boolean) instead of the dropped status column.
-- ============================================================================

create or replace function public.enroll_free_course(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id     uuid;
  v_price          numeric;
  v_validity_days  integer;
  v_is_published   boolean;
  v_valid_until    timestamptz;
  v_enrollment_id  uuid;
  v_was_new        boolean;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.price, c.validity_days, c.is_published
    into v_price, v_validity_days, v_is_published
    from public.courses c
   where c.id = p_course_id;

  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_published, false) then
    raise exception 'course is not available' using errcode = '42501';
  end if;

  if coalesce(v_price, 0) > 0 then
    raise exception 'course requires payment' using errcode = '42501';
  end if;

  v_valid_until := now() + make_interval(days => coalesce(v_validity_days, 365));

  insert into public.enrollments
    (student_id, course_id, status, purchased_at, valid_until)
  values
    (v_student_id, p_course_id, 'active', now(), v_valid_until)
  on conflict (student_id, course_id) do update
    set status      = 'active',
        valid_until = greatest(public.enrollments.valid_until, excluded.valid_until)
  returning id, (xmax = 0) into v_enrollment_id, v_was_new;

  if v_was_new then
    update public.courses
       set student_count = coalesce(student_count, 0) + 1,
           updated_at    = now()
     where id = p_course_id;
  end if;

  return jsonb_build_object(
    'ok',            true,
    'enrollment_id', v_enrollment_id,
    'was_new',       v_was_new,
    'valid_until',   v_valid_until
  );
end;
$$;

revoke execute on function public.enroll_free_course(uuid) from public, anon;
grant  execute on function public.enroll_free_course(uuid) to authenticated;

-- ============================================================================
-- 3. ENFORCE_REFUND_CAP — trigger prevents refund total from exceeding order.
-- ============================================================================

create or replace function public.enforce_refund_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order_total  numeric;
  v_already      numeric;
begin
  select o.final_amount into v_order_total
    from public.orders o where o.id = new.order_id;

  if v_order_total is null then
    raise exception 'order % not found', new.order_id;
  end if;

  select coalesce(sum(r.amount), 0) into v_already
    from public.refunds r
   where r.order_id = new.order_id
     and r.status in ('approved','processed')
     and r.id is distinct from new.id;

  if v_already + new.amount > v_order_total then
    raise exception
      'refund total %.2f would exceed order amount %.2f',
      v_already + new.amount, v_order_total
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_refund_cap on public.refunds;
create trigger trg_enforce_refund_cap
  before insert or update on public.refunds
  for each row
  execute function public.enforce_refund_cap();

-- ============================================================================
-- 4. TEST-TAKING RPCs — get_test_questions + submit_test_attempt
--    These are the SECURITY DEFINER functions that let students take tests
--    without exposing correct_answer through RLS.
-- ============================================================================

-- get_test_questions: returns questions for a published test the student is
-- enrolled in, with correct_answer / is_correct stripped from the response.
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
  weight         integer
)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id uuid;
  v_course_id  uuid;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.course_id into v_course_id
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
      when q.type in ('mcq_single','mcq_multiple','image_based') then
        (select jsonb_agg(jsonb_build_object('id', o->>'id', 'text', o->>'text')
                          order by ord)
           from jsonb_array_elements(coalesce(q.options, '[]'::jsonb))
                with ordinality as x(o, ord))
      when q.type = 'match_pair' then
        jsonb_build_object(
          'left',  (select jsonb_agg(p->>'left' order by ord)
                      from jsonb_array_elements(
                             coalesce(q.options->'pairs', '[]'::jsonb))
                           with ordinality as l(p, ord)),
          'right', (select jsonb_agg(p->>'right' order by md5(p->>'right'))
                      from jsonb_array_elements(
                             coalesce(q.options->'pairs', '[]'::jsonb)) as r(p))
        )
      else q.options
    end as options,
    q.positive_marks,
    q.negative_marks,
    q.difficulty,
    q.image_url,
    q.hint,
    q.weight
  from public.questions q
  where q.test_id = p_test_id
  order by q.weight, q.created_at;
end;
$$;

-- submit_test_attempt: server-side scoring. Auto-grades all types except
-- subjective and image_based. Enforces enrolment, attempt limits, and
-- serializes concurrent submissions per student+test.
create or replace function public.submit_test_attempt(
  p_test_id    uuid,
  p_answers    jsonb,
  p_started_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_student_id    uuid;
  v_course_id     uuid;
  v_max_attempts  integer;
  v_attempt_no    integer;
  v_pass_pct      numeric;
  v_score         numeric := 0;
  v_total         numeric := 0;
  v_pct           numeric := 0;
  v_attempt_id    uuid;
  q               record;
  v_given         jsonb;
  v_correct       boolean;
  v_answered      boolean;
  v_expected_set  jsonb;
  v_given_set     jsonb;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.course_id, t.max_attempts, t.pass_percentage
    into v_course_id, v_max_attempts, v_pass_pct
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

  perform pg_advisory_xact_lock(
    hashtext(v_student_id::text || p_test_id::text));

  select coalesce(max(a.attempt_number), 0) + 1
    into v_attempt_no
    from public.test_attempts a
   where a.student_id = v_student_id and a.test_id = p_test_id;

  if v_max_attempts is not null and v_attempt_no > v_max_attempts then
    raise exception 'attempt limit reached' using errcode = '42501';
  end if;

  for q in
    select * from public.questions where test_id = p_test_id
  loop
    v_given    := p_answers -> (q.id::text);
    v_answered := v_given is not null
                  and v_given <> 'null'::jsonb
                  and btrim(coalesce(v_given #>> '{}', '')) <> '';
    v_correct  := false;

    if q.type in ('subjective','image_based') then
      continue;
    end if;

    v_total := v_total + coalesce(q.positive_marks, 0);

    if v_answered then
      case q.type
        when 'mcq_single' then
          v_correct := exists (
            select 1
              from jsonb_array_elements(coalesce(q.options,'[]'::jsonb)) o
             where (o->>'is_correct')::boolean is true
               and o->>'id' = (v_given #>> '{}')
          );

        when 'mcq_multiple' then
          select jsonb_agg(o->>'id' order by o->>'id')
            into v_expected_set
            from jsonb_array_elements(coalesce(q.options,'[]'::jsonb)) o
           where (o->>'is_correct')::boolean is true;

          select jsonb_agg(val order by val)
            into v_given_set
            from jsonb_array_elements_text(
                   case when jsonb_typeof(v_given) = 'array'
                        then v_given else '[]'::jsonb end) val;

          v_correct := coalesce(v_expected_set,'[]'::jsonb)
                       = coalesce(v_given_set,'[]'::jsonb);

        when 'true_false' then
          v_correct := lower(btrim(coalesce(q.correct_answer #>> '{}','')))
                     = lower(btrim(v_given #>> '{}'));

        when 'short_answer' then
          v_correct := lower(btrim(coalesce(q.correct_answer #>> '{}','')))
                     = lower(btrim(v_given #>> '{}'));

        when 'match_pair' then
          select jsonb_agg(jsonb_build_object(
                   'l', lower(btrim(p->>'left')),
                   'r', lower(btrim(p->>'right')))
                 order by lower(btrim(p->>'left')))
            into v_expected_set
            from jsonb_array_elements(
                   coalesce(q.options->'pairs','[]'::jsonb)) as e(p);

          select jsonb_agg(jsonb_build_object(
                   'l', lower(btrim(p->>'left')),
                   'r', lower(btrim(p->>'right')))
                 order by lower(btrim(p->>'left')))
            into v_given_set
            from jsonb_array_elements(
                   case when jsonb_typeof(v_given) = 'array'
                        then v_given else '[]'::jsonb end) as g(p);

          v_correct := coalesce(v_expected_set,'[]'::jsonb)
                       = coalesce(v_given_set,'[]'::jsonb);

        else
          v_correct := false;
      end case;

      if v_correct then
        v_score := v_score + coalesce(q.positive_marks, 0);
      else
        v_score := v_score - coalesce(q.negative_marks, 0);
      end if;
    end if;
  end loop;

  if v_score < 0 then
    v_score := 0;
  end if;

  v_pct := case when v_total > 0
                then round((v_score / v_total) * 100, 2)
                else 0 end;

  insert into public.test_attempts
    (student_id, test_id, answers, score, total_marks, percentage,
     time_taken_seconds, attempt_number, submitted_at)
  values
    (v_student_id, p_test_id, p_answers, v_score, v_total, v_pct,
     case when p_started_at is not null
          then greatest(0, extract(epoch from (now() - p_started_at))::int)
          else null end,
     v_attempt_no, now())
  returning id into v_attempt_id;

  return jsonb_build_object(
    'ok',             true,
    'attempt_id',     v_attempt_id,
    'attempt_number', v_attempt_no,
    'score',          v_score,
    'total_marks',    v_total,
    'percentage',     v_pct,
    'passed',         (v_pass_pct is null or v_pct >= v_pass_pct)
  );
end;
$$;

revoke execute on function public.get_test_questions(uuid) from public, anon;
revoke execute on function public.submit_test_attempt(uuid, jsonb, timestamptz) from public, anon;
grant  execute on function public.get_test_questions(uuid) to authenticated;
grant  execute on function public.submit_test_attempt(uuid, jsonb, timestamptz) to authenticated;

commit;
