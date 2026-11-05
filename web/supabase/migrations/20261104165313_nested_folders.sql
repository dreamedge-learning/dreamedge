-- Folders inside folders.
--
-- A course was exactly two levels deep: subject, then topic, then lessons.
-- Real course material is not that tidy -- a chapter splits into concept
-- videos, worksheets and a revision set, and each of those wants a folder of
-- its own -- so a topic may now sit inside another topic, to any depth.
--
-- The shape is deliberately a parent pointer on the existing table rather
-- than a new folders table. Every topic keeps its subject_id, and the trigger
-- below keeps it equal to the root subject of whatever branch the topic is
-- on. That one invariant is what lets everything downstream ignore nesting
-- entirely: check_offline_entitlements, the content_items read policy and
-- get_course_syllabus all reach the course through topics.subject_id, and
-- none of them needs to know how deep a lesson is buried. A client that has
-- not learned about parent_topic_id still sees every folder, flattened under
-- its subject, so nothing becomes unreachable while the readers catch up.

alter table public.topics
  add column if not exists parent_topic_id uuid
    references public.topics (id) on delete cascade;

create index if not exists idx_topics_parent on public.topics (parent_topic_id);

comment on column public.topics.parent_topic_id is
  'Enclosing folder. Null for a folder directly under its subject. subject_id is always the root subject of the branch, maintained by topics_keep_tree_whole.';

-- Not security definer on purpose: it runs as whoever is moving the folder,
-- and every read it makes is one that caller's RLS already allows.
create or replace function public.topics_keep_tree_whole()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_parent_subject uuid;
  v_cursor         uuid;
  v_hops           integer := 0;
  v_from_course    uuid;
  v_to_course      uuid;
begin
  if new.parent_topic_id is not null then
    if new.parent_topic_id = new.id then
      raise exception 'A folder cannot be placed inside itself.'
        using errcode = '23514';
    end if;

    select t.subject_id into v_parent_subject
      from public.topics t
     where t.id = new.parent_topic_id;

    if v_parent_subject is null then
      raise exception 'The destination folder no longer exists.'
        using errcode = '23503';
    end if;

    -- Walk up from the proposed parent. Meeting this folder on the way means
    -- the move would hang a branch off its own descendant and orphan it from
    -- the course. Only an update can do that; a new row has no descendants.
    if tg_op = 'UPDATE' then
      v_cursor := new.parent_topic_id;
      while v_cursor is not null loop
        if v_cursor = new.id then
          raise exception 'A folder cannot be moved into one of its own subfolders.'
            using errcode = '23514';
        end if;
        v_hops := v_hops + 1;
        if v_hops > 500 then
          raise exception 'Folder tree is malformed at %.', new.id;
        end if;
        select t.parent_topic_id into v_cursor
          from public.topics t
         where t.id = v_cursor;
      end loop;
    end if;

    -- A folder belongs to the subject its branch grows from. Whatever subject
    -- the caller sent is overruled rather than trusted.
    new.subject_id := v_parent_subject;
  end if;

  -- Moving between courses would move lessons across a paywall: students of
  -- the old course lose them, students of the new one gain them without
  -- paying. That is a decision for a person, not a stray drag.
  if tg_op = 'UPDATE' and new.subject_id is distinct from old.subject_id then
    select s.course_id into v_from_course from public.subjects s where s.id = old.subject_id;
    select s.course_id into v_to_course   from public.subjects s where s.id = new.subject_id;
    if v_from_course is distinct from v_to_course then
      raise exception 'Folders can only be moved within the same course.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$fn$;

create or replace trigger topics_keep_tree_whole
  before insert or update of parent_topic_id, subject_id on public.topics
  for each row execute function public.topics_keep_tree_whole();

-- When a branch moves to another subject, everything beneath it moves too.
-- Each child update fires the before-trigger above, which re-derives the
-- child's subject from its (already moved) parent, and then this trigger
-- again for the grandchildren -- so the whole subtree follows level by level.
create or replace function public.topics_carry_subject_down()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  update public.topics
     set subject_id = new.subject_id
   where parent_topic_id = new.id
     and subject_id is distinct from new.subject_id;
  return null;
end;
$fn$;

create or replace trigger topics_carry_subject_down
  after update of subject_id on public.topics
  for each row
  when (old.subject_id is distinct from new.subject_id)
  execute function public.topics_carry_subject_down();

revoke all on function public.topics_keep_tree_whole() from public, anon, authenticated;
revoke all on function public.topics_carry_subject_down() from public, anon, authenticated;


-- Source documents are for teachers.
--
-- A .pptx or .docx cannot be shown by the website's reader or the app's, and
-- a downloaded one is outside our control entirely. Students get the PDF
-- export of a lesson; the PowerPoint or Word original stays attached for the
-- teachers who will edit it next year. Generated from the stored name so it
-- cannot disagree with the file it describes.
alter table public.content_files
  add column if not exists is_source_document boolean
    generated always as (
      lower(storage_path) ~ '\.(ppt|pptx|pps|ppsx|pot|potx|doc|docx|dot|dotx|xls|xlsx|odp|odt|ods|key|pages|numbers)$'
    ) stored;

comment on column public.content_files.is_source_document is
  'An editable original (PowerPoint, Word, Excel and equivalents). Visible to content admins only; students are served the PDF export.';

-- The student-facing read follows its content item as before, minus the
-- originals. The admin ALL policy is untouched, so admins still see them.
alter policy "Content files follow their content item"
  on public.content_files
  using (
    not is_source_document
    and exists (
      select 1 from public.content_items ci
       where ci.id = content_files.content_item_id
    )
  );


-- The syllabus as a tree.
--
-- get_course_syllabus stays exactly as it is: it is anon-callable and live
-- clients depend on its shape, and widening a RETURNS TABLE means recreating it.
-- This is its successor. One row per node -- subject, folder or lesson --
-- each naming its parent, so a client builds the tree in one pass however
-- deep it goes. The same marketing-only column whitelist applies: titles,
-- types, durations and posters, never anything that can be turned into
-- playback. A hidden folder hides everything beneath it.
create or replace function public.get_course_outline(p_course_id uuid)
returns table (
  node_kind        text,
  node_id          uuid,
  parent_id        uuid,
  name             text,
  weight           integer,
  item_type        public.content_type,
  item_is_paid     boolean,
  item_duration    integer,
  item_poster_url  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with recursive
  course as (
    select c.id from public.courses c
     where c.id = p_course_id and c.is_published = true
  ),
  subj as (
    select s.id, s.name, s.weight
      from public.subjects s
      join course on course.id = s.course_id
     where coalesce(s.is_visible, true)
  ),
  folder as (
    select t.id, t.subject_id as parent_id, t.name, t.weight
      from public.topics t
      join subj on subj.id = t.subject_id
     where t.parent_topic_id is null
       and coalesce(t.is_visible, true)
    union all
    select t.id, t.parent_topic_id, t.name, t.weight
      from public.topics t
      join folder f on f.id = t.parent_topic_id
     where coalesce(t.is_visible, true)
  )
  select 'subject'::text, subj.id, null::uuid, subj.name, subj.weight,
         null::public.content_type, null::boolean, null::integer, null::text
    from subj
  union all
  select 'folder'::text, folder.id, folder.parent_id, folder.name, folder.weight,
         null::public.content_type, null::boolean, null::integer, null::text
    from folder
  union all
  select 'lesson'::text, ci.id, ci.topic_id, ci.title, ci.weight,
         ci.type, ci.is_paid, ci.duration_seconds, ci.poster_url
    from public.content_items ci
    join folder on folder.id = ci.topic_id
   where ci.status = 'published';
$fn$;

comment on function public.get_course_outline(uuid) is
  'Marketing-safe course outline as a tree: one row per subject, folder or published lesson, each naming its parent. Same column whitelist as get_course_syllabus. Readable by anon.';

revoke all on function public.get_course_outline(uuid) from public;
grant execute on function public.get_course_outline(uuid) to anon, authenticated, service_role;
