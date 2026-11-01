-- ============================================================================
-- Fix student_progress table to match the application code.
--
-- The live table has lesson_id + progress_pct (from the lessons_progress
-- migration), but the application code writes content_item_id +
-- progress_percentage. The lessons table is dead — nothing reads or writes
-- it — while content_items is the real content hierarchy.
--
-- Safe: the table is empty (zero students, zero progress rows).
-- ============================================================================

begin;

drop table if exists public.student_progress cascade;

create table public.student_progress (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.students(id) on delete cascade,
  content_item_id       uuid not null references public.content_items(id) on delete cascade,
  status                text not null default 'not_started',
  progress_percentage   numeric(5,2) not null default 0.00,
  last_position_seconds integer default 0,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(student_id, content_item_id)
);

create index idx_progress_student_id on public.student_progress(student_id);
create index idx_progress_content_item on public.student_progress(content_item_id);

alter table public.student_progress enable row level security;

-- Student can read their own progress
create policy progress_self_read
  on public.student_progress for select
  to authenticated
  using (student_id = public.current_student_id());

-- Student can insert their own progress
create policy progress_self_write
  on public.student_progress for insert
  to authenticated
  with check (student_id = public.current_student_id());

-- Student can update their own progress
create policy progress_self_update
  on public.student_progress for update
  to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

-- Admin can read all progress
create policy progress_staff_read
  on public.student_progress for select
  to authenticated
  using (public.is_admin());

-- Service role full access (for server actions)
create policy progress_service_all
  on public.student_progress for all
  to service_role
  using (true)
  with check (true);

-- updated_at trigger
create or replace function update_progress_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists progress_updated_at on public.student_progress;
create trigger progress_updated_at
  before update on public.student_progress
  for each row
  execute function update_progress_updated_at();

commit;
