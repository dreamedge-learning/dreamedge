-- Somewhere for an image-based question's image to actually live.
--
-- The question editor called `URL.createObjectURL(file)` and stored the
-- resulting `blob:` URL in `questions.image_url`. That URL is valid only
-- inside the tab that created it, so every image-based question ever saved
-- pointed at nothing the moment the admin closed the page -- and the editor
-- showed a successful upload, which is why it went unnoticed.
--
-- Public, matching `course-thumbnails`, `avatars` and `testimonial-photos`.
-- A question image has to render inside the test UI on the website and in the
-- Flutter app, and both get their questions from `get_test_questions`, which
-- is SQL and cannot sign a URL. Keeping the bucket private would mean a
-- signing route in the exam path and a matching change in the app, for an
-- object whose path is already an unguessable UUID. Worth revisiting if
-- question papers ever need to be secret before the exam.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Question images are publicly readable" on storage.objects;
drop policy if exists "Question images are writable by content admins" on storage.objects;

create policy "Question images are publicly readable" on storage.objects
  for select
  to public
  using (bucket_id = 'question-images');

-- The same two roles that may edit a test, matching the assertAdmin call in
-- the upload action.
create policy "Question images are writable by content admins" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'question-images'
    and public.has_admin_role(array['super_admin', 'content_creator']::public.user_role[])
  )
  with check (
    bucket_id = 'question-images'
    and public.has_admin_role(array['super_admin', 'content_creator']::public.user_role[])
  );
