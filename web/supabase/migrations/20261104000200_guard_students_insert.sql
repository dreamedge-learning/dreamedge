-- Guard the admin-managed columns on INSERT, not only on UPDATE.
--
-- The earlier migration (20261104000000_student_profile.sql) added a BEFORE
-- UPDATE trigger that refused a student's writes to profile_completed,
-- registration_source, registered_by, student_code, admin_notes,
-- referral_code, wallet_balance, status and user_id. INSERT was unprotected,
-- so a signed-in student with the anon key could POST straight to
-- /rest/v1/students with user_id = self, a hand-picked student_code, an
-- `admin_offline` provenance, profile_completed = true, status = 'active'
-- and wallet_balance = 99999, and both gates then read true.
--
-- The attack surface is new accounts only -- UNIQUE(user_id) stops an
-- existing student redoing it, DELETE is super_admin-only -- but the
-- consequences are a skipped onboarding form, a forged student code, a
-- forged `registered at the centre` provenance, and an unguarded money
-- column. All on records about children.
--
-- While we are in here, correct one line of the earlier migration's
-- justification. :163-168 said the trigger was used because "PostgREST sends
-- the whole row on an update"; PostgREST PATCHes only the supplied columns,
-- so a column-level REVOKE would not fail every profile save -- it would
-- refuse only writes that named the revoked column. The trigger is still the
-- right mechanism, for the honest reason: a column-level REVOKE on an
-- updateable column has to be matched by column-level GRANTs on service_role
-- and on every admin role allowed to touch the field, in three places that
-- drift apart. One trigger body is one source of truth, and it reads OLD and
-- NEW rather than scattering privileges across the role matrix.

begin;

-- ---------------------------------------------------------------------------
-- Guard function: handle INSERT and UPDATE in one body
-- ---------------------------------------------------------------------------

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
  -- PostgREST runs a student's request as `authenticated` (or `anon` on an
  -- insert against the public endpoint before the session is applied). The
  -- service role, a migration, the SQL editor and `complete_student_profile`
  -- all run as somebody else, which is how the one sanctioned way to open
  -- the gate gets through the guard meant to protect it. `auth.uid()` would
  -- have been the wrong test: it stays set inside a definer function.
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    -- A student may insert their own row (`students_insert_own` enforces
    -- user_id = auth.uid()), but every column the admin manages must be
    -- left at its default. student_code and referral_code are filled by
    -- `students_assign_codes` immediately after this trigger, which is why
    -- the INSERT guard is named to sort alphabetically before it.
    --
    -- `status` is checked against the enum default rather than letting the
    -- column default fire, because PostgREST serialises a null the caller
    -- did not set as absent (so defaults apply) but a null they did set as
    -- NULL (which the NOT NULL would catch anyway). Comparing to 'active'
    -- turns the student's own 'blocked' or 'inactive' write into an honest
    -- refusal.
    if new.profile_completed      is distinct from false
       or new.profile_completed_at is not null
       or new.registration_source  is distinct from 'self_online'
       or new.registered_by        is not null
       or new.admin_notes          is not null
       or new.student_code         is not null
       or new.referral_code        is not null
       or new.wallet_balance       is distinct from 0
       or new.status               is distinct from 'active'::public.student_status then
      raise exception
        'Those fields are managed by Dream Edge and cannot be set from here.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: the existing rule, unchanged. Compare OLD against NEW so the row
  -- can be re-saved by the student every time without having to list the
  -- columns they are allowed to touch.
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

-- ---------------------------------------------------------------------------
-- INSERT trigger: name sorts before students_assign_codes so this fires first
-- ---------------------------------------------------------------------------
--
-- PostgreSQL fires triggers of the same kind in alphabetical order by name.
-- '_' (ASCII 95) sorts before 'a' (97) at the eleventh character, so
-- `students_0_guard_insert` fires before `students_assign_codes`. That is
-- deliberate: this guard checks that student_code and referral_code were
-- left null by the caller, and `students_assign_codes` then fills them in.
-- If the two ran in the other order the guard would see the just-assigned
-- code and reject every honest insert.

drop trigger if exists students_0_guard_insert on public.students;
create trigger students_0_guard_insert
  before insert on public.students
  for each row
  execute function public.guard_student_managed_columns();

commit;
