-- Migration: Multi-Center Shared Architecture & Complete Tenant Isolation
-- Ensures all centers share identical schema, features, and strict RLS data isolation.

-- 1. Helper function: verifies whether the authenticated user belongs to the specified center.
CREATE OR REPLACE FUNCTION public.is_center_member(p_center_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.center_members
    WHERE user_id = auth.uid()
      AND center_id = p_center_id
  );
$$;

-- 2. Ensure centers table has all standard columns
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());

-- 3. Enable Row Level Security (RLS) across all center-scoped tables
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 3. centers table policies
DROP POLICY IF EXISTS "members read own center" ON public.centers;
CREATE POLICY "members read own center"
  ON public.centers FOR SELECT
  USING (public.is_center_member(id));

DROP POLICY IF EXISTS "members update own center" ON public.centers;
CREATE POLICY "members update own center"
  ON public.centers FOR UPDATE
  USING (public.is_center_member(id))
  WITH CHECK (public.is_center_member(id));

DROP POLICY IF EXISTS "authenticated can create center" ON public.centers;
CREATE POLICY "authenticated can create center"
  ON public.centers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "members delete own center" ON public.centers;
CREATE POLICY "members delete own center"
  ON public.centers FOR DELETE
  USING (public.is_center_member(id));

-- 4. center_members table policies (enforce one-center-per-user)
DROP POLICY IF EXISTS "users read own membership" ON public.center_members;
CREATE POLICY "users read own membership"
  ON public.center_members FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own membership" ON public.center_members;
CREATE POLICY "users insert own membership"
  ON public.center_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Enforce one center membership per user at the database constraint level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'center_members_user_id_key'
  ) THEN
    ALTER TABLE public.center_members ADD CONSTRAINT center_members_user_id_key UNIQUE (user_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN others THEN NULL;
END $$;

-- 5. divisions table policies & per-center uniqueness
DROP POLICY IF EXISTS "members manage own divisions" ON public.divisions;
CREATE POLICY "members manage own divisions"
  ON public.divisions FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_name_key;
DROP INDEX IF EXISTS public.divisions_name_key;
DROP INDEX IF EXISTS public.divisions_name_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'divisions_center_id_name_key'
  ) THEN
    ALTER TABLE public.divisions ADD CONSTRAINT divisions_center_id_name_key UNIQUE (center_id, name);
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 6. students table policies & per-center uniqueness
DROP POLICY IF EXISTS "members manage own students" ON public.students;
CREATE POLICY "members manage own students"
  ON public.students FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_id_key;
DROP INDEX IF EXISTS public.students_student_id_key;

-- 7. attendance_sessions table policies & per-center uniqueness
DROP POLICY IF EXISTS "members manage own sessions" ON public.attendance_sessions;
CREATE POLICY "members manage own sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

-- 8. attendance_records table policies & per-center uniqueness
DROP POLICY IF EXISTS "members manage own records" ON public.attendance_records;
CREATE POLICY "members manage own records"
  ON public.attendance_records FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

-- 9. student_call_logs table policies (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_call_logs') THEN
    ALTER TABLE public.student_call_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "members manage own call logs" ON public.student_call_logs;
    CREATE POLICY "members manage own call logs"
      ON public.student_call_logs FOR ALL
      USING (public.is_center_member(center_id))
      WITH CHECK (public.is_center_member(center_id));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

