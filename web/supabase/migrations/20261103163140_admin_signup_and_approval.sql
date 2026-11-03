-- Admin signup and approval.
--
-- Admins have so far existed only by invitation: a super admin creates the
-- auth user and the `admin_users` row in one go and reads a temporary password
-- off the screen. That path stays. This adds the other direction -- somebody
-- applies, and nothing at all is created until a super admin approves them.
--
-- Three pieces: the applications themselves, a shared password that gates the
-- public form, and a private bucket for the documents an applicant attaches.

create type public.admin_application_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table public.admin_applications (
  id                     uuid primary key default uuid_generate_v4(),
  full_name              text not null,
  email                  text not null,
  phone                  text not null,

  qualification          text not null,
  institution            text,
  experience_years       integer not null default 0
                           check (experience_years between 0 and 60),
  subjects               text[] not null default '{}',
  about                  text,

  -- Nobody applies to be a super admin. Enforced here as well as in the form,
  -- because the form is the part an attacker gets to rewrite.
  requested_role         public.user_role not null
                           check (requested_role <> 'super_admin'),

  status                 public.admin_application_status not null default 'pending',

  -- [{ kind: 'cv' | 'degree' | 'id_proof', path, bytes, mime }]
  documents              jsonb not null default '[]'::jsonb,

  submitted_ip           text,

  reviewed_by            uuid references public.admin_users(id) on delete set null,
  reviewed_at            timestamptz,
  decision_reason        text,
  approved_admin_user_id uuid references public.admin_users(id) on delete set null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- A decided application has to say who decided it and when, and an approved
  -- one has to point at the admin it produced. Without these a half-failed
  -- approval leaves a row that claims an account exists when none does.
  constraint admin_applications_decided_has_reviewer
    check (status = 'pending' or (reviewed_by is not null and reviewed_at is not null)),
  constraint admin_applications_approved_has_admin
    check (status <> 'approved' or approved_admin_user_id is not null)
);

-- One live application per address. Rejected and approved rows are kept on
-- file, so the constraint has to be partial or a second attempt is impossible.
create unique index admin_applications_pending_email_key
  on public.admin_applications (lower(email))
  where status = 'pending';

create index admin_applications_status_idx
  on public.admin_applications (status, created_at desc);

create trigger admin_applications_updated_at
  before update on public.admin_applications
  for each row execute function public.update_updated_at();

alter table public.admin_applications enable row level security;

-- Super admin only, and deliberately not `technical`: these rows carry other
-- people's ID proofs and phone numbers, which is not systems access.
create policy "admin_applications_super_read" on public.admin_applications
  for select to authenticated
  using (public.is_super_admin());

create policy "admin_applications_super_update" on public.admin_applications
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "admin_applications_super_delete" on public.admin_applications
  for delete to authenticated
  using (public.is_super_admin());

-- No INSERT policy by design. Submissions arrive from a signed-out visitor, so
-- they go through the service role after the gate check rather than through a
-- policy that would have to admit `anon` to the table.

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

-- One shared password, set by the super admin, standing in front of the public
-- application form. Single row: `id` is a boolean fixed at true, so a second
-- row cannot exist and every write is an upsert on a known key.
create table public.admin_access_gate (
  id            boolean primary key default true check (id),
  password_hash text not null,
  updated_by    uuid references public.admin_users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

alter table public.admin_access_gate enable row level security;

-- No policies at all. The hash is never selected by a client -- not even by a
-- super admin -- and the two functions below are the only way in. Leaving the
-- row readable to admins would have put the gate within reach of every
-- account that can read `site_settings`, which is all six roles.

create or replace function public.set_admin_gate(p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change the admin access gate';
  end if;

  if p_password is null or length(p_password) < 10 then
    raise exception 'The gate password must be at least 10 characters';
  end if;

  insert into public.admin_access_gate (id, password_hash, updated_by, updated_at)
  values (
    true,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    (select id from public.admin_users where user_id = auth.uid()),
    now()
  )
  on conflict (id) do update
    set password_hash = excluded.password_hash,
        updated_by    = excluded.updated_by,
        updated_at    = now();
end;
$$;

create or replace function public.verify_admin_gate(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from public.admin_access_gate where id;

  -- An unset gate means closed, not open. The form has to be switched on
  -- deliberately; defaulting the other way would publish it the moment this
  -- migration lands.
  if v_hash is null then
    return false;
  end if;

  return extensions.crypt(p_password, v_hash) = v_hash;
end;
$$;

-- What the settings card needs: whether a gate exists and who last touched it.
-- Never the hash.
create or replace function public.admin_gate_status()
returns table (is_set boolean, updated_at timestamptz, updated_by_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can read the admin access gate';
  end if;

  return query
    select true,
           g.updated_at,
           a.full_name
    from public.admin_access_gate g
    left join public.admin_users a on a.id = g.updated_by
    where g.id;

  if not found then
    return query select false, null::timestamptz, null::text;
  end if;
end;
$$;

-- A security definer function is granted to PUBLIC on creation, so the grants
-- matter as much as the bodies. `verify_admin_gate` is the one an attacker
-- would want: it is reachable only by the service role, which means only
-- through the rate-limited server action, never through PostgREST.
revoke all on function public.verify_admin_gate(text) from public, anon, authenticated;
grant execute on function public.verify_admin_gate(text) to service_role;

revoke all on function public.set_admin_gate(text) from public, anon;
grant execute on function public.set_admin_gate(text) to authenticated, service_role;

revoke all on function public.admin_gate_status() from public, anon;
grant execute on function public.admin_gate_status() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

-- Private, unlike every other bucket here: a CV, a degree certificate and an
-- ID proof belong to the applicant, not to the platform. 10 MB covers a
-- phone-camera scan of a certificate without inviting a video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-documents',
  'admin-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 10485760,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin documents are readable by super admin" on storage.objects;
drop policy if exists "Admin documents are removable by super admin" on storage.objects;

create policy "Admin documents are readable by super admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'admin-documents' and public.is_super_admin());

create policy "Admin documents are removable by super admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'admin-documents' and public.is_super_admin());

-- No insert policy: an applicant is signed out. Uploads use a signed upload
-- URL minted server-side once the gate has been cleared, which carries its own
-- authority and names the key, so a visitor cannot choose where to write.
