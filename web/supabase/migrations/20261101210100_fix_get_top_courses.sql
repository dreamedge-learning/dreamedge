-- ---------------------------------------------------------------------------
-- Repair get_top_courses.
--
-- Three defects stacked on this function and the dashboard failed on all of
-- them at once ("Could not find the function public.get_top_courses(result_limit)"):
--
--   1. Parameter name. The function took `course_limit`; the dashboard calls it
--      with `result_limit`. PostgREST resolves overloads by argument NAME, so
--      the call never matched and surfaced as "function not found".
--   2. Column names. The body still referenced the legacy `courses.name` and
--      `courses.status`, dropped when the table was recreated with `title` and
--      `is_published`.
--   3. Grants. 20261022100000 revoked execute from `authenticated` on the
--      premise that the admin panel calls this with the service role. It does
--      not — the panel uses the cookie-backed anon client, so the caller is
--      `authenticated` and would have hit permission-denied next.
--
-- The revoke was standing in for an authorization check, so the check now lives
-- in the body: SECURITY DEFINER plus an explicit admin gate, which is what the
-- earlier migration said it could not express.
--
-- Revenue is also corrected. Joining enrollments and orders in one GROUP BY
-- fanned the rows out and multiplied SUM(final_amount) by the enrollment count.
-- Scalar subqueries keep the two aggregates independent.
-- ---------------------------------------------------------------------------

-- The parameter name is part of the identity PostgREST resolves on, so the old
-- signature has to go rather than be replaced in place.
drop function if exists public.get_top_courses(int);

create function public.get_top_courses(result_limit int default 5)
returns json
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
      from public.admin_users au
     where au.user_id = auth.uid()
       and coalesce(au.is_active, true) = true
  ) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  return (
    select coalesce(json_agg(row_to_json(c)), '[]'::json)
    from (
      select
        co.id,
        co.title,
        co.slug,
        co.thumbnail_url,
        co.is_published,
        co.price,
        (
          select count(*)
            from public.enrollments e
           where e.course_id = co.id
        ) as enrollment_count,
        (
          select coalesce(sum(o.final_amount), 0)
            from public.orders o
           where o.course_id = co.id
             and o.status = 'completed'
        ) as total_revenue
      from public.courses co
      where co.is_published = true
      order by enrollment_count desc, co.created_at desc
      limit greatest(result_limit, 0)
    ) c
  );
end;
$$;

revoke execute on function public.get_top_courses(int) from public, anon;
grant  execute on function public.get_top_courses(int) to authenticated, service_role;
