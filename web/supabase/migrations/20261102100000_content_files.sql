-- ---------------------------------------------------------------------------
-- Many files per content item.
--
-- `content_items.file_url` held one of two unrelated things: a link to media
-- hosted elsewhere, or a path inside the private `content-files` bucket. One
-- column, two meanings, and the application had to sniff the value to tell
-- which it had -- which is what quietly broke the PDF viewer when the bucket
-- went private.
--
-- The two are now separated:
--
--   content_items.file_url  -- an external link, nothing else
--   content_files           -- every file uploaded into our own storage
--
-- A content item may have any number of files, ordered by `weight`. The first
-- is what the player embeds; the rest are offered as attachments.
-- ---------------------------------------------------------------------------

create table if not exists content_files (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,

  -- Object path inside the private `content-files` bucket. Unique, because
  -- two rows pointing at one object would make deletion unsafe: removing one
  -- row would pull the object out from under the other.
  storage_path    text not null unique,

  -- What the admin sees and what the student downloads it as. Seeded from the
  -- uploaded filename and editable afterwards.
  display_name    text not null,

  size_bytes      bigint not null default 0,
  mime_type       text,
  weight          integer not null default 0,
  uploaded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_content_files_item
  on content_files (content_item_id, weight, created_at);

-- ---------------------------------------------------------------------------
-- Move existing uploads out of `file_url`.
--
-- A value with no scheme is a bucket path put there by the old uploader. Those
-- become rows here; real links are left where they are. The old uploader wrote
-- every file to `content/<id>/file.<ext>`, so the name carries no information
-- and the item's own title is a better display name than "file.pdf".
-- ---------------------------------------------------------------------------

insert into content_files (content_item_id, storage_path, display_name, weight)
select ci.id,
       ci.file_url,
       ci.title || '.' || lower(regexp_replace(ci.file_url, '^.*\.', '')),
       0
  from content_items ci
 where ci.file_url is not null
   and ci.file_url !~ '^[a-z][a-z0-9+.-]*:'
   and ci.file_url ~ '\.'
on conflict (storage_path) do nothing;

update content_items
   set file_url = null
 where file_url is not null
   and file_url !~ '^[a-z][a-z0-9+.-]*:';

-- ---------------------------------------------------------------------------
-- Row-level security.
--
-- A file is exactly as visible as the item it hangs off. Rather than restate
-- the published/paid/enrolled rules here and let the two drift, the policy
-- asks whether the caller can see the parent row: the subquery is itself
-- filtered by the policies already on `content_items`, so there is one
-- definition of who may see what.
--
-- Seeing the row is not the same as reading the bytes. The bucket stays
-- private and /api/content/[id]/file re-checks enrolment before it signs.
-- ---------------------------------------------------------------------------

alter table content_files enable row level security;

drop policy if exists "Content files follow their content item" on content_files;
drop policy if exists "Content admins manage content files"     on content_files;

create policy "Content files follow their content item"
  on content_files for select
  using (
    exists (
      select 1 from content_items ci
       where ci.id = content_files.content_item_id
    )
  );

create policy "Content admins manage content files"
  on content_files for all
  using (
    public.has_admin_role(array['super_admin', 'content_creator']::user_role[])
  )
  with check (
    public.has_admin_role(array['super_admin', 'content_creator']::user_role[])
  );
