-- Enable pg_cron and register the publishing job.
--
-- Separate from the migration that created `publish_due_content`, because the
-- extension brings its own schema and the job has to be registered after the
-- function it calls exists.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Idempotent: a re-applied migration must not leave two jobs publishing the
-- same rows. Re-registered rather than skipped when the schedule differs, so
-- this file stays the source of truth for the cadence.
do $outer$
declare
  v_schedule text := '*/5 * * * *';
  v_current  text;
begin
  select j.schedule into v_current from cron.job j where j.jobname = 'publish-due-content';

  if v_current is null then
    perform cron.schedule('publish-due-content', v_schedule,
                          $job$select public.publish_due_content();$job$);
  elsif v_current <> v_schedule then
    perform cron.unschedule('publish-due-content');
    perform cron.schedule('publish-due-content', v_schedule,
                          $job$select public.publish_due_content();$job$);
  end if;
end;
$outer$;
