-- ---------------------------------------------------------------------------
-- Video hosting moves to Bunny Stream, and downloads become auditable.
--
-- Until now a video was a URL in `content_items.file_url` and nothing else,
-- which left three problems with no column to solve them in.
--
-- First, the file could not live in our own storage. Supabase's plan caps a
-- single upload at 50 MB; a recorded 50-minute lesson is comfortably past a
-- gigabyte, so the bucket was never a candidate. Nor can a bucket transcode:
-- one MP4 at one bitrate means a student on a 3G connection in Kalmeshwar
-- either waits or gives up, and there is no quality selector to offer them.
-- Videos therefore go to Bunny Stream, which takes a resumable upload, builds
-- the whole resolution ladder, and serves it from a CDN with an Indian edge.
-- The columns below are what we keep on our side so the panel can show the
-- state of an upload without asking Bunny on every page render.
--
-- Second, a plain URL cannot be revoked. Bunny mints token-authenticated
-- playback URLs, so the GUID is the thing worth storing and the playable URL
-- is derived per request with a short life. `bunny_video_guid` is that handle.
--
-- Third, offline playback needs a licence. A paid video that is downloaded
-- once must not become permanently free, so a download carries an expiry and
-- the device has to come back online before it lapses. `offline_license_days`
-- is how long that is, per item, because a free sample and a flagship course
-- do not deserve the same leash.
--
-- Note on `is_downloadable`: it already means exactly "the student may keep a
-- copy", and it has existed since the initial schema. The only reason it did
-- not look like the offline switch is that the panel hid it for videos. It is
-- now the single offline toggle for every content type. Do not add a parallel
-- "can download offline" column -- two flags meaning one thing is how a
-- paywall ends up disagreeing with itself.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- content_items: where the video lives and how long a copy of it lasts.
-- ---------------------------------------------------------------------------

alter table public.content_items
  add column if not exists video_provider      text   not null default 'none',
  add column if not exists bunny_video_guid    text,
  add column if not exists video_status        text   not null default 'none',
  add column if not exists video_thumbnail_url text,
  add column if not exists video_resolutions   text[] not null default '{}',
  add column if not exists video_size_bytes    bigint,
  add column if not exists offline_license_days int   not null default 30;

comment on column public.content_items.video_provider is
  'none, bunny (hosted on Bunny Stream), or external (a URL we do not own).';
comment on column public.content_items.bunny_video_guid is
  'Bunny Stream video GUID. The playable URL is signed per request, never stored.';
comment on column public.content_items.video_status is
  'Mirror of the Bunny transcoding state so the panel need not poll to render.';
comment on column public.content_items.video_resolutions is
  'Resolution labels Bunny finished encoding, e.g. {360p,720p}. Drives the quality menu.';
comment on column public.content_items.offline_license_days is
  'Days a downloaded copy keeps working before the student must reconnect once.';

-- Constraints are dropped first so this file can be replayed over a database
-- that already has an earlier version of them.
alter table public.content_items
  drop constraint if exists content_items_video_provider_check,
  drop constraint if exists content_items_video_status_check,
  drop constraint if exists content_items_offline_license_days_check;

alter table public.content_items
  add constraint content_items_video_provider_check
    check (video_provider in ('none', 'bunny', 'external')),
  add constraint content_items_video_status_check
    check (video_status in ('none', 'processing', 'ready', 'failed')),
  add constraint content_items_offline_license_days_check
    check (offline_license_days between 1 and 365);

-- Looking a video up by its Bunny GUID happens on every status refresh and on
-- every webhook we may add later, and the GUID is unique on Bunny's side.
create unique index if not exists idx_content_items_bunny_guid
  on public.content_items (bunny_video_guid)
  where bunny_video_guid is not null;

-- ---------------------------------------------------------------------------
-- Backfill: videos that already play are externally hosted and already ready.
--
-- Everything currently in `file_url` for a video is a link to something we do
-- not control -- the bucket paths were moved out to `content_files` by
-- 20261102100000. Marking them 'external'/'ready' keeps them playing through
-- the new code path instead of looking like uploads that never finished.
-- ---------------------------------------------------------------------------

update public.content_items
   set video_provider = 'external',
       video_status   = 'ready'
 where type = 'video'
   and video_provider = 'none'
   and file_url is not null
   and file_url ~* '^https?://';

-- ---------------------------------------------------------------------------
-- content_downloads: one row per (student, item, device).
--
-- A download leaves our reach the moment it lands on the phone, so the row is
-- the only record that it happened. It is what lets support answer "why is
-- this locked", what makes a refund actually revoke something, and what caps
-- how many devices one account can stock up on. `last_verified_at` is the
-- heartbeat: the app stamps it on every successful entitlement check, and a
-- row that stops being stamped is a device that has gone quiet.
-- ---------------------------------------------------------------------------

create table if not exists public.content_downloads (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  content_item_id  uuid not null references public.content_items(id) on delete cascade,

  -- Stable per install, from device_info_plus. Not a hardware serial: a
  -- reinstall is a new device as far as this table is concerned, which is the
  -- right side to err on.
  device_id        text not null,

  quality          text,
  bytes            bigint not null default 0,
  downloaded_at    timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),

  unique (student_id, content_item_id, device_id)
);

-- The sweep that finds stale devices reads by student and heartbeat, which is
-- also the order the Downloads screen wants.
create index if not exists idx_content_downloads_student_verified
  on public.content_downloads (student_id, last_verified_at);

alter table public.content_downloads enable row level security;

drop policy if exists "Students manage their own downloads"   on public.content_downloads;
drop policy if exists "Support can read every download"       on public.content_downloads;

-- A student sees and writes only their own rows. `current_student_id()` is
-- SECURITY DEFINER over `students.user_id = auth.uid()`, so a caller cannot
-- claim someone else's student id by passing it.
create policy "Students manage their own downloads"
  on public.content_downloads for all
  to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

-- Read-only for the two roles that field "it says my download expired"
-- questions. Nobody edits a download record from the panel: it describes what
-- a device did, and rewriting history here would only hide a real problem.
create policy "Support can read every download"
  on public.content_downloads for select
  to authenticated
  using (
    public.has_admin_role(array['super_admin', 'support_staff']::user_role[])
  );

-- ---------------------------------------------------------------------------
-- check_offline_entitlements: the single definition of "may this student have
-- this content".
--
-- Three callers need to answer that question -- the website's video route, the
-- Edge Function the app talks to, and the app's own reconnect sweep -- and
-- three copies of a paywall rule is three chances to disagree about who has
-- paid. So the rule lives here once, and `p_content_item_id` lets a caller ask
-- about one item instead of the whole catalogue. Called with no argument it
-- returns everything the student is entitled to, which is what the app uses to
-- extend the licences it holds and expire the ones it should not.
--
-- The rule itself: the item is published, and it is either free or covered by
-- an active enrolment that has not run out. A renewal leaves two active rows
-- for one course, so the longest-lived one wins -- a null `valid_until` never
-- expires and therefore sorts ahead of any date.
--
-- `is_downloadable` is returned rather than filtered on. An admin turning the
-- offline switch off is a reason to expire a copy already on a device, and the
-- app can only act on that if it can see the flag flip.
-- ---------------------------------------------------------------------------

create or replace function public.check_offline_entitlements(
  p_content_item_id uuid default null
)
returns table (
  content_item_id      uuid,
  course_id            uuid,
  valid_until          timestamptz,
  offline_license_days int,
  is_downloadable      boolean,
  updated_at           timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ci.id,
         s.course_id,
         e.valid_until,
         ci.offline_license_days,
         ci.is_downloadable,
         ci.updated_at
    from public.content_items ci
    join public.topics   t on t.id = ci.topic_id
    join public.subjects s on s.id = t.subject_id
    left join lateral (
      select en.id, en.valid_until
        from public.enrollments en
       where en.student_id = public.current_student_id()
         and en.course_id  = s.course_id
         and en.status     = 'active'
       order by en.valid_until desc nulls first
       limit 1
    ) e on true
   where public.current_student_id() is not null
     and ci.status = 'published'
     and (p_content_item_id is null or ci.id = p_content_item_id)
     and (
       ci.is_paid = false
       or (e.id is not null and (e.valid_until is null or e.valid_until > now()))
     );
$$;

revoke execute on function public.check_offline_entitlements(uuid) from public, anon;
grant  execute on function public.check_offline_entitlements(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The document bucket drops to 40 MB.
--
-- It was 50 MB only because that was the ceiling an upload could reach at all.
-- Now that video has somewhere proper to go, the bucket holds nothing but
-- PDFs, notes, past papers and images, and 40 MB is already generous for a
-- print-ready booklet. The lower cap is what makes "this file is too big" a
-- useful message rather than the first sign that someone tried to put a
-- lecture recording in the wrong place.
-- ---------------------------------------------------------------------------

update storage.buckets
   set file_size_limit = 41943040
 where id = 'content-files';

commit;
