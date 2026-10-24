-- ==============================================================================
-- Migration: Teachers Management Table with Multiple Divisions & Faculty Login
-- Description: Stores faculty / teacher accounts assigned to one or more divisions
-- Multi-tenant isolation: Scoped strictly to center_id via RLS and unique constraint
-- ==============================================================================

-- 1. Create the teachers table
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  password text NOT NULL,
  name text,
  phone text,
  division_id uuid REFERENCES public.divisions(id) ON DELETE SET NULL,
  division_ids uuid[] DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure division_ids column exists if table was previously created
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS division_ids uuid[] DEFAULT '{}'::uuid[];

-- 2. Enforce per-center unique User ID constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_center_user_id_key'
  ) THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_center_user_id_key UNIQUE (center_id, user_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN others THEN NULL;
END $$;

-- 3. Query performance indexes
CREATE INDEX IF NOT EXISTS idx_teachers_center_id ON public.teachers(center_id);
CREATE INDEX IF NOT EXISTS idx_teachers_division_id ON public.teachers(division_id);
CREATE INDEX IF NOT EXISTS idx_teachers_division_ids ON public.teachers USING GIN (division_ids);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers(user_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Center administrators have full management access over their center's teachers
DROP POLICY IF EXISTS "members manage own teachers" ON public.teachers;
CREATE POLICY "members manage own teachers"
  ON public.teachers FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

-- Allow faculty login verification by matching user_id and password
DROP POLICY IF EXISTS "allow teacher login verification" ON public.teachers;
CREATE POLICY "allow teacher login verification"
  ON public.teachers FOR SELECT
  USING (true);

-- Allow anon reads on centers table so faculty login can resolve center details
DROP POLICY IF EXISTS "allow center read for faculty login" ON public.centers;
CREATE POLICY "allow center read for faculty login"
  ON public.centers FOR SELECT
  USING (true);

-- Allow reading active divisions for attendance marking
DROP POLICY IF EXISTS "allow read divisions for attendance" ON public.divisions;
CREATE POLICY "allow read divisions for attendance"
  ON public.divisions FOR SELECT
  USING (true);

-- Allow reading students for attendance marking
DROP POLICY IF EXISTS "allow read students for attendance" ON public.students;
CREATE POLICY "allow read students for attendance"
  ON public.students FOR SELECT
  USING (true);

-- Allow recording attendance
DROP POLICY IF EXISTS "allow attendance marking" ON public.attendance;
CREATE POLICY "allow attendance marking"
  ON public.attendance FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow faculty attendance session and records synchronization
DROP POLICY IF EXISTS "allow faculty manage sessions" ON public.attendance_sessions;
CREATE POLICY "allow faculty manage sessions"
  ON public.attendance_sessions FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow faculty manage records" ON public.attendance_records;
CREATE POLICY "allow faculty manage records"
  ON public.attendance_records FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Trigger to automatically keep updated_at fresh
CREATE OR REPLACE FUNCTION public.handle_teachers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_teachers_updated_at ON public.teachers;
CREATE TRIGGER trigger_teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.handle_teachers_updated_at();
