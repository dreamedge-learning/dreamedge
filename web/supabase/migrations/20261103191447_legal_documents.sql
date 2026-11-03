-- The three policy pages, as rows instead of JSX.
--
-- They were hardcoded components, which made a typo in the refund policy a
-- code change and a deploy -- and left the person legally responsible for the
-- text unable to touch it. The body is plain text in a small fixed syntax
-- (see lib/legal.ts), parsed into blocks and rendered as text: not HTML, so
-- nothing an admin types can become markup on a page every student reads.

create table public.legal_documents (
  slug           text primary key
                   check (slug in ('refund-policy', 'privacy-policy', 'terms')),
  title          text not null,
  effective_date date not null,
  body           text not null,
  updated_by     uuid references public.admin_users(id) on delete set null,
  updated_at     timestamptz not null default now()
);

comment on table public.legal_documents is
  'Refund, privacy and terms page content. Body syntax: ## heading, - bullet, blank line between blocks, **bold**, [label](/path), {{support_email}}.';

create trigger legal_documents_updated_at
  before update on public.legal_documents
  for each row execute function public.update_updated_at();

alter table public.legal_documents enable row level security;

-- Readable by everyone, signed out included: these are public pages, and a
-- policy nobody can read is not a policy.
create policy "legal_documents_public_read" on public.legal_documents
  for select to anon, authenticated
  using (true);

-- Writes are super admin only, deliberately narrower than the rest of
-- Settings. `technical` owns integrations and logs; the refund terms are a
-- commitment to a paying customer, which is a different kind of authority.
create policy "legal_documents_super_write" on public.legal_documents
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
