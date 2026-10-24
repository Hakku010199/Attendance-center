-- ==============================================================================
-- Migration: Faculty Access Time Settings & Server-Side Security Enforcement
-- Description: Adds configurable daily access window for faculty logins and attendance
-- Server Enforcement: RLS policies and trigger functions block API bypass outside window
-- ==============================================================================

-- 1. Add time restriction columns to centers table
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS faculty_time_restriction_enabled boolean DEFAULT false;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS faculty_start_time time DEFAULT '07:00:00'::time;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS faculty_end_time time DEFAULT '10:00:00'::time;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Kolkata';

-- 2. Helper function: checks whether faculty attendance access is currently permitted for a given center
CREATE OR REPLACE FUNCTION public.is_faculty_time_allowed(p_center_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_center record;
  v_tz text;
  v_current_time time;
  v_start_time time;
  v_end_time time;
BEGIN
  -- Center administrators / authenticated center members always have full access at all times
  IF auth.uid() IS NOT NULL AND public.is_center_member(p_center_id) THEN
    RETURN true;
  END IF;

  -- Query center time configuration
  SELECT 
    faculty_time_restriction_enabled,
    faculty_start_time,
    faculty_end_time,
    timezone
  INTO v_center
  FROM public.centers
  WHERE id = p_center_id;

  -- If center does not exist or restriction is disabled, access is permitted
  IF NOT FOUND OR v_center.faculty_time_restriction_enabled IS NOT TRUE THEN
    RETURN true;
  END IF;

  -- Resolve timezone (default Asia/Kolkata)
  v_tz := COALESCE(NULLIF(TRIM(v_center.timezone), ''), 'Asia/Kolkata');

  BEGIN
    v_current_time := (CURRENT_TIMESTAMP AT TIME ZONE v_tz)::time;
  EXCEPTION WHEN OTHERS THEN
    v_current_time := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time;
  END;

  v_start_time := COALESCE(v_center.faculty_start_time, '07:00:00'::time);
  v_end_time := COALESCE(v_center.faculty_end_time, '10:00:00'::time);

  -- Evaluate permitted window (supports standard daytime & midnight-crossing ranges)
  IF v_start_time <= v_end_time THEN
    -- Standard range: e.g. 07:00 to 10:00
    RETURN (v_current_time >= v_start_time AND v_current_time <= v_end_time);
  ELSE
    -- Midnight-crossing range: e.g. 22:00 to 04:00
    RETURN (v_current_time >= v_start_time OR v_current_time <= v_end_time);
  END IF;
END;
$$;

-- 3. Trigger function: strictly validates that faculty cannot create/modify attendance outside window
CREATE OR REPLACE FUNCTION public.check_faculty_attendance_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_center_id uuid;
  v_allowed boolean;
  v_center record;
  v_tz text;
  v_start_time time;
  v_end_time time;
BEGIN
  v_center_id := NEW.center_id;
  
  -- Center administrators / members can always manage attendance
  IF auth.uid() IS NOT NULL AND public.is_center_member(v_center_id) THEN
    RETURN NEW;
  END IF;

  v_allowed := public.is_faculty_time_allowed(v_center_id);

  IF NOT v_allowed THEN
    SELECT faculty_start_time, faculty_end_time, timezone
    INTO v_center
    FROM public.centers
    WHERE id = v_center_id;

    v_tz := COALESCE(NULLIF(TRIM(v_center.timezone), ''), 'Asia/Kolkata');
    v_start_time := COALESCE(v_center.faculty_start_time, '07:00:00'::time);
    v_end_time := COALESCE(v_center.faculty_end_time, '10:00:00'::time);

    RAISE EXCEPTION 'Faculty attendance access is restricted. Attendance can only be recorded between % and % (%)',
      to_char(v_start_time, 'HH12:MI AM'),
      to_char(v_end_time, 'HH12:MI AM'),
      v_tz
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach enforcement triggers to attendance tables
DROP TRIGGER IF EXISTS trg_faculty_attendance_time_check ON public.attendance;
CREATE TRIGGER trg_faculty_attendance_time_check
  BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.check_faculty_attendance_access();

DROP TRIGGER IF EXISTS trg_faculty_sessions_time_check ON public.attendance_sessions;
CREATE TRIGGER trg_faculty_sessions_time_check
  BEFORE INSERT OR UPDATE ON public.attendance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_faculty_attendance_access();

DROP TRIGGER IF EXISTS trg_faculty_records_time_check ON public.attendance_records;
CREATE TRIGGER trg_faculty_records_time_check
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.check_faculty_attendance_access();

-- 5. Update RLS policies to reinforce server-side access control
DROP POLICY IF EXISTS "allow attendance marking" ON public.attendance;
CREATE POLICY "allow attendance marking"
  ON public.attendance FOR ALL
  USING (public.is_faculty_time_allowed(center_id))
  WITH CHECK (public.is_faculty_time_allowed(center_id));

DROP POLICY IF EXISTS "allow faculty manage sessions" ON public.attendance_sessions;
CREATE POLICY "allow faculty manage sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_faculty_time_allowed(center_id))
  WITH CHECK (public.is_faculty_time_allowed(center_id));

DROP POLICY IF EXISTS "allow faculty manage records" ON public.attendance_records;
CREATE POLICY "allow faculty manage records"
  ON public.attendance_records FOR ALL
  USING (public.is_faculty_time_allowed(center_id))
  WITH CHECK (public.is_faculty_time_allowed(center_id));

NOTIFY pgrst, 'reload schema';

