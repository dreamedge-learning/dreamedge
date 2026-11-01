-- Pure Option C: drop any legacy courses from initial_schema before recreating with new design
DROP TABLE IF EXISTS courses CASCADE;

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  long_description TEXT,
  thumbnail_url TEXT,
  preview_video_url TEXT,
  class TEXT,
  subject TEXT,
  teacher_name TEXT,
  teacher_avatar_url TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  original_price NUMERIC(10,2),
  currency TEXT DEFAULT 'INR',
  duration_hours NUMERIC(5,1),
  total_lessons INTEGER DEFAULT 0,
  difficulty TEXT DEFAULT 'beginner',
  is_published BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  student_count INTEGER DEFAULT 0,
  rating_avg NUMERIC(2,1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  tags TEXT[],
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_courses_slug ON courses(slug);
CREATE INDEX idx_courses_class ON courses(class);
CREATE INDEX idx_courses_subject ON courses(subject);
CREATE INDEX idx_courses_is_published ON courses(is_published);
CREATE INDEX idx_courses_is_featured ON courses(is_featured);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_select_published"
  ON courses FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "courses_service_all"
  ON courses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_courses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_courses_updated_at();
