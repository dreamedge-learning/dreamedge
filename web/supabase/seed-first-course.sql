-- ============================================================================
-- SEED: First real course for Dream Edge Online
-- Run once: npx supabase db execute --linked -f supabase/seed-first-course.sql
-- Safe to re-run: uses ON CONFLICT DO NOTHING where possible.
-- ============================================================================

begin;

-- 1. COURSE — Class 8 Maths Foundation (FREE for now)
insert into public.courses (
  id, title, slug, description, long_description,
  class, subject, teacher_name,
  price, original_price, currency, validity_days,
  is_published, is_featured, difficulty,
  total_lessons, duration_hours,
  meta_title, meta_description
) values (
  'a1b2c3d4-0001-4000-8000-000000000001',
  'Class 8 Maths — Foundation Course',
  'class-8-maths-foundation',
  'Build a rock-solid maths foundation for Class 8 CBSE. Covers Number Systems, Algebra, Geometry and Data Handling with concept-first teaching by IITian mentors.',
  E'This course covers the complete Class 8 CBSE Maths syllabus through Dream IIT''s concept-first approach.\n\n**What you''ll learn:**\n- Rational Numbers and their properties\n- Linear Equations in One Variable\n- Algebraic Expressions and Identities\n- Squares, Square Roots, Cubes and Cube Roots\n- Practical Geometry and Mensuration\n- Data Handling and Probability\n\n**How it works:**\n- Short, focused video lessons (10-20 minutes each)\n- Downloadable notes for every chapter\n- Practice tests after every topic\n- Live doubt-clearing sessions\n\nBuilt on the same system Dream IIT Institute has used to mentor 5,000+ students in Nagpur since 2017.',
  'Class 8', 'Mathematics', 'Rahul Sir',
  0, 499, 'INR', 365,
  true, true, 'beginner',
  12, 8.5,
  'Class 8 Maths Foundation — Dream Edge Online',
  'Master Class 8 CBSE Maths with concept-based learning. Free foundation course by IITian mentors at Dream Edge Online.'
) on conflict (slug) do nothing;

-- 2. SUBJECTS (chapters)
insert into public.subjects (id, course_id, name, slug, color_code, weight, is_visible) values
  ('b1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'Number Systems', 'number-systems', '#F26A21', 1, true),
  ('b1b2c3d4-0002-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'Algebra', 'algebra', '#16223B', 2, true),
  ('b1b2c3d4-0003-4000-8000-000000000001', 'a1b2c3d4-0001-4000-8000-000000000001', 'Geometry', 'geometry', '#C9A84C', 3, true)
on conflict do nothing;

-- 3. TOPICS (sub-chapters)
insert into public.topics (id, subject_id, name, slug, description, weight, is_visible) values
  -- Number Systems
  ('c1b2c3d4-0001-4000-8000-000000000001', 'b1b2c3d4-0001-4000-8000-000000000001', 'Rational Numbers', 'rational-numbers', 'Properties and operations on rational numbers', 1, true),
  ('c1b2c3d4-0002-4000-8000-000000000001', 'b1b2c3d4-0001-4000-8000-000000000001', 'Squares and Square Roots', 'squares-square-roots', 'Perfect squares, finding square roots, estimation', 2, true),
  -- Algebra
  ('c1b2c3d4-0003-4000-8000-000000000001', 'b1b2c3d4-0002-4000-8000-000000000001', 'Linear Equations', 'linear-equations', 'Solving linear equations in one variable', 1, true),
  -- Geometry
  ('c1b2c3d4-0004-4000-8000-000000000001', 'b1b2c3d4-0003-4000-8000-000000000001', 'Quadrilaterals', 'quadrilaterals', 'Properties and types of quadrilaterals', 1, true)
on conflict do nothing;

-- 4. CONTENT ITEMS — mix of types to test the player
insert into public.content_items (id, topic_id, type, title, description, duration_seconds, is_paid, status, weight) values
  -- Rational Numbers: 2 free items
  ('d1b2c3d4-0001-4000-8000-000000000001', 'c1b2c3d4-0001-4000-8000-000000000001', 'video',
   'What are Rational Numbers?',
   'Introduction to rational numbers — definition, examples, and where they sit on the number line.',
   720, false, 'published', 1),
  ('d1b2c3d4-0002-4000-8000-000000000001', 'c1b2c3d4-0001-4000-8000-000000000001', 'note',
   'Rational Numbers — Summary Notes',
   'Quick-reference notes covering definitions, properties and key formulas.',
   null, false, 'published', 2),
  -- Squares: 1 free item
  ('d1b2c3d4-0003-4000-8000-000000000001', 'c1b2c3d4-0002-4000-8000-000000000001', 'video',
   'Perfect Squares and Patterns',
   'Recognising perfect squares, digit-sum patterns, and quick tricks for squaring numbers ending in 5.',
   900, false, 'published', 1),
  -- Linear Equations: 1 free item
  ('d1b2c3d4-0004-4000-8000-000000000001', 'c1b2c3d4-0003-4000-8000-000000000001', 'video',
   'Solving Linear Equations — Basics',
   'Step-by-step method for solving ax + b = c, with 5 practice problems.',
   840, false, 'published', 1),
  -- Quadrilaterals: 1 free item
  ('d1b2c3d4-0005-4000-8000-000000000001', 'c1b2c3d4-0004-4000-8000-000000000001', 'note',
   'Types of Quadrilaterals — Cheat Sheet',
   'Parallelogram, rectangle, rhombus, square, trapezium — properties at a glance.',
   null, false, 'published', 1)
on conflict do nothing;

-- 5. TESTIMONIALS — real Dream IIT students (names changed for privacy)
insert into public.testimonials (id, student_name, class, rating, content, is_visible, weight) values
  ('e1b2c3d4-0001-4000-8000-000000000001', 'Ananya S.', 'Class 9',  5,
   'Rahul Sir explains concepts in a way that just clicks. My maths score went from 68 to 91 in two terms.',
   true, 1),
  ('e1b2c3d4-0002-4000-8000-000000000001', 'Rohan M.', 'Class 8', 5,
   'The notes and videos are short but cover everything. I used to hate algebra — now it''s my strongest chapter.',
   true, 2),
  ('e1b2c3d4-0003-4000-8000-000000000001', 'Priya K.', 'Class 10', 5,
   'I joined Dream IIT in Class 8 and scored 95+ in both 9th and 10th boards. The foundation courses actually work.',
   true, 3)
on conflict do nothing;

commit;
