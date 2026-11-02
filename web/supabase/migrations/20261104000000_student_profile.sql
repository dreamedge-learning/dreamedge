-- Mandatory student profile, and the columns an offline registration needs.
--
-- Until now a Google sign-in produced a students row carrying a name and
-- nothing else: no class, no board, no school, no city, and no way to reach a
-- parent. For a platform teaching Classes 6-10 that is the whole record. The
-- `profile_completed` flag below is the gate the website and the app both read
-- before they let a student in, so however they signed up they land on the
-- same form.
--
-- The rest supports registration at the Kalmeshwar centre, where a student
-- fills in a printed sheet and an admin types it in: who registered them,
-- whether it came from the website or the counter, and a human-readable
-- student code to write on the receipt.

begin;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists parent_name          text,
  add column if not exists parent_phone         text,
  add column if not exists date_of_birth        date,
  add column if not exists gender               text,
  add column if not exists address_line         text,
  add column if not exists pincode              text,
  add column if not exists profile_completed    boolean not null default false,
  add column if not exists profile_completed_at timestamptz,
  add column if not exists registration_source  text not null default 'self_online',
  add column if not exists registered_by        uuid references public.admin_users(id) on delete set null,
  add column if not exists admin_notes          text,
  add column if not exists student_code         text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass and conname = 'students_gender_check'
  ) then
    alter table public.students
      add constraint students_gender_check
      check (gender is null or gender in ('male', 'female', 'other', 'prefer_not_to_say'));
  end if;

  -- Six digits, never starting at zero: the shape India Post actually uses.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass and conname = 'students_pincode_check'
  ) then
    alter table public.students
      add constraint students_pincode_check
      check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass and conname = 'students_registration_source_check'
  ) then
    alter table public.students
      add constraint students_registration_source_check
      check (registration_source in ('self_online', 'admin_offline', 'admin_import'));
  end if;
end $$;

comment on column public.students.profile_completed is
  'The gate. False until the student has finished the onboarding form; the website and the app both refuse to show anything else until it is true. Not writable by the student.';
comment on column public.students.registration_source is
  'Where the record came from: the website, the Kalmeshwar counter, or a bulk import. Not writable by the student.';
comment on column public.students.student_code is
  'Human-readable identifier (DE26-00001) written on receipts and printed forms. Assigned by trigger; not writable by the student.';

-- ---------------------------------------------------------------------------
-- Student code and referral code
-- ---------------------------------------------------------------------------

-- A sequence rather than a count: two admins registering at the same counter
-- at the same moment would otherwise both read the same count and mint the
-- same code, and the unique index would reject the second one in front of a
-- waiting student.
create sequence if not exists public.student_code_seq as bigint start with 1;

create or replace function public.next_student_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'DE' || to_char(now() at time zone 'Asia/Kolkata', 'YY')
         || '-' || lpad(nextval('public.student_code_seq')::text, 5, '0');
$$;

/*
 * Fills the two generated identifiers before a student row lands.
 *
 * Both are assigned here rather than by the caller because there are five
 * places a students row is created -- email signup, phone OTP, the OAuth
 * callback, the admin's offline registration form, and the Flutter app's own
 * insert -- and the last of those is Dart, so no shared TypeScript helper can
 * reach it. A generated identifier belongs next to the unique index that has
 * to accept it, which is also the only place a retry on collision makes
 * sense.
 */
create or replace function public.assign_student_codes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  alphabet  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if new.student_code is null then
    new.student_code := public.next_student_code();
  end if;

  if new.referral_code is null then
    -- Ambiguous characters are left out of the alphabet: these codes get read
    -- aloud and written on paper.
    for attempt in 1 .. 10 loop
      candidate := 'DE';
      for i in 1 .. 6 loop
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;

      if not exists (select 1 from public.students where referral_code = candidate) then
        new.referral_code := candidate;
        exit;
      end if;
    end loop;

    -- Ten collisions against a 32^6 space means something is wrong with
    -- random(), not with luck. Fall back to something certain to be unique
    -- rather than writing a null and silently breaking referrals.
    if new.referral_code is null then
      new.referral_code := 'DE' || upper(to_hex(nextval('public.student_code_seq')));
    end if;
  end if;

  return new;
end $$;

-- Nothing calls these directly; the triggers run them as their definer, and
-- a student who could call `next_student_code` could burn the sequence.
revoke all on function public.next_student_code() from public;
revoke all on function public.assign_student_codes() from public;

drop trigger if exists students_assign_codes on public.students;
create trigger students_assign_codes
  before insert on public.students
  for each row
  execute function public.assign_student_codes();

-- ---------------------------------------------------------------------------
-- Protecting the gate from the student it gates
-- ---------------------------------------------------------------------------

/*
 * Rejects a student's attempt to change the columns that are not theirs.
 *
 * A trigger rather than column-level grants. `students_update_own` lets a
 * student update their own row, and PostgREST sends the whole row on an
 * update, so a REVOKE on one column would fail every profile save rather
 * than just the forbidden field -- and the grant would still have to be
 * handed back to service_role and to the admin roles, in three places that
 * can drift apart. Comparing old against new keeps the rule in one readable
 * place, and it holds for any client: the website, the app, or a hand-rolled
 * REST call with a stolen anon key.
 *
 * Admins and the service role pass through: the offline registration form
 * fills the profile in on the student's behalf, and that has to be allowed.
 */
create or replace function public.guard_student_managed_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Keyed on the effective role, and therefore NOT security definer: a
  -- definer function runs as its owner, so `current_user` inside one is
  -- always `postgres` and this test would wave everything through. The
  -- function needs no privileges of its own -- it reads OLD and NEW and
  -- calls `is_admin()`, which carries its own.
  --
  -- PostgREST runs a student's request as `authenticated`. The service role,
  -- a migration, the SQL editor and `complete_student_profile` all run as
  -- somebody else, which is how the one sanctioned way to open the gate gets
  -- through the guard meant to protect it. `auth.uid()` would have been the
  -- wrong test: it stays set inside a definer function.
  --
  -- Admins pass through because the offline registration form fills a profile
  -- in on a student's behalf, which is the whole point of it.
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if new.profile_completed    is distinct from old.profile_completed
     or new.profile_completed_at is distinct from old.profile_completed_at
     or new.registration_source is distinct from old.registration_source
     or new.registered_by       is distinct from old.registered_by
     or new.student_code        is distinct from old.student_code
     or new.admin_notes         is distinct from old.admin_notes
     or new.referral_code       is distinct from old.referral_code
     or new.wallet_balance      is distinct from old.wallet_balance
     or new.status              is distinct from old.status
     or new.user_id             is distinct from old.user_id then
    raise exception
      'Those fields are managed by Dream Edge and cannot be changed from here.'
      using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.guard_student_managed_columns() from public;

drop trigger if exists students_guard_managed_columns on public.students;
create trigger students_guard_managed_columns
  before update on public.students
  for each row
  execute function public.guard_student_managed_columns();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Existing rows are development data, so they should meet the form too:
-- `profile_completed` stays false for all of them. Only the codes are filled
-- in, because those identify a record rather than describe one.
update public.students
set student_code = public.next_student_code()
where student_code is null;

update public.students
set referral_code = 'DE' || upper(to_hex(nextval('public.student_code_seq')))
where referral_code is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass and conname = 'students_student_code_key'
  ) then
    alter table public.students add constraint students_student_code_key unique (student_code);
  end if;
end $$;

create index if not exists idx_students_registration_source
  on public.students (registration_source);

create index if not exists idx_students_profile_completed
  on public.students (profile_completed)
  where profile_completed = false;

commit;
