-- The marketing homepage shows a "live now" badge. Visitors are anonymous and
-- have no policy on live_classes, so the badge could never fire for them.
--
-- Opening the table to anon is not an option: the row carries meeting_url,
-- which would let anyone walk into a paid class. This exposes the title alone.

create or replace function public.current_live_class_title()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lc.title
    from live_classes lc
    join courses c on c.id = lc.course_id
   where lc.status = 'live'
     and c.is_published = true
   order by lc.scheduled_at desc
   limit 1;
$$;

revoke all on function public.current_live_class_title() from public;
grant execute on function public.current_live_class_title() to anon, authenticated;
