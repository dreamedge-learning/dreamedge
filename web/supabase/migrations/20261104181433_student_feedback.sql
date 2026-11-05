-- General feedback channel from students to admins.
--
-- Scope: free-text, student-authored, read only by super admin and support
-- staff. Not interactive -- the student picks a category, writes a message,
-- and sees their own history with the current status. Admins mark messages
-- read, resolve them, and optionally leave a note on the row for the paper
-- trail.
--
-- The abuse limit is enforced in the database (a trigger), not only in the
-- form, so the limit holds whether the write comes from the website, the app
-- or a curl. Five successful submissions per 24 hours is roomy for a genuine
-- student with a lot to say and hard-stops a script.

create table public.student_feedback (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  category    text not null check (category in (
                 'content', 'app_problem', 'website_problem',
                 'payment', 'suggestion', 'other'
               )),
  message     text not null check (char_length(message) between 10 and 2000),
  source      text not null check (source in ('web', 'app')),
  app_version text,
  status      text not null default 'new'
                   check (status in ('new', 'read', 'resolved')),
  admin_note  text,
  handled_by  uuid references public.admin_users(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- The admin inbox is "all 'new', newest first", so the composite index is
-- what it will actually filter by.
create index student_feedback_status_created_idx
  on public.student_feedback (status, created_at desc);

-- A student's own history query is anchored by student_id.
create index student_feedback_student_idx
  on public.student_feedback (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Abuse limit
-- ---------------------------------------------------------------------------
--
-- Not SECURITY DEFINER on purpose: the policies below already decide who gets
-- to insert, and the trigger only measures existing rows owned by the caller.
-- A definer function here would run as the owner and bypass RLS, which is
-- more privilege than this check needs.

create or replace function public.enforce_student_feedback_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_recent integer;
begin
  select count(*)
    into v_recent
    from public.student_feedback
   where student_id = new.student_id
     and created_at > now() - interval '24 hours';

  if v_recent >= 5 then
    raise exception 'You have reached the limit of 5 feedback submissions in 24 hours. Please try again later.'
      using errcode = '53400';
  end if;

  return new;
end;
$$;

create trigger student_feedback_rate_limit
  before insert on public.student_feedback
  for each row execute function public.enforce_student_feedback_rate_limit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.student_feedback enable row level security;

-- Students write their own rows, and only their own: the policy says so, and
-- `current_student_id()` resolves the auth user back to the students row, so
-- a client cannot pass somebody else's id.
create policy "student_feedback_student_insert" on public.student_feedback
  for insert to authenticated
  with check (student_id = public.current_student_id());

-- Students read their own rows, so the dashboard page can list their past
-- submissions with the current status.
create policy "student_feedback_student_select" on public.student_feedback
  for select to authenticated
  using (
       student_id = public.current_student_id()
    or public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[])
  );

-- The two admin roles that answer student messages. Not `technical`: the
-- content is free text from children. Not `teacher` or `content_creator`:
-- these messages often include contact details that are support's remit.
create policy "student_feedback_admin_update" on public.student_feedback
  for update to authenticated
  using (public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[]))
  with check (public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[]));

-- No DELETE policy for anyone. A student retracting a message would erase
-- the admin's record of what was raised; an admin deleting one would do the
-- same to the audit trail. Hiding is not a feature this build needs.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
--
-- Constraint from CLAUDE.md: a subscription on a table outside
-- supabase_realtime connects, reports success, and then never fires. The
-- admin shell listens for INSERTs on this table to raise the Engage badge,
-- so the table has to be in the publication.

alter publication supabase_realtime add table public.student_feedback;
