-- One definition of "this profile is finished".
--
-- `profile_completed` is closed to students by the guard trigger in
-- 20261104000000, which is the point: a student must not be able to flip
-- their own gate. The website gets round that with the service-role key on
-- the server, but the Flutter app has no such key and must never be given
-- one, so without this it could collect a complete profile and have no way to
-- record that it had.
--
-- Both clients call this instead. The rule for what counts as complete then
-- lives next to the columns rather than once in TypeScript and once in Dart,
-- where the two would drift the first time a field is added.

begin;

create or replace function public.complete_student_profile(p_profile jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student    public.students;
  v_email      text;
begin
  v_student_id := public.current_student_id();

  if v_student_id is null then
    raise exception 'You are not signed in as a student.' using errcode = '42501';
  end if;

  -- A key the caller did not send leaves its column alone, so a client may
  -- submit only what it collected.
  v_email := nullif(btrim(p_profile ->> 'email'), '');

  update public.students s
  set
    full_name = coalesce(nullif(btrim(p_profile ->> 'full_name'), ''), s.full_name),
    date_of_birth = case
      when p_profile ? 'date_of_birth'
        then nullif(btrim(p_profile ->> 'date_of_birth'), '')::date
      else s.date_of_birth
    end,
    gender = case
      when p_profile ? 'gender' then nullif(btrim(p_profile ->> 'gender'), '')
      else s.gender
    end,
    class = case
      when p_profile ? 'class' then nullif(btrim(p_profile ->> 'class'), '')
      else s.class
    end,
    board = case
      when p_profile ? 'board' then nullif(btrim(p_profile ->> 'board'), '')
      else s.board
    end,
    school_name = case
      when p_profile ? 'school_name' then nullif(btrim(p_profile ->> 'school_name'), '')
      else s.school_name
    end,
    phone = case
      when p_profile ? 'phone' then nullif(btrim(p_profile ->> 'phone'), '')
      else s.phone
    end,
    parent_name = case
      when p_profile ? 'parent_name' then nullif(btrim(p_profile ->> 'parent_name'), '')
      else s.parent_name
    end,
    parent_phone = case
      when p_profile ? 'parent_phone' then nullif(btrim(p_profile ->> 'parent_phone'), '')
      else s.parent_phone
    end,
    city = case
      when p_profile ? 'city' then nullif(btrim(p_profile ->> 'city'), '')
      else s.city
    end,
    state = case
      when p_profile ? 'state' then nullif(btrim(p_profile ->> 'state'), '')
      else s.state
    end,
    pincode = case
      when p_profile ? 'pincode' then nullif(btrim(p_profile ->> 'pincode'), '')
      else s.pincode
    end,
    address_line = case
      when p_profile ? 'address_line' then nullif(btrim(p_profile ->> 'address_line'), '')
      else s.address_line
    end,
    -- The contact email, never the sign-in address: this touches
    -- `students.email` and leaves `auth.users` alone.
    email = coalesce(lower(v_email), s.email)
  where s.id = v_student_id
  returning s.* into v_student;

  if v_student.id is null then
    raise exception 'Your student record could not be found.' using errcode = 'P0002';
  end if;

  -- Checked after the write rather than against the payload, so a client that
  -- sends only the step it just filled is still judged on the whole profile.
  if coalesce(btrim(v_student.full_name), '') = ''
     or coalesce(btrim(v_student.class), '') = ''
     or coalesce(btrim(v_student.board), '') = ''
     or coalesce(btrim(v_student.school_name), '') = ''
     or coalesce(btrim(v_student.parent_name), '') = ''
     or coalesce(btrim(v_student.parent_phone), '') = ''
     or coalesce(btrim(v_student.city), '') = ''
     or coalesce(btrim(v_student.state), '') = '' then
    raise exception
      'Your profile is missing something we need: name, class, board, school, parent contact, city and state are all required.'
      using errcode = '23514';
  end if;

  update public.students
  set profile_completed = true,
      profile_completed_at = now()
  where id = v_student_id;

  return v_student.student_code;

exception
  -- `students.email` is unique. Without this the student sees a raw
  -- constraint name and has no idea which field to change.
  when unique_violation then
    if sqlerrm like '%students_email%' then
      raise exception 'Another Dream Edge account already uses that email address.'
        using errcode = '23505';
    end if;
    raise;
end $$;

revoke all on function public.complete_student_profile(jsonb) from public;
grant execute on function public.complete_student_profile(jsonb) to authenticated;

comment on function public.complete_student_profile(jsonb) is
  'Writes the mandatory profile for the calling student and opens the gate. The only way profile_completed is set outside an admin path.';

commit;
