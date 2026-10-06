# Supabase RLS Setup — Center Portal (per-center data isolation)

Every table already has a `center_id` column. Run this SQL **once** in
Supabase Dashboard → SQL Editor to enforce isolation at the database level.

How it works:
  auth.uid() → center_members (user_id) → center_id → row's center_id

After this, even if a client forgets `WHERE center_id = ...`, the database
refuses to leak another center's rows.

```sql
-- 1. Enable RLS on all center-scoped tables
alter table public.centers enable row level security;
alter table public.center_members enable row level security;
alter table public.divisions enable row level security;
alter table public.students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

-- 2. Helper: does the current user belong to this center?
create or replace function public.is_center_member(p_center_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.center_members
    where user_id = auth.uid()
      and center_id = p_center_id
  );
$$;

-- 3. centers: members can read/update their own center.
--    (Insert must stay open for onboarding: a new user has no membership yet
--    at the moment they create their first center.)
drop policy if exists "members read own center" on public.centers;
create policy "members read own center"
  on public.centers for select
  using (public.is_center_member(id));

drop policy if exists "members update own center" on public.centers;
create policy "members update own center"
  on public.centers for update
  using (public.is_center_member(id));

drop policy if exists "authenticated can create center" on public.centers;
create policy "authenticated can create center"
  on public.centers for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "members delete own center" on public.centers;
create policy "members delete own center"
  on public.centers for delete
  using (public.is_center_member(id));

-- 4. center_members: users read their own row; insert their own owner row.
drop policy if exists "users read own membership" on public.center_members;
create policy "users read own membership"
  on public.center_members for select
  using (user_id = auth.uid());

drop policy if exists "users insert own membership" on public.center_members;
create policy "users insert own membership"
  on public.center_members for insert
  with check (user_id = auth.uid());

-- 5. divisions / students / sessions / records: full CRUD within own center.
drop policy if exists "members manage own divisions" on public.divisions;
create policy "members manage own divisions"
  on public.divisions for all
  using (public.is_center_member(center_id))
  with check (public.is_center_member(center_id));

drop policy if exists "members manage own students" on public.students;
create policy "members manage own students"
  on public.students for all
  using (public.is_center_member(center_id))
  with check (public.is_center_member(center_id));

drop policy if exists "members manage own sessions" on public.attendance_sessions;
create policy "members manage own sessions"
  on public.attendance_sessions for all
  using (public.is_center_member(center_id))
  with check (public.is_center_member(center_id));

drop policy if exists "members manage own records" on public.attendance_records;
create policy "members manage own records"
  on public.attendance_records for all
  using (public.is_center_member(center_id))
  with check (public.is_center_member(center_id));

-- 6. divisions composite uniqueness: unique (center_id, name)
-- Drop any legacy global unique constraint on name alone:
alter table public.divisions drop constraint if exists divisions_name_key;
drop index if exists public.divisions_name_key;
drop index if exists public.divisions_name_idx;

-- Add composite unique constraint scoped to each center:
alter table public.divisions drop constraint if exists divisions_center_id_name_key;
alter table public.divisions add constraint divisions_center_id_name_key unique (center_id, name);
```

## Verify isolation (run as two different logins)

1. Register user A → onboard center A → add "Division A" + a student.
2. Register user B → onboard center B → open Divisions/Students.
   Expected: completely empty. B cannot see, edit, or delete A's rows
   (the app always filters `center_id`, and RLS blocks it server-side too).
3. Same Division name / Student ID in both centers is allowed —
   uniqueness is per-center, not global.
