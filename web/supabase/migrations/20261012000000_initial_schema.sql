-- Dream Edge Online — Initial Database Schema
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- ============================================
-- EXTENSIONS
-- ============================================
create extension if not exists "uuid-ossp" with schema extensions;
set local search_path to public, extensions;

-- ============================================
-- ENUMS
-- ============================================
create type user_role as enum ('super_admin', 'content_creator', 'teacher', 'accountant', 'support_staff', 'technical');
create type content_type as enum ('video', 'pdf', 'note', 'ebook', 'pyp', 'quiz');
create type content_status as enum ('draft', 'published', 'archived');
create type question_type as enum ('mcq_single', 'mcq_multiple', 'true_false', 'short_answer', 'match_pair', 'subjective', 'image_based');
create type difficulty_level as enum ('easy', 'medium', 'hard');
create type order_status as enum ('pending', 'completed', 'failed', 'refunded');
create type payment_method as enum ('razorpay', 'manual_cash', 'manual_upi', 'manual_bank');
create type refund_status as enum ('requested', 'approved', 'processed', 'rejected');
create type live_class_status as enum ('scheduled', 'live', 'ended', 'cancelled');
create type lead_status as enum ('new', 'contacted', 'interested', 'converted', 'lost');
create type notification_channel as enum ('push', 'in_app', 'email', 'sms');
create type discount_type as enum ('percentage', 'fixed');
create type enrollment_status as enum ('active', 'expired', 'cancelled');
create type student_status as enum ('active', 'inactive', 'blocked');
create type banner_position as enum ('home_top', 'home_bottom', 'course_page', 'dashboard');
create type testimonial_type as enum ('text', 'video');
create type batch_status as enum ('upcoming', 'active', 'completed', 'cancelled');

-- ============================================
-- ADMIN USERS & ROLES
-- ============================================
create table roles (
  id uuid primary key default uuid_generate_v4(),
  name user_role unique not null,
  description text,
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table admin_users (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role_id uuid references roles(id) not null,
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- COURSES & CONTENT STRUCTURE
-- ============================================
create table course_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  thumbnail_url text,
  description text,
  weight int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references course_categories(id) on delete set null,
  name text not null,
  slug text unique not null,
  description text,
  short_description text,
  thumbnail_url text,
  preview_video_url text,
  price decimal(10,2) not null default 0,
  discount_price decimal(10,2),
  validity_days int not null default 365,
  language text not null default 'Hindi',
  status content_status not null default 'draft',
  is_featured boolean not null default false,
  total_students int not null default 0,
  meta jsonb default '{}',
  weight int not null default 0,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subjects (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade not null,
  name text not null,
  slug text not null,
  color_code text default '#F26A21',
  weight int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table topics (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid references subjects(id) on delete cascade not null,
  name text not null,
  slug text not null,
  description text,
  weight int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table content_items (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid references topics(id) on delete cascade not null,
  type content_type not null,
  title text not null,
  description text,
  file_url text,
  video_id text,
  duration_seconds int,
  is_paid boolean not null default true,
  is_downloadable boolean not null default false,
  is_printable boolean not null default false,
  play_limit int,
  status content_status not null default 'draft',
  weight int not null default 0,
  metadata jsonb default '{}',
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- TESTS & QUESTIONS
-- ============================================
create table tests (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete set null,
  topic_id uuid references topics(id) on delete set null,
  name text not null,
  description text,
  instructions text,
  duration_minutes int not null default 60,
  total_marks decimal(6,2) not null default 0,
  max_attempts int not null default 1,
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  pass_percentage decimal(5,2) default 33.00,
  show_results_immediately boolean not null default true,
  show_solutions boolean not null default true,
  certificate_enabled boolean not null default false,
  status content_status not null default 'draft',
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default uuid_generate_v4(),
  test_id uuid references tests(id) on delete cascade not null,
  type question_type not null default 'mcq_single',
  content text not null,
  options jsonb,
  correct_answer jsonb not null,
  explanation text,
  hint text,
  positive_marks decimal(5,2) not null default 1.00,
  negative_marks decimal(5,2) not null default 0.00,
  difficulty difficulty_level not null default 'medium',
  topic_tag text,
  image_url text,
  weight int not null default 0,
  created_at timestamptz not null default now()
);

create table question_bank (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid references subjects(id) on delete set null,
  topic_id uuid references topics(id) on delete set null,
  type question_type not null default 'mcq_single',
  content text not null,
  options jsonb,
  correct_answer jsonb not null,
  explanation text,
  hint text,
  positive_marks decimal(5,2) not null default 1.00,
  negative_marks decimal(5,2) not null default 0.00,
  difficulty difficulty_level not null default 'medium',
  topic_tag text,
  image_url text,
  tags text[] default '{}',
  used_count int not null default 0,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- STUDENTS
-- ============================================
create table students (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  full_name text not null,
  phone text,
  email text,
  avatar_url text,
  city text,
  state text,
  class text,
  board text,
  referral_code text unique,
  referred_by uuid references students(id),
  wallet_balance decimal(10,2) not null default 0.00,
  status student_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade not null,
  course_id uuid references courses(id) on delete cascade not null,
  purchased_at timestamptz not null default now(),
  valid_until timestamptz not null,
  payment_id uuid,
  status enrollment_status not null default 'active',
  created_at timestamptz not null default now(),
  unique(student_id, course_id)
);

create table student_progress (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade not null,
  content_item_id uuid references content_items(id) on delete cascade not null,
  status text not null default 'not_started',
  progress_percentage decimal(5,2) not null default 0.00,
  last_position_seconds int default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, content_item_id)
);

create table test_attempts (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade not null,
  test_id uuid references tests(id) on delete cascade not null,
  answers jsonb not null default '{}',
  score decimal(6,2),
  total_marks decimal(6,2),
  percentage decimal(5,2),
  time_taken_seconds int,
  attempt_number int not null default 1,
  submitted_at timestamptz not null default now()
);

-- ============================================
-- ORDERS & PAYMENTS
-- ============================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade not null,
  course_id uuid references courses(id) on delete cascade not null,
  amount decimal(10,2) not null,
  discount_amount decimal(10,2) not null default 0,
  final_amount decimal(10,2) not null,
  payment_method payment_method not null default 'razorpay',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  status order_status not null default 'pending',
  invoice_url text,
  invoice_number text,
  referral_code_used text,
  remarks text,
  processed_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade not null,
  amount decimal(10,2) not null,
  reason text not null,
  status refund_status not null default 'requested',
  razorpay_refund_id text,
  processed_by uuid references admin_users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- LIVE CLASSES
-- ============================================
create table live_classes (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid references courses(id) on delete cascade not null,
  subject_id uuid references subjects(id) on delete set null,
  teacher_id uuid references admin_users(id) on delete set null,
  title text not null,
  description text,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 60,
  platform text default 'in_app',
  meeting_url text,
  status live_class_status not null default 'scheduled',
  recording_url text,
  rewatch_content_id uuid references content_items(id) on delete set null,
  attendee_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  message text not null,
  channel notification_channel not null default 'in_app',
  thumbnail_url text,
  action_url text,
  target_type text not null default 'all',
  target_id uuid,
  course_id uuid references courses(id) on delete set null,
  is_read boolean not null default false,
  sent_by uuid references admin_users(id),
  sent_at timestamptz not null default now()
);

create table student_notifications (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references students(id) on delete cascade not null,
  notification_id uuid references notifications(id) on delete cascade not null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- LEADS & MARKETING
-- ============================================
create table leads (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  email text,
  class text,
  source text,
  status lead_status not null default 'new',
  remarks text,
  assigned_to uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table referral_codes (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  student_id uuid references students(id) on delete set null,
  discount_type discount_type not null default 'percentage',
  discount_value decimal(10,2) not null default 10.00,
  usage_count int not null default 0,
  max_uses int,
  is_active boolean not null default true,
  valid_until timestamptz,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create table banners (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  action_url text,
  position banner_position not null default 'home_top',
  is_active boolean not null default true,
  weight int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);

create table testimonials (
  id uuid primary key default uuid_generate_v4(),
  student_name text not null,
  student_photo_url text,
  content text,
  video_url text,
  rating int default 5,
  class text,
  year text,
  type testimonial_type not null default 'text',
  is_visible boolean not null default true,
  weight int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- BATCHES (Future — tables ready)
-- ============================================
create table batches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  course_id uuid references courses(id) on delete cascade not null,
  teacher_id uuid references admin_users(id) on delete set null,
  start_date date,
  end_date date,
  max_students int default 50,
  status batch_status not null default 'upcoming',
  created_at timestamptz not null default now()
);

create table batch_students (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid references batches(id) on delete cascade not null,
  student_id uuid references students(id) on delete cascade not null,
  enrolled_at timestamptz not null default now(),
  unique(batch_id, student_id)
);

-- ============================================
-- AUDIT LOG
-- ============================================
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================
create index idx_courses_category on courses(category_id);
create index idx_courses_status on courses(status);
create index idx_subjects_course on subjects(course_id);
create index idx_topics_subject on topics(subject_id);
create index idx_content_items_topic on content_items(topic_id);
create index idx_content_items_type on content_items(type);
create index idx_questions_test on questions(test_id);
create index idx_students_user on students(user_id);
create index idx_enrollments_student on enrollments(student_id);
create index idx_enrollments_course on enrollments(course_id);
create index idx_orders_student on orders(student_id);
create index idx_orders_status on orders(status);
create index idx_test_attempts_student on test_attempts(student_id);
create index idx_test_attempts_test on test_attempts(test_id);
create index idx_live_classes_course on live_classes(course_id);
create index idx_live_classes_scheduled on live_classes(scheduled_at);
create index idx_notifications_target on notifications(target_type, target_id);
create index idx_student_notifications_student on student_notifications(student_id);
create index idx_audit_log_entity on audit_log(entity_type, entity_id);
create index idx_audit_log_user on audit_log(user_id);
create index idx_audit_log_created on audit_log(created_at);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
create trigger set_updated_at before update on admin_users for each row execute function update_updated_at();
create trigger set_updated_at before update on courses for each row execute function update_updated_at();
create trigger set_updated_at before update on content_items for each row execute function update_updated_at();
create trigger set_updated_at before update on tests for each row execute function update_updated_at();
create trigger set_updated_at before update on question_bank for each row execute function update_updated_at();
create trigger set_updated_at before update on students for each row execute function update_updated_at();
create trigger set_updated_at before update on student_progress for each row execute function update_updated_at();
create trigger set_updated_at before update on orders for each row execute function update_updated_at();
create trigger set_updated_at before update on live_classes for each row execute function update_updated_at();
create trigger set_updated_at before update on leads for each row execute function update_updated_at();

-- ============================================
-- DONE! All tables created.
-- Next: Set up Row Level Security (RLS) policies
-- ============================================
