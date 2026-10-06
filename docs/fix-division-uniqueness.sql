-- Migration: Fix division uniqueness to composite UNIQUE (center_id, name)
-- Scopes division name uniqueness to each individual center, allowing multiple centers
-- to have divisions with the same name (e.g. "Science", "Division A"), while preventing
-- duplicate division names within the same center.

-- 1. Drop existing global unique constraint or unique index on name if present
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_name_key;
DROP INDEX IF EXISTS public.divisions_name_key;
DROP INDEX IF EXISTS public.divisions_name_idx;

-- 2. Drop any existing composite constraint to ensure clean state
ALTER TABLE public.divisions DROP CONSTRAINT IF EXISTS divisions_center_id_name_key;

-- 3. Add composite uniqueness constraint UNIQUE (center_id, name)
ALTER TABLE public.divisions ADD CONSTRAINT divisions_center_id_name_key UNIQUE (center_id, name);

-- 4. Verify RLS is enabled and policies are active
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members manage own divisions" ON public.divisions;
CREATE POLICY "members manage own divisions"
  ON public.divisions FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

-- 5. Add mobile column to students table if not yet present
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mobile text;

