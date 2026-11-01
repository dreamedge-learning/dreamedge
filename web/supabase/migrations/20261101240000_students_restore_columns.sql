-- ---------------------------------------------------------------------------
-- Restore two columns the `students` rebuild dropped.
--
-- The "Option C" rebuild (20261016200000 / 20261017100000) recreated the table
-- without `board` and `wallet_balance`, but fetchStudentDetail still selected
-- both. PostgREST rejects an entire select on one unknown column, so clicking
-- any student in /admin/students opened a completely blank drawer -- no
-- profile, no courses, no tests, no orders -- with a generic toast and the
-- real cause (42703) only in the server log.
--
-- Both are additive and nullable-or-defaulted, so no existing row changes.
--
-- Deliberately NOT included: dropping NOT NULL from `students.user_id` and
-- `students.email`. An earlier draft of this migration did both, to make
-- "Convert to student" work for a lead who has no login yet. That trade was
-- considered and declined: every student-facing RLS policy resolves access
-- through `user_id`, so a row without one is invisible to the person it
-- describes and unreachable by the policies that are supposed to protect it,
-- and nothing would stop such rows accumulating unnoticed.
--
-- Lead conversion instead marks the lead and lets the student record be
-- created at registration, which is the first moment an auth user exists to
-- attach it to. See convertLeadToStudent in the students admin actions.
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists board text,
  add column if not exists wallet_balance numeric(10,2) not null default 0.00;

comment on column public.students.board is
  'Examination board the student follows (CBSE, state board, ...). Nullable: not collected at registration.';

comment on column public.students.wallet_balance is
  'Store credit in INR. Held here rather than derived from a ledger because there is no wallet transaction table yet.';
