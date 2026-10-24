-- ==============================================================================
-- Migration: Add unique sequential center_number starting at 101
-- Description: Assigns a unique natural number starting from 101 for each center.
-- Used for clean multi-tenant disambiguation during faculty login.
-- ==============================================================================

-- 1. Add center_number column to centers table
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS center_number integer;

-- 2. Backfill existing centers with sequential numbers starting from 101
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) + 100 AS num
  FROM public.centers
  WHERE center_number IS NULL
)
UPDATE public.centers c
SET center_number = ranked.num
FROM ranked
WHERE c.id = ranked.id;

-- 3. Create unique index on center_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_centers_center_number ON public.centers (center_number);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

