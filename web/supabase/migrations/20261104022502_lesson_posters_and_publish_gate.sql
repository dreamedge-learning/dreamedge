-- Custom posters for video lessons, and a gate that actually holds.
--
-- Bunny picks a frame on its own, which is reliably the worst frame: a black
-- fade, a half-written board, the mentor mid-blink. A chosen poster is also
-- what a student who has not paid sees in place of the player, so it is
-- marketing as much as polish.

alter table public.content_items
  add column if not exists poster_url text;

comment on column public.content_items.poster_url is
  'Admin-chosen poster for a video lesson. Falls back to video_thumbnail_url (Bunny''s auto frame) when null. Required before a video may be published.';

-- Public, like the other image buckets: a poster is shown to signed-out
-- visitors on the course page, so a signed URL would cost a round trip per
-- card and protect an image whose whole job is to be seen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-posters',
  'lesson-posters',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Lesson posters are publicly readable" on storage.objects;
drop policy if exists "Lesson posters are writable by content admins" on storage.objects;

create policy "Lesson posters are publicly readable" on storage.objects
  for select to public
  using (bucket_id = 'lesson-posters');

create policy "Lesson posters are writable by content admins" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'lesson-posters'
    and public.has_admin_role(array['super_admin', 'content_creator']::public.user_role[])
  )
  with check (
    bucket_id = 'lesson-posters'
    and public.has_admin_role(array['super_admin', 'content_creator']::public.user_role[])
  );

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

-- In the database, not only in the server action, because the action is not
-- the only thing that publishes: `publish_due_content` runs as a cron job and
-- never touches TypeScript. A rule enforced only in the panel would be a rule
-- that a scheduled lesson walks straight past at two in the morning.
--
-- Deliberately NOT security definer: this is a guard, and a definer function
-- runs as its owner, which is how a check like this ends up waving everything
-- through.
create or replace function public.require_poster_before_publish()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- Only on the transition INTO published. Checking every update would make
  -- an already-published poster-less lesson impossible to edit at all, which
  -- punishes the admin for a row that predates the rule.
  if new.type = 'video'
     and new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and coalesce(nullif(btrim(new.poster_url), ''), '') = ''
  then
    raise exception
      'This video lesson needs a poster image before it can be published'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists content_items_require_poster on public.content_items;

create trigger content_items_require_poster
  before insert or update on public.content_items
  for each row execute function public.require_poster_before_publish();

-- ---------------------------------------------------------------------------
-- The scheduler has to agree with the gate
-- ---------------------------------------------------------------------------

-- Skips a poster-less video rather than attempting it. One raise inside this
-- statement would abort the whole batch, so a single lesson missing a poster
-- would stop every other due lesson from publishing -- a far worse failure
-- than the one lesson waiting.
create or replace function public.publish_due_content()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_published integer;
begin
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
       and (
         type <> 'video'
         or coalesce(nullif(btrim(poster_url), ''), '') <> ''
       )
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

-- How many scheduled lessons the gate is holding back.
--
-- A separate function rather than another column on
-- `scheduled_publish_health`, because adding one to a RETURNS TABLE is a
-- return-type change and `create or replace` cannot do that. Without this a
-- poster-less scheduled lesson would sit past its time with nothing saying
-- why, which is the silent failure the scheduler strip exists to prevent.
create or replace function public.scheduled_publish_blocked()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can read the scheduler status';
  end if;

  return (
    select count(*)::integer
      from public.content_items
     where status = 'draft'
       and publish_at is not null
       and publish_at <= now()
       and type = 'video'
       and coalesce(nullif(btrim(poster_url), ''), '') = ''
  );
end;
$fn$;

revoke all on function public.scheduled_publish_blocked() from public, anon;
grant execute on function public.scheduled_publish_blocked() to authenticated, service_role;
