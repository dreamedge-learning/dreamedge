-- Testimonials: the photo the admin panel always implied, and the three
-- topper columns the form was already posting into nothing.
--
-- `student_photo_url` has existed since the initial schema but nothing ever
-- wrote to it. `is_topper`, `course_name` and `marks_or_rank` were read by the
-- admin UI and declared in types/database.ts, but were never columns -- so the
-- Toppers tab could never fill and two form fields were dropped on every save.

alter table public.testimonials
  add column if not exists is_topper      boolean not null default false,
  add column if not exists course_name    text,
  add column if not exists marks_or_rank  text;

create index if not exists testimonials_is_topper_idx
  on public.testimonials (is_topper, weight);

-- Photos for testimonial and topper cards.
--
-- The bucket is public because these render on the signed-out landing page,
-- so a signed URL would cost a round trip per card and buy nothing. Writes are
-- limited to the two roles that own the section, matching the assertAdmin call
-- in the server action.

insert into storage.buckets (id, name, public, file_size_limit)
values ('testimonial-photos', 'testimonial-photos', true, 2097152)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152;

drop policy if exists "Testimonial photos are publicly readable" on storage.objects;
drop policy if exists "Testimonial photos are admin writable"    on storage.objects;

create policy "Testimonial photos are publicly readable" on storage.objects
  for select
  to public
  using (bucket_id = 'testimonial-photos');

create policy "Testimonial photos are admin writable" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'testimonial-photos'
    and public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[])
  )
  with check (
    bucket_id = 'testimonial-photos'
    and public.has_admin_role(array['super_admin', 'support_staff']::public.user_role[])
  );
