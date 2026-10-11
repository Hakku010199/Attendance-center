-- ============================================================================
-- Multi-Tenant Uniqueness Migration for Divisions and Students
-- ============================================================================
-- Problem Solved:
-- 1. Divisions previously had a global UNIQUE constraint on "name" alone
--    ("divisions_name_unique" / "divisions_name_key"). When Center A created
--    division "A", Center B could not create division "A".
-- 2. Students previously had a global UNIQUE constraint on "student_id" alone
--    ("students_student_id_unique" / "students_student_id_key"). When Center A
--    created student "#1", Center B could not create student "#1".
--
-- Solution:
-- Scopes uniqueness to (center_id, name) for divisions, and (center_id, student_id)
-- for students. Different centers can independently have division "A" and student
-- number "1", while duplicates within the same center remain strictly prevented.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DIVISIONS TABLE: Scope name uniqueness per center
-- ----------------------------------------------------------------------------
-- Drop any global unique constraint or unique index on name
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_name_unique;
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_name_key;
DROP INDEX IF EXISTS public.divisions_name_unique;
DROP INDEX IF EXISTS public.divisions_name_key;
DROP INDEX IF EXISTS public.divisions_name_idx;

-- Drop composite constraint if re-running
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_center_id_name_key;
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_center_id_name_unique;
DROP INDEX IF EXISTS public.divisions_center_id_name_key;
DROP INDEX IF EXISTS public.divisions_center_id_name_unique;

-- Add composite unique constraint: UNIQUE (center_id, name)
ALTER TABLE public.divisions ADD CONSTRAINT divisions_center_id_name_key UNIQUE (center_id, name);

-- ----------------------------------------------------------------------------
-- 2. STUDENTS TABLE: Scope student_id uniqueness per center
-- ----------------------------------------------------------------------------
-- Drop any global unique constraint or unique index on student_id
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_id_unique;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_id_key;
DROP INDEX IF EXISTS public.students_student_id_unique;
DROP INDEX IF EXISTS public.students_student_id_key;
DROP INDEX IF EXISTS public.students_student_id_idx;

-- Drop composite constraint if re-running
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_center_id_student_id_key;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_center_id_student_id_unique;
DROP INDEX IF EXISTS public.students_center_id_student_id_key;
DROP INDEX IF EXISTS public.students_center_id_student_id_unique;

-- Add composite unique constraint: UNIQUE (center_id, student_id)
ALTER TABLE public.students ADD CONSTRAINT students_center_id_student_id_key UNIQUE (center_id, student_id);

-- ----------------------------------------------------------------------------
-- 3. Ensure students table has mobile column
-- ----------------------------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mobile text;

-- ----------------------------------------------------------------------------
-- 4. Reload schema cache for PostgREST
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

