begin;

-- ---------------------------------------------------------------------------
-- offline_check_in: one round trip that answers everything a licence sweep
-- needs, and stamps the heartbeat while it is there.
--
-- The sweep used to call check_offline_entitlements on its own and treat an
-- empty result as "entitled to nothing", which is only one of the two things
-- an empty result can mean. The other is that current_student_id() came back
-- null -- a missing students row, an RLS change, a definer regression -- and
-- the function's own `where current_student_id() is not null` guard turns that
-- into zero rows, indistinguishable from a student whose every enrolment has
-- lapsed. The app then deleted every downloaded file on the device.
--
-- So the two are separated here rather than guessed at on the client:
--
--   student_id    null when the caller could not be resolved to a student at
--                 all. The sweep must not revoke anything on that answer.
--   entitlements  the rows check_offline_entitlements returns, unchanged. The
--                 paywall rule still lives there and only there.
--   server_now    the server's own clock, which is the only clock a licence
--                 decision may be made against. The device's belongs to the
--                 student, and a licence measured by it is defeated by the
--                 date settings.
--
-- `p_device_id` is optional and stamps content_downloads.last_verified_at for
-- that device in the same statement, so support can see when a device last
-- checked in and a device that has gone quiet is visible as such. Doing it
-- here rather than in a second call means the stamp cannot claim a check that
-- did not happen.
-- ---------------------------------------------------------------------------

create or replace function public.offline_check_in(
  p_device_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := public.current_student_id();
  v_rows    jsonb;
begin
  if v_student is null then
    -- Said plainly rather than as an empty list. The caller has to be able to
    -- tell this apart from a student who owns nothing.
    return jsonb_build_object(
      'server_now',   to_jsonb(now()),
      'student_id',   null,
      'entitlements', '[]'::jsonb
    );
  end if;

  if p_device_id is not null and p_device_id <> '' then
    update public.content_downloads
       set last_verified_at = now()
     where student_id = v_student
       and device_id  = p_device_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
    into v_rows
    from public.check_offline_entitlements() e;

  return jsonb_build_object(
    'server_now',   to_jsonb(now()),
    'student_id',   to_jsonb(v_student),
    'entitlements', v_rows
  );
end;
$$;

revoke execute on function public.offline_check_in(text) from public, anon;
grant  execute on function public.offline_check_in(text) to authenticated;

commit;
