-- Scheduled publishing for content items.
--
-- Deliberately no new `content_status` value. A lesson waiting for its date is
-- a draft with a `publish_at` -- "scheduled" is derived, not stored. Adding a
-- fourth enum value would mean every query that filters on 'published' has to
-- learn about it, and the one that forgot would either leak a paid lesson
-- early or hide it for good. This way the existing read paths are untouched
-- and the only thing that changes is who sets `status`.

alter table public.content_items
  add column if not exists publish_at timestamptz;

comment on column public.content_items.publish_at is
  'When a draft should become published. Cleared on publish. Null means the item is an ordinary draft with no date set.';

-- Only the rows the job actually looks at.
create index if not exists content_items_publish_due_idx
  on public.content_items (publish_at)
  where status = 'draft' and publish_at is not null;

-- ---------------------------------------------------------------------------
-- The flip
-- ---------------------------------------------------------------------------

create or replace function public.publish_due_content()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_published integer;
begin
  -- Reachable by an admin as a "publish due items now" button as well as by
  -- the job, so the role check cannot be skipped. `current_user` covers the
  -- job itself, which runs as the database owner rather than through PostgREST.
  if not (public.is_admin() or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'Only an admin can publish due content';
  end if;

  with due as (
    update public.content_items
       set status     = 'published',
           publish_at = null,
           updated_at = now()
     where status = 'draft'
       and publish_at is not null
       and publish_at <= now()
    returning id, title, topic_id
  ),
  logged as (
    insert into public.audit_log (user_id, action, entity_type, entity_id, new_data)
    select null, 'publish_scheduled', 'content_item', due.id,
           jsonb_build_object('title', due.title, 'topic_id', due.topic_id)
      from due
    returning 1
  )
  select count(*) into v_published from logged;

  return v_published;
end;
$fn$;

revoke all on function public.publish_due_content() from public, anon;
grant execute on function public.publish_due_content() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Is the scheduler alive?
-- ---------------------------------------------------------------------------

-- A cron job that stops running fails silently, which is the same trap the
-- empty realtime publication was. The panel shows this, so a dead scheduler is
-- something an admin reads rather than something a student discovers.
create or replace function public.scheduled_publish_health()
returns table (
  job_exists   boolean,
  schedule     text,
  last_run_at  timestamptz,
  last_status  text,
  overdue      integer,
  next_due_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can read the scheduler status';
  end if;

  return query
  select
    exists (select 1 from cron.job j where j.jobname = 'publish-due-content'),
    (select j.schedule from cron.job j where j.jobname = 'publish-due-content'),
    (select max(d.end_time) from cron.job_run_details d
       join cron.job j on j.jobid = d.jobid
      where j.jobname = 'publish-due-content'),
    (select d.status from cron.job_run_details d
       join cron.job j on j.jobid = d.jobid
      where j.jobname = 'publish-due-content'
      order by d.start_time desc limit 1),
    (select count(*)::integer from public.content_items c
      where c.status = 'draft' and c.publish_at is not null and c.publish_at <= now()),
    (select min(c.publish_at) from public.content_items c
      where c.status = 'draft' and c.publish_at is not null and c.publish_at > now());
end;
$fn$;

revoke all on function public.scheduled_publish_health() from public, anon;
grant execute on function public.scheduled_publish_health() to authenticated, service_role;
