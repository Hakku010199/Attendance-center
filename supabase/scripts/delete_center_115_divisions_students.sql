-- ==============================================================================
-- Script: Delete all divisions and students for Center #115 ("btc-devadhar")
-- Description: Removes all students, divisions, attendance records, attendance sessions,
--              and call logs belonging to Center 115 while keeping the center row intact.
-- Instructions: Run this script in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- ==============================================================================

DO $$
DECLARE
  target_center_id UUID;
  deleted_students_count INT := 0;
  deleted_divisions_count INT := 0;
  center_name_found TEXT;
  center_num_found INT;
BEGIN
  -- 1. Find the target center by center_number (115) or name ('btc-devadhar')
  SELECT id, name, center_number 
  INTO target_center_id, center_name_found, center_num_found
  FROM public.centers
  WHERE center_number = 115 
     OR lower(trim(name)) ILIKE '%btc-devadhar%'
     OR lower(trim(name)) ILIKE '%devadhar%'
  LIMIT 1;

  IF target_center_id IS NULL THEN
    RAISE NOTICE 'Center 115 / "btc-devadhar" was not found in public.centers. No changes made.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found Center: "%" (No: %, ID: %)', center_name_found, center_num_found, target_center_id;

  -- 2. Clean up student call logs if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_call_logs') THEN
    DELETE FROM public.student_call_logs WHERE center_id = target_center_id;
  END IF;

  -- 3. Clean up attendance records if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance_records') THEN
    DELETE FROM public.attendance_records WHERE center_id = target_center_id;
  END IF;

  -- 4. Clean up legacy attendance table if exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance') THEN
    DELETE FROM public.attendance WHERE center_id = target_center_id;
  END IF;

  -- 5. Clean up attendance sessions if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance_sessions') THEN
    DELETE FROM public.attendance_sessions WHERE center_id = target_center_id;
  END IF;

  -- 6. Unlink teachers from deleted divisions of this center
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teachers') THEN
    UPDATE public.teachers
    SET division_id = NULL
    WHERE center_id = target_center_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'teachers' AND column_name = 'division_ids'
    ) THEN
      UPDATE public.teachers
      SET division_ids = '{}'::uuid[]
      WHERE center_id = target_center_id;
    END IF;
  END IF;

  -- 7. Delete all students belonging to this center
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'students') THEN
    WITH del_stu AS (
      DELETE FROM public.students
      WHERE center_id = target_center_id
      RETURNING id
    )
    SELECT count(*) INTO deleted_students_count FROM del_stu;
  END IF;

  -- 8. Delete all divisions belonging to this center
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'divisions') THEN
    WITH del_div AS (
      DELETE FROM public.divisions
      WHERE center_id = target_center_id
      RETURNING id
    )
    SELECT count(*) INTO deleted_divisions_count FROM del_div;
  END IF;

  RAISE NOTICE 'SUCCESS: Successfully removed % student(s) and % division(s) from center "%". The center table record remains untouched.',
    deleted_students_count, deleted_divisions_count, center_name_found;

END $$;

