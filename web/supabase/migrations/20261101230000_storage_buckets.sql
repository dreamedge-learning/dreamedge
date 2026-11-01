-- ---------------------------------------------------------------------------
-- Storage buckets and their policies.
--
-- All three buckets were created by hand in the dashboard and none of them had
-- policies in version control, so a fresh environment came up with no storage
-- at all and the live one had whatever was clicked into it months ago.
--
-- The important change is `content-files`. It was public, which meant the paid
-- content paywall was decorative: `content_items` is protected by RLS, but the
-- file it points at sat on a public CDN URL. Anyone with the link -- a student
-- who paid for one course, or anyone they forwarded it to -- could read every
-- PDF in the bucket. Row-level security on the row does nothing when the
-- payload is served from an unauthenticated endpoint.
--
-- The bucket is now private and nothing may read it directly. Access goes
-- through /api/content/[id]/file, which checks enrolment and mints a
-- short-lived signed URL with the service role.
--
-- `avatars` and `course-thumbnails` stay public: both are shown to logged-out
-- visitors on the marketing pages, and neither carries anything private.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('content-files',     'content-files',     false, 52428800),   -- 50 MB
  ('course-thumbnails', 'course-thumbnails', true,   5242880),   --  5 MB
  ('avatars',           'avatars',           true,   2097152)    --  2 MB
on conflict (id) do update
  set public          = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- ---------------------------------------------------------------------------
-- Rewrite content file URLs that were stored as public CDN links.
--
-- Flipping the bucket to private breaks every one of those links, so the
-- stored value becomes the object path instead. The application treats a value
-- without a scheme as a storage path and routes it through the signed-URL
-- endpoint; values that are real URLs (Bunny.net video, external resources)
-- are left alone.
-- ---------------------------------------------------------------------------
update content_items
   set file_url = split_part(file_url, '/storage/v1/object/public/content-files/', 2)
 where file_url like '%/storage/v1/object/public/content-files/%';

-- ---------------------------------------------------------------------------
-- content-files: no public read. Admins manage it; students never touch it.
-- ---------------------------------------------------------------------------
drop policy if exists "Content files are admin managed" on storage.objects;

create policy "Content files are admin managed" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'content-files'
    and has_admin_role(array['super_admin', 'content_creator']::user_role[])
  )
  with check (
    bucket_id = 'content-files'
    and has_admin_role(array['super_admin', 'content_creator']::user_role[])
  );

-- ---------------------------------------------------------------------------
-- course-thumbnails: world-readable, admin-writable.
-- ---------------------------------------------------------------------------
drop policy if exists "Course thumbnails are publicly readable" on storage.objects;
drop policy if exists "Course thumbnails are admin writable"    on storage.objects;

create policy "Course thumbnails are publicly readable" on storage.objects
  for select
  to public
  using (bucket_id = 'course-thumbnails');

create policy "Course thumbnails are admin writable" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'course-thumbnails'
    and has_admin_role(array['super_admin', 'content_creator']::user_role[])
  )
  with check (
    bucket_id = 'course-thumbnails'
    and has_admin_role(array['super_admin', 'content_creator']::user_role[])
  );

-- ---------------------------------------------------------------------------
-- avatars: world-readable, and each student may only write inside a folder
-- named after their own auth uid. The upload path is `students/<uid>/<file>`,
-- so the uid is the second path segment.
-- ---------------------------------------------------------------------------
drop policy if exists "Avatars are publicly readable"       on storage.objects;
drop policy if exists "Users manage their own avatar"       on storage.objects;

create policy "Avatars are publicly readable" on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

create policy "Users manage their own avatar" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
