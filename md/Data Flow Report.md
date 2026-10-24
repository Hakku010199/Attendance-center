# Center-Portal — Complete Data Flow Report

Stack: React 18 + Vite 5 + react-router-dom 6 + Supabase (Postgres + Auth + PostgREST) + Vercel `/api/map-columns` + Gemini 3.8 Flash + localStorage prefs.

> Pages/Components never touch DB directly. `src/services/*` is the ONLY data layer. `src/lib/supabase.js` is the single client. `center_id` always from `auth.user -> center_members -> centers.id`.

## 1. Datas and storage (Supabase)

All tables have `center_id -> centers.id` + RLS (`SUPABASE_RLS.md`, `docs/*.sql`):

| Data / Table | Columns | Constraints |
|---|---|---|
| `auth.users` | `id, email, user_metadata, app_metadata.provider` | Supabase Auth |
| `centers` | `id(uuid pre-generated), name, slug UNIQUE, email, phone, address, status, onboarding_completed` | INSERT authenticated, others `is_center_member(id)` |
| `center_members` | `user_id -> auth.users, center_id, role=owner` | `user_id=auth.uid()` |
| `divisions` | `id, center_id, name, status(active/inactive)` | `UNIQUE(center_id,name)`, `FOR ALL members own` |
| `students` | `id, center_id, division_id, student_id TEXT, name, roll_number INT, status, mobile/phone` | `UNIQUE(center_id,student_id)`, roll unique per division (app+23505) |
| `attendance_sessions` | `id, center_id, division_id, attendance_date` | members own |
| `attendance_records` | `center_id, session_id, student_id, status` | `upsert(session_id,student_id)` |
| `attendance` (primary flat) | `center_id, division_id, student_id, date, status, submitted_by` | `upsert(student_id,date)` |
| `student_call_logs` (`docs/create-student-call-logs.sql`) | `student_id, center_id, call_date, called_by, called_at, notes` | `UNIQUE(center_id,student_id,call_date)` |
| localStorage only | `attendance-selected-date/division/view-mode`, `attendance-called:<center>:<date>`, `students-filter-division`, `divisions-filter-status`, `reports-filter JSON`, theme | per-center key, never to DB |
| `src/data/mockData.js` | `mockCenter, db{divisions,students,absent}` | shape ref only |

## 2. Write path (component -> service/API -> DB)

### 2.1 Auth + onboarding
Components: `pages/Register.jsx`, `Login.jsx`, `Onboarding.jsx` (Welcome->Info->Review->Success), `context/AuthContext.jsx`, `components/auth/RouteGuards.jsx`.
APIs: `services/authService.js` `registerWithEmail/signInWithEmail/signInWithGoogle/sendPasswordReset/updatePassword` -> `supabase.auth.*`; `services/centerService.js` `slugify/findUniqueSlug` -> `from("centers").select(id).eq(slug).maybeSingle()`; `createCenterOnboarding()` -> `from("centers").insert({id:crypto.randomUUID(),name,slug,email,phone,address})` -> `from("center_members").insert({user_id,center_id,role:owner})` -> `from("centers").update({onboarding_completed:true})`.
Stored: `centers` + `center_members`.

### 2.2 Divisions
Components: `pages/Divisions.jsx`, `components/divisions/DivisionForm.jsx`, `hooks/useDivisions.js`.
APIs: `services/divisionService.js` `saveDivision(v,id)`, `deleteDivision(id)` + `utils/events.js notifyDivisionsUpdated()`. `requireCenterId()` = `auth.getUser()` -> `getCurrentMembership()` -> `center_id`. Create `from("divisions").insert({center_id,name,status})` with per-center dup check + `23505` catch. Update `from("divisions").update({name,status}).eq(id).eq(center_id)`. Delete blocked if `from("students").select(id).eq(center_id).eq(division_id).limit(1)` has rows, else `from("divisions").delete().eq(id).eq(center_id)`.

### 2.3 Students manual
Components: `pages/Students.jsx`, `components/students/StudentForm.jsx`.
APIs: `services/studentService.js` `saveStudent(v,id)`, `deleteStudent(id)`. Auto `student_id` from `select(...).eq(center_id)` max+1. Validate name, roll numeric unique per division, division `select(id).eq(id).eq(center_id)`. Write `from("students").insert/update({center_id,student_id,name,roll_number,division_id,status,mobile})` with mobile->phone fallback. Delete `from("attendance_records").delete().eq(student_id).eq(center_id)` then `from("students").delete()`.

### 2.4 Bulk import Excel + AI
Components: `components/students/StudentImportModal.jsx` (Upload->Map->Preview), `ImportStudentsModal.jsx`, `lib/excelParser.js (xlsx)`.
APIs: client `xlsx` -> `headers,sampleRows` -> `POST /api/map-columns` (`vite.config.js` dev / `api/map-columns.js` Vercel, `GoogleGenAI gemini-3.8-flash`, server `GEMINI_API_KEY`, heuristic fallback) -> `services/studentImportService.js heuristicAnalyzeColumns/transformRows/bulkInsertStudents` auto-creates divisions, chunked `students` inserts, returns `{totalRowsRead,successfullyImported,duplicates,invalid,skipped,issues[]}`.

### 2.5 Attendance marking
Components: `pages/Attendance.jsx` (`/attendance` + `/daily-attendance`), `components/attendance/AttendanceFilters, AttendanceSummary, StudentGrid, StudentList, AbsenteesPanel, SwipeablePhone`.
APIs: `services/attendanceService.js submitAttendance({date,divisionId,roster,absentMap})`, `ensureSession()`. Build `records[{center_id,division_id,student_id,date,status,submitted_by}]`. Primary `from("attendance").upsert(records,{onConflict:"student_id,date"})`. Compat `ensureSession` + `from("attendance_records").upsert(absents)/delete(presents)` -> `notifyAttendanceUpdated()`.

### 2.6 Call tracking
Components: `AbsenteesPanel`, `SwipeablePhone tel:` links.
APIs: `services/callService.js getStudentCallStatus/markStudentAsCalled/unmarkStudentAsCalled`. `from("student_call_logs").select/insert/delete .eq(center_id).eq(call_date,date)` with `UNIQUE(center_id,student_id,call_date)`, mirror to `localStorage attendance-called:<center>:<date>`.

### 2.7 Settings
Components: `pages/Settings.jsx`, `context/ThemeContext.jsx`.
APIs: `centerService.updateCenter()` -> `from("centers").update({name,email,phone,address}).eq(id)`; `authService.updatePassword()` -> `auth.updateUser({password})`.

## 3. Read path (DB -> service/API -> display)

All reads `requireCenterId()` + `.eq("center_id",...)` + RLS. Loader `hooks/useLoad.js` + `hooks/useDivisions.js` + `AppLayout PortalContext{attendanceRefreshKey,divisionsKey}` on `attendance-updated/divisions-updated` events. `components/common/Async.jsx` for loading/error.

| Data | Retrieve API | Display |
|---|---|---|
| center/user | `centerService.getCurrentMembership/getCurrentCenter` via `AuthContext.loadCenter()` on `getSession/onAuthStateChange` | `AppLayout Sidebar/Header/BottomNav`, `Settings` prefill |
| divisions | `divisionService.listDivisions(): divisions.select + students counts` | `Divisions.jsx` table + all dropdowns via `useDivisions()` |
| students | `studentService.listStudents(): students.select(*)+divisions names join in JS` | `Students.jsx` table, debounce 300ms, persisted filters |
| roster | `attendanceService.getAttendance(date,divisionId): students + attendance fallback sessions+records -> {students,absentIds,hasSubmitted}` | `StudentGrid/List`, `AttendanceSummary`, `AbsenteesPanel` |
| overview | `attendanceService.getOverview(): counts -> {total,present,absent,pct,divisionList[{attendanceTaken}]}` | `Dashboard.jsx StatCards+donut+badges red Pending/blue Taken` |
| history | `attendanceService.getHistory({date,divisionId,status,search}): attendance fallback sessions+records sort date DESC roll ASC` | `Reports.jsx` toolbar + pills + `tel:` links, live on `ATTENDANCE_UPDATED` |
| calls | `callService.getStudentCallStatus({centerId,date})` | `Called` badge |

## 4. Workflow example for each data

- New center: `/register` -> `supabase.auth` -> `/onboarding` Info{name,email,phone,address} -> Review slug via `findUniqueSlug` -> Create `centers.insert + center_members.insert + onboarding_completed=true` -> `/portal getOverview`.
- Division: `Divisions Add Division{name:8-A}` -> `saveDivision()` dup per-center check -> `divisions.insert(center_id)` -> `notifyDivisionsUpdated` -> table row 0 Students.
- Student manual: `Students Add{name,roll 5 unique/division,division Active,mobile}` -> `saveStudent()` -> `students.insert(center_id)` -> reload toast.
- Smart import: `Smart Import roster.xlsx(AdmNo,Name,Class,Mobile)` -> `POST /api/map-columns` Gemini/heuristic mapping -> Preview + Default Division -> `bulkInsertStudents` auto-create divisions -> Summary `{Rows,Imported,Duplicates,Invalid + issues}`.
- Attendance: `Dashboard red 8-A` -> `/attendance getAttendance roster` -> toggle absent -> `Submit attendance.upsert + sessions ensure + records upsert/delete` -> badge blue, donut update.
- Call: `AbsenteesPanel Mark as Called` -> `student_call_logs.insert(center_id,student_id,call_date,called_by)` -> `Called` badge persists via `getStudentCallStatus`.
- Reports: `Reports Date=yesterday Status=Absent` -> `getHistory` filters -> audit table with `tel:` links.
- Settings: `Settings edit phone` -> `updateCenter -> centers.update` -> `reload()` Header reflect.

## 5. Full concrete example (one student, end-to-end with real values)

Say owner `owner@gmail.com` runs center `ABC Academy`, division `8-A`, student `Arjun Menon`.

### Step 1 — Register + Onboard (centers + center_members)
1. UI: `/register` form `{email: "owner@gmail.com", password: "secret123"}` -> `authService.registerWithEmail()` -> `supabase.auth.signUp()`. `auth.users` row: `{id: "u-111", email: "owner@gmail.com"}`.
2. UI: `/onboarding` Step 2 form `{name: "ABC Academy", email: "info@abc.com", phone: "+91 98765 43210", address: "12 Main Road"}` -> `createCenterOnboarding()`:
   - `slug = "abc-academy"` via `findUniqueSlug()` (`select id where slug='abc-academy'` -> none, so use it).
   - `centers.insert`: `{id: "c-001", name: "ABC Academy", slug: "abc-academy", email: "info@abc.com", phone: "+91 98765 43210", address: "12 Main Road", status: "active", onboarding_completed: false}`.
   - `center_members.insert`: `{user_id: "u-111", center_id: "c-001", role: "owner"}`.
   - `centers.update({onboarding_completed: true}).eq("c-001")`.
3. Retrieve/display: `AuthContext.loadCenter("u-111")` -> `getCurrentCenter()` -> `center_members.select().eq(user_id="u-111")` -> `centers.select(*).eq(id="c-001")` -> `AppLayout Sidebar` shows "ABC Academy", `Dashboard` loads.

### Step 2 — Division (divisions)
1. UI: `/divisions` -> Add Division modal `{name: "8-A", status: "active"}` -> `saveDivision({name:"8-A"})`:
   - `requireCenterId()` -> `"c-001"`.
   - dup check `select(id,name).eq(center_id="c-001")` -> no "8-A", passes.
   - `divisions.insert`: `{id: "d-01", center_id: "c-001", name: "8-A", status: "active"}`.
2. Retrieve/display: `listDivisions()` -> `select().eq(center_id="c-001")` + student count (0) -> `Divisions.jsx` row `8-A | 0 Students | Active`.

### Step 3 — Student (students)
1. UI: `/students` -> Add Student `{studentNo auto, name: "Arjun Menon", rollNumber: "5", divisionId: "d-01", mobile: "+91 90000 00005"}` -> `saveStudent()`:
   - `student_id` auto = `"1"` (first in center).
   - `students.insert`: `{id: "s-101", center_id: "c-001", division_id: "d-01", student_id: "1", name: "Arjun Menon", roll_number: 5, status: "active", mobile: "+91 90000 00005"}`.
2. Retrieve/display: `listStudents()` -> `select(*).eq("c-001")` + division name join -> `Students.jsx` row `1 | Arjun Menon | 5 | 8-A | tel:+91... | Active`.

### Step 4 — Attendance (attendance + sessions + records)
1. UI: `/attendance` date `2026-10-20`, division `8-A` -> `getAttendance("2026-10-20","d-01")` returns roster `[{id:"s-101", name:"Arjun Menon", roll 5}]`, `absentIds: []`. User taps Arjun -> red (absent). `absentMap = {"s-101": true}` -> Submit -> `submitAttendance()`:
   - `attendance.upsert`: `{center_id:"c-001", division_id:"d-01", student_id:"s-101", date:"2026-10-20", status:"absent", submitted_by:"u-111"}`.
   - `ensureSession("c-001","d-01","2026-10-20")` -> `attendance_sessions.insert {id:"sess-01", center_id:"c-001", division_id:"d-01", attendance_date:"2026-10-20"}`.
   - `attendance_records.upsert {center_id:"c-001", session_id:"sess-01", student_id:"s-101", status:"absent"}`.
2. Retrieve/display: `Dashboard getOverview()` -> `Absent Today 1`, badge `8-A` blue Taken; `Reports getHistory({date:"2026-10-20"})` -> row `Arjun Menon | 8-A | Absent(red) | tel:link`.

### Step 5 — Call log (student_call_logs)
1. UI: `AbsenteesPanel` Arjun -> Mark as Called -> `markStudentAsCalled({studentId:"s-101", centerId:"c-001", date:"2026-10-20"})` -> `student_call_logs.insert {center_id:"c-001", student_id:"s-101", call_date:"2026-10-20", called_by:"u-111", called_at:"2026-10-20T10:30:00Z"}` + mirror `localStorage["attendance-called:c-001:2026-10-20"]`.
2. Retrieve/display: reload -> `getStudentCallStatus({centerId:"c-001", date:"2026-10-20"})` -> `{"s-101": {calledAt...}}` -> badge `Called`.



