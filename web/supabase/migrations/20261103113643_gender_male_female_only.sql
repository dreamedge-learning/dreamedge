-- Gender is collected as male or female only.
--
-- The column stays nullable: it is an optional field on the onboarding form
-- and on the counter registration sheet, and a blank answer must keep meaning
-- "not given" rather than being forced into one of the two values.

update public.students
   set gender = null
 where gender is not null
   and gender not in ('male', 'female');

alter table public.students drop constraint if exists students_gender_check;

alter table public.students
  add constraint students_gender_check
  check (gender is null or gender in ('male', 'female'));
