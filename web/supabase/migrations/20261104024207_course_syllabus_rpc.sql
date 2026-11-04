-- The syllabus a course page can show before anyone has paid.
--
-- Every student-facing RLS policy on `content_items` requires an active
-- enrolment, so a visitor who has not bought the course currently sees no
-- lesson list at all -- which also left buy-to-unlock with no poster to sit
-- on. This returns the marketing half of a syllabus and nothing else.
--
-- What it deliberately does NOT return: file_url, bunny_video_guid,
-- video_status, play_limit, is_downloadable, or anything else that could be
-- turned into playback. A caller gets titles, types, durations and posters.
-- Adding a column here is widening a public surface, so think before you do.
--
-- `poster_url` only, never `video_thumbnail_url`: Bunny's frame lives behind
-- the pull zone's token authentication, so an unsigned URL comes back 403 and
-- a signed one has no business being minted for a visitor. A lesson with no
-- poster returns null and the page shows a placeholder.
create or replace function public.get_course_syllabus(p_course_id uuid)
returns table (
  subject_id       uuid,
  subject_name     text,
  subject_weight   integer,
  topic_id         uuid,
  topic_name       text,
  topic_weight     integer,
  item_id          uuid,
  item_title       text,
  item_type        public.content_type,
  item_is_paid     boolean,
  item_duration    integer,
  item_poster_url  text,
  item_weight      integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.id, s.name, s.weight,
         t.id, t.name, t.weight,
         ci.id, ci.title, ci.type, ci.is_paid, ci.duration_seconds,
         ci.poster_url, ci.weight
    from public.courses c
    join public.subjects s on s.course_id = c.id
    join public.topics   t on t.subject_id = s.id
    left join public.content_items ci
           on ci.topic_id = t.id
          and ci.status = 'published'
   where c.id = p_course_id
     and c.is_published = true
     and coalesce(s.is_visible, true)
     and coalesce(t.is_visible, true)
   order by s.weight, t.weight, ci.weight nulls last;
$fn$;

comment on function public.get_course_syllabus(uuid) is
  'Marketing-safe syllabus for a published course: titles, types, durations and posters. Never returns anything playable. Readable by anon so the course page can show a locked lesson list.';

-- Readable without an account: a course page that cannot show its own
-- syllabus to a prospective buyer is a course page that does not sell.
revoke all on function public.get_course_syllabus(uuid) from public;
grant execute on function public.get_course_syllabus(uuid) to anon, authenticated, service_role;
