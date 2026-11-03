// Core database types — matches the Supabase schema
// These will be auto-generated later with `supabase gen types typescript`
// For now, manual types for the most-used tables

export type UserRole =
  | "super_admin"
  | "content_creator"
  | "teacher"
  | "accountant"
  | "support_staff"
  | "technical";

export type ContentStatus = "draft" | "published" | "archived";
export type ContentType = "video" | "pdf" | "note" | "ebook" | "pyp" | "quiz";
export type QuestionType =
  | "mcq_single"
  | "mcq_multiple"
  | "true_false"
  | "short_answer"
  | "match_pair"
  | "subjective"
  | "image_based";
export type OrderStatus = "pending" | "completed" | "failed" | "refunded";
export type CourseLanguage = "hindi" | "english" | "hinglish";
export type EnrollmentStatus = "active" | "expired" | "cancelled";

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  long_description: string | null;
  thumbnail_url: string | null;
  preview_video_url: string | null;
  category_id: string | null;
  class: string | null;
  subject: string | null;
  teacher_name: string | null;
  teacher_avatar_url: string | null;
  price: number;
  original_price: number | null;
  currency: string | null;
  duration_hours: number | null;
  total_lessons: number | null;
  difficulty: string | null;
  is_published: boolean | null;
  is_featured: boolean | null;
  student_count: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  tags: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Subject {
  id: string;
  course_id: string;
  name: string;
  slug: string;
  color_code: string | null;
  weight: number;
  is_visible: boolean;
}

export interface Topic {
  id: string;
  subject_id: string;
  name: string;
  slug: string;
  weight: number;
  is_visible: boolean;
}

export interface ContentItem {
  id: string;
  topic_id: string;
  type: string;
  title: string;
  description: string | null;
  file_url: string | null;
  video_id: string | null;
  duration_seconds: number | null;
  is_paid: boolean;
  is_downloadable: boolean;
  is_printable: boolean;
  play_limit: number | null;
  status: string;
  weight: number;
  metadata: unknown;

  // Where the video lives. `file_url` carries an external link and nothing
  // else; a video we host is identified by its Bunny GUID and its playable
  // URL is signed per request, so there is no URL worth storing here.
  video_provider: string;
  bunny_video_guid: string | null;
  video_status: string;
  video_thumbnail_url: string | null;
  video_resolutions: string[];
  video_size_bytes: number | null;
  offline_license_days: number;
}

export interface Student {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
  class: string | null;
  board: string | null;
  referral_code: string | null;
  wallet_balance: number;
  status: "active" | "inactive" | "blocked";
  created_at: string;
}

export interface Order {
  id: string;
  student_id: string;
  course_id: string;
  amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method: string;
  status: OrderStatus;
  invoice_url: string | null;
  created_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  role_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface Test {
  id: string;
  course_id: string | null;
  name: string;
  instructions: string | null;
  duration_min: number;
  max_attempts: number;
  shuffle: boolean;
  pass_pct: number;
  show_results: boolean;
  certificate_enabled: boolean;
  negative_marking: boolean;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

export interface TestWithCourse extends Test {
  course: { id: string; title: string } | null;
  question_count: number;
}

export interface Question {
  id: string;
  test_id: string;
  type: string;
  content: string;
  options: unknown;
  correct_answer: unknown;
  positive_marks: number;
  negative_marks: number;
  difficulty: string;
  topic_tag: string | null;
  image_url: string | null;
  hint: string | null;
  weight: number;
}

export interface QuestionBankItem {
  id: string;
  type: string;
  content: string;
  options: unknown;
  correct_answer: unknown;
  positive_marks: number;
  negative_marks: number;
  difficulty: string;
  topic_tag: string | null;
  image_url: string | null;
  hint: string | null;
  used_count: number;
  created_at: string;
  updated_at: string;
}

export interface LiveClass {
  id: string;
  course_id: string;
  teacher_id: string | null;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: "scheduled" | "live" | "ended" | "cancelled";
  recording_url: string | null;
}

export type LeadStatus = "new" | "contacted" | "interested" | "converted" | "lost";
export type LeadSource = "website" | "referral" | "ad" | "walk_in" | "other";
export type TestimonialType = "text" | "video";

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface Testimonial {
  id: string;
  student_name: string;
  content: string | null;
  video_url: string | null;
  type: TestimonialType;
  /** The column is `text`, not a number — a year is a label, not arithmetic. */
  year: string | null;
  class: string | null;
  rating: number | null;
  course_name: string | null;
  marks_or_rank: string | null;
  /** Public URL in the `testimonial-photos` bucket. */
  student_photo_url: string | null;
  is_topper: boolean;
  is_visible: boolean;
  weight: number;
  created_at: string;
}

export interface TestAttempt {
  id: string;
  student_id: string;
  test_id: string;
  score: number;
  max_score: number;
  time_taken_seconds: number;
  attempt_number: number;
  submitted_at: string;
  test?: { name: string };
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  purchased_at: string;
  valid_until: string;
  status: EnrollmentStatus;
  course?: { id: string; title: string };
}

export interface StudentWithEnrollments extends Student {
  enrollment_count: number;
  /** Assigned by trigger on insert, so null only on a row written before it. */
  student_code: string | null;
  registration_source: string;
  profile_completed: boolean;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
