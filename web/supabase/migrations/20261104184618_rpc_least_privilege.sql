-- Callable functions, cut down to who actually needs them.
--
-- The security advisor listed every SECURITY DEFINER function a signed-out
-- visitor can call over PostgREST. Each one was read rather than revoked in
-- bulk, because several of them have to stay callable or the site breaks.


-- Revenue reports: super admin and accountant, as everywhere else.
--
-- These already refused anyone who was not an admin, so nothing reached the
-- public. But "an admin" includes teacher, content creator, support staff and
-- technical, and the role table gives revenue to two roles only. The panel
-- and the dashboard both gate on FINANCE_ROLES; the functions were the one
-- place that did not, so a teacher calling them directly saw every rupee.

create or replace function public.get_daily_orders(
  start_date timestamp with time zone default null,
  end_date   timestamp with time zone default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.has_admin_role(array['super_admin', 'accountant']::public.user_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(json_agg(row_to_json(d)), '[]'::json)
    from (
      select
        date_trunc('day', created_at)::date as day,
        count(*)                            as order_count,
        coalesce(sum(final_amount), 0)      as revenue
      from public.orders
      where status = 'completed'
        and (start_date is null or created_at >= start_date)
        and (end_date   is null or created_at <= end_date)
      group by date_trunc('day', created_at)::date
      order by day asc
    ) d
  );
end;
$function$;

create or replace function public.get_payment_method_breakdown(
  start_date timestamp with time zone default null,
  end_date   timestamp with time zone default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.has_admin_role(array['super_admin', 'accountant']::public.user_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(json_agg(row_to_json(r)), '[]'::json)
    from (
      select
        payment_method as method,
        count(*)       as order_count,
        coalesce(sum(final_amount), 0) as total_amount
      from public.orders
      where status = 'completed'
        and (start_date is null or created_at >= start_date)
        and (end_date   is null or created_at <= end_date)
      group by payment_method
      order by total_amount desc
    ) r
  );
end;
$function$;

create or replace function public.get_refund_stats(
  start_date timestamp with time zone default null,
  end_date   timestamp with time zone default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  result json;
begin
  if not public.has_admin_role(array['super_admin', 'accountant']::public.user_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select json_build_object(
    'total_refunds',        count(*),
    'total_refund_amount',  coalesce(sum(amount), 0),
    'pending_count',        count(*) filter (where status = 'requested'),
    'approved_count',       count(*) filter (where status = 'approved'),
    'processed_count',      count(*) filter (where status = 'processed'),
    'rejected_count',       count(*) filter (where status = 'rejected')
  ) into result
  from public.refunds
  where (start_date is null or created_at >= start_date)
    and (end_date   is null or created_at <= end_date);

  return result;
end;
$function$;

create or replace function public.get_revenue_stats(
  start_date timestamp with time zone default null,
  end_date   timestamp with time zone default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  result json;
begin
  if not public.has_admin_role(array['super_admin', 'accountant']::public.user_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select json_build_object(
    'total_revenue', coalesce(sum(final_amount), 0),
    'total_orders',  count(*),
    'monthly_revenue', (
      select coalesce(json_agg(row_to_json(m)), '[]'::json)
      from (
        select
          date_trunc('month', created_at) as month,
          sum(final_amount)               as revenue,
          count(*)                        as order_count
        from public.orders
        where status = 'completed'
          and (start_date is null or created_at >= start_date)
          and (end_date   is null or created_at <= end_date)
        group by date_trunc('month', created_at)
        order by month desc
        limit 12
      ) m
    )
  ) into result
  from public.orders
  where status = 'completed'
    and (start_date is null or created_at >= start_date)
    and (end_date   is null or created_at <= end_date);

  return result;
end;
$function$;

-- A signed-out caller could only ever be refused; now it is refused before
-- the function runs at all.
revoke execute on function public.get_daily_orders(timestamptz, timestamptz) from public, anon;
revoke execute on function public.get_payment_method_breakdown(timestamptz, timestamptz) from public, anon;
revoke execute on function public.get_refund_stats(timestamptz, timestamptz) from public, anon;
revoke execute on function public.get_revenue_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_daily_orders(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_payment_method_breakdown(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_refund_stats(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_revenue_stats(timestamptz, timestamptz) to authenticated;


-- Student codes are minted by the insert trigger, never asked for.
--
-- next_student_code() calls nextval() on student_code_seq, and anyone --
-- signed in or not -- could call it over PostgREST. Every call burns a code,
-- so a loop from outside could leave gaps of thousands in the DE26-xxxxx
-- series the centre hands out at the counter. Its only legitimate caller is
-- assign_student_codes(), a trigger function, which runs as its owner and
-- keeps the access it needs. A trigger function cannot usefully be called
-- through the API either, so it goes too.
revoke execute on function public.next_student_code() from public, anon, authenticated;
revoke execute on function public.assign_student_codes() from public, anon, authenticated;


-- Finishing a profile needs a signed-in student; a visitor could only be
-- refused by the function's own auth.uid() check.
revoke execute on function public.complete_student_profile(jsonb) from public, anon;
grant execute on function public.complete_student_profile(jsonb) to authenticated;


-- Deliberately left callable by signed-out visitors, and said so here so the
-- advisor's warning about them is not "fixed" later:
--
--   is_admin(), is_super_admin(), has_admin_role(), current_student_id(),
--   get_student_id()
--     Row-level policies on public tables call these while evaluating reads
--     by the anon role. Revoking anon's EXECUTE makes those reads fail outright
--     instead of returning the public rows, which would take the course pages
--     down. For a signed-out caller they answer false or null.
--   get_course_syllabus(uuid), get_course_outline(uuid)
--     The syllabus a buyer reads before paying. Marketing columns only.
--   current_live_class_title()
--     The title shown on the public "live now" banner.
comment on function public.is_admin() is
  'Used by RLS policies that apply to anon; must stay executable by anon. Returns false for a signed-out caller.';
comment on function public.is_super_admin() is
  'Used by RLS policies that apply to anon; must stay executable by anon. Returns false for a signed-out caller.';
comment on function public.current_student_id() is
  'students.id for auth.uid(). Used by RLS policies that apply to anon; must stay executable by anon. Null for a signed-out caller.';
comment on function public.get_student_id() is
  'students.id for auth.uid(). Used by RLS policies that apply to anon; must stay executable by anon. Null for a signed-out caller.';


-- Signed-out reads were failing on fifteen tables.
--
-- Policies such as "Content admins can manage subjects" are written for the
-- public role and call has_admin_role(). Postgres evaluates every permissive
-- policy that applies to a role, so an anon read of subjects runs that
-- function too -- and anon had lost EXECUTE on it. The read then failed with
-- "permission denied for function has_admin_role" instead of returning the
-- visible rows, on subjects, topics, course_categories, testimonials,
-- banners, live_classes, tests and eight more. The home page reads
-- testimonials, banners and categories while signed out, so those sections
-- came back empty for every visitor.
--
-- The function checks the caller's own admin_users row. For a signed-out
-- caller auth.uid() is null and it answers false, so granting anon EXECUTE
-- discloses nothing. It joins the list of functions that must stay
-- callable by anon for row-level security to work at all.
grant execute on function public.has_admin_role(public.user_role[]) to anon;
comment on function public.has_admin_role(public.user_role[]) is
  'Used by RLS policies that apply to anon; must stay executable by anon or signed-out reads of every table whose policies call it fail outright. Returns false for a signed-out caller.';
