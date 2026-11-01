-- Pure Option C: drop any legacy student_progress from initial_schema before recreating with new design
DROP TABLE IF EXISTS student_progress CASCADE;

-- Lessons table
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  duration_minutes INT DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_free_preview BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  resources JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_sort_order ON lessons(course_id, sort_order);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lessons_select_published' AND tablename = 'lessons') THEN
    CREATE POLICY "lessons_select_published"
      ON lessons FOR SELECT
      TO anon, authenticated
      USING (is_published = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lessons_service_all' AND tablename = 'lessons') THEN
    CREATE POLICY "lessons_service_all"
      ON lessons FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Student progress table
CREATE TABLE IF NOT EXISTS student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  progress_pct INT DEFAULT 0,
  last_position_seconds INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_progress' AND column_name = 'lesson_id') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_student_lesson ON student_progress(student_id, lesson_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_progress_student_id
  ON student_progress(student_id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_progress' AND column_name = 'course_id') THEN
    CREATE INDEX IF NOT EXISTS idx_progress_course_id ON student_progress(student_id, course_id);
  END IF;
END $$;

ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'progress_select_own' AND tablename = 'student_progress') THEN
    CREATE POLICY "progress_select_own"
      ON student_progress FOR SELECT
      TO authenticated
      USING (
        student_id IN (
          SELECT id FROM students WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'progress_service_all' AND tablename = 'student_progress') THEN
    CREATE POLICY "progress_service_all"
      ON student_progress FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lessons_updated_at ON lessons;
CREATE TRIGGER lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_lessons_updated_at();

CREATE OR REPLACE FUNCTION update_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS progress_updated_at ON student_progress;
CREATE TRIGGER progress_updated_at
  BEFORE UPDATE ON student_progress
  FOR EACH ROW EXECUTE FUNCTION update_progress_updated_at();
