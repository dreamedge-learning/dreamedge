-- Put the two tables the panel subscribes to into the realtime publication.
--
-- `supabase_realtime` was empty. The dashboard's activity feed has been
-- subscribing to INSERTs on `audit_log` since it was built and has never
-- received one, because a table that is not in the publication produces no
-- changes to broadcast -- the subscription succeeds and then sits silent,
-- which is why nobody noticed. `admin_applications` needs the same thing for
-- the new-application toast.
--
-- RLS still decides who receives a row: postgres_changes evaluates the
-- subscriber's policies, so only a super admin is sent an application.

alter publication supabase_realtime add table public.audit_log;
alter publication supabase_realtime add table public.admin_applications;
