-- Migration: Persistent Student Call Tracking (student_call_logs)
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

CREATE TABLE IF NOT EXISTS public.student_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
    call_date DATE NOT NULL DEFAULT CURRENT_DATE,
    called_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS student_call_logs_unique_call_idx
    ON public.student_call_logs (center_id, student_id, call_date);

CREATE INDEX IF NOT EXISTS student_call_logs_center_date_idx
    ON public.student_call_logs (center_id, call_date);

CREATE INDEX IF NOT EXISTS student_call_logs_student_idx
    ON public.student_call_logs (student_id);

ALTER TABLE public.student_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members manage own call logs" ON public.student_call_logs;
CREATE POLICY "members manage own call logs"
  ON public.student_call_logs FOR ALL
  USING (public.is_center_member(center_id))
  WITH CHECK (public.is_center_member(center_id));

NOTIFY pgrst, 'reload schema';

