# Center Portal — Complete User Guidelines & Workflow Manual
**App Name:** Center Portal (RollBeeCall — rollbeecall.online) | **Version:** 1.0.0 | **Stack:** React + Vite + Supabase
**Audience:** Center Admin / Owner / Teaching Staff / Data Entry Operator

> This guide explains **every feature, every screen, and the correct daily workflow** from first sign-up to daily attendance and reports.

---

## Table of Contents
1. [Product Overview & Roles](#1-product-overview--roles)
2. [First-Time Setup Workflow (Register → Onboard)](#2-first-time-setup-workflow-register--onboard)
3. [Login & Account Recovery Workflow](#3-login--account-recovery-workflow)
4. [App Layout & Navigation](#4-app-layout--navigation)
5. [Dashboard — Your Daily Home](#5-dashboard--your-daily-home)
6. [Divisions Management](#6-divisions-management)
7. [Students Management](#7-students-management)
8. [Attendance Marking (Core Daily Workflow)](#8-attendance-marking-core-daily-workflow)
9. [Daily-Wise Attendance View](#9-daily-wise-attendance-view)
10. [Reports / Attendance History](#10-reports--attendance-history)
11. [Settings & Center Profile](#11-settings--center-profile)
12. [More Page (Mobile Hub)](#12-more-page-mobile-hub)
13. [Theme, Data Saving & Best Practices](#13-theme-data-saving--best-practices)
14. [Troubleshooting & FAQs](#14-troubleshooting--faqs)
15. [Recommended Daily / Weekly Checklist](#15-recommended-daily--weekly-checklist)

---

## 1. Product Overview & Roles

**What Center Portal does:**
Centralizes one coaching / tuition center's operations: organize batches as **Divisions**, maintain **Students** master data (with Excel bulk import), mark **Daily Attendance** division-wise, track **Absentee follow-up calls**, audit via **Reports**, and manage **Center Profile + Theme + Password**.

**Data Isolation Guarantee:**
Every Division, Student, Attendance Session, Record, and Call Log is tagged with your `center_id` (`auth → center_members → center_id`). Row-Level Security (RLS) in Supabase ensures you can **never see another center's data**. Same Division name / Student ID can exist in two different centers safely — uniqueness is **per-center only**.

**Roles (single-role v1):**
- **Owner/Admin** — the user who registers and creates the center via Onboarding. Has full CRUD on Divisions, Students, Attendance, Settings. No staff-invite roles yet; share login only if needed.

**Routes map:**
```
/register, /login, /forgot-password, /reset-password, /auth/callback
/onboarding (4-step wizard)
/portal or / (Dashboard)
/attendance (Division attendance marking)
/daily-attendance (Same engine, date-focused view)
/reports (History audit log)
/students, /divisions (under Management)
/settings, /more
```

---
## 2. First-Time Setup Workflow (Register -> Onboard)

This is the mandatory one-time flow for every new center. Do it in order.

### Step A - Create Account (/register)
1. Open /register - you see Create your account.
2. Option 1: Click Google button for one-click sign-up via Supabase Auth.
3. Option 2: Fill Email + Password + Confirm Password (min 8 chars, confirm must match, eye icon to show/hide).
4. Click Create account. If email confirmation is disabled (current setup) you go straight to /onboarding. Otherwise verify email then Sign in.
5. Bottom link: Already have an account? Sign in -> /login.

Rule: One login = One center via center_members. If you already onboarded, login skips onboarding and lands on Dashboard.

### Step B - Onboarding Wizard (/onboarding) - 4 Steps
Progress: Welcome -> Center Information -> Review -> Success.

Step 0 Welcome: explains workspace creation. Click Get Started / Continue.

Step 1 Center Information - fill:
- Center Name (required, e.g. Sunrise Tuition) - used to auto-generate portal slug.
- Center Email (required, prefilled from login, editable).
- Mobile Number (required, 10-digit validated).
- Address (optional).
Live slug preview shows Your portal web address: <slug>. Slug is unique globally.
Click Continue. Inline errors show under fields.

Step 2 Review: shows Center Name, Email, Mobile, Address, Portal Slug. Back to edit or Create Center. You see Creating your center... (do NOT close). Backend does INSERT centers -> INSERT center_members as owner -> SET onboarding_completed=true.

Step 3 Success: Your center is ready! Click Go to Dashboard -> /portal.
Google users only: if you signed up with Google and have no password yet, a mandatory Set Password modal appears (New + Confirm, min 8 chars). Set it to also allow email login later.

If you close mid-way, next login resumes with prefilled data at Step 1.

Correct order for new center:
Register -> Onboarding -> Add Divisions -> Add/Import Students -> Mark Attendance.
Do NOT add students before divisions - every student requires a division.

---


## 3. Login and Account Recovery Workflow

### Normal Login (/login)
1. Open /login. Enter Email + Password, keep Remember me ON.
2. Click Sign in. Routing: no membership -> /onboarding; incomplete -> /onboarding; complete -> /portal.
3. Errors: wrong password, or Center is inactive connect 8139041877 (call support).
4. Google button links to same account if email matches.

### Forgot Password (/forgot-password)
Enter email -> Send Reset Link -> check inbox (rollbeecall.online via Resend).

### Reset Password (/reset-password)
Open link before expiry. If expired, request new one. If valid, set New + Confirm (min 8) -> Update -> Go to Sign In.

### Sign Out
Sidebar Sign Out, or More -> Sign Out, or Settings -> Sign Out. Returns to /login.

---

## 4. App Layout and Navigation

Desktop Sidebar: Dashboard, Attendance, Daily Wise Attendance, Report, Management group (Students, Divisions), Settings, Sign Out. Mobile drawer with scrim.

Mobile BottomNav: Dashboard, Attendance, Daily, Reports, More (More covers Students/Divisions/Settings).
## 6. Divisions Management (/divisions)

Purpose: batches/classes (e.g. Std 8-A, Morning Batch). Must exist before students.

Toolbar: Add Division button (top-right), Search divisions box, Status filter (All/Active/Inactive, remembered per center).

Table columns: Division | Number of Students | Status (Active green / Inactive grey badge) | Created Date (e.g. 20 Oct 2026) | Actions (Edit, Delete).

Add Division: click Add Division -> modal DivisionForm: Name (required, unique per center case-insensitive, another center may reuse same name) + Status (Active/Inactive). Save -> toast Division created. Inactive divisions are hidden from Attendance/Students dropdowns but kept for history.

Edit: pencil -> change name/status -> Division updated.

Delete: trash -> ConfirmModal Delete Division: message Delete X and all its data? Type exact text Delete <Name> to enable Delete Division button. Rule: cannot delete if students still assigned -> error This division contains students. Reassign or remove them first. On success toast Division deleted.

Empty states: No divisions yet -> Create your first division. No divisions found -> Try different search.

## 8. Attendance Marking - Core Daily Workflow (/attendance)

This is the screen you use every day. Flow: pick Date + Division -> toggle absentees -> Submit.

Top filters (persisted): Date picker (defaults today, max today, cannot pick future), Division dropdown (only Active, shows student counts), View toggle Buttons (grid of roll-number buttons) vs Name-Roll (list rows). Search box filters roster live.

Roster behavior: students sorted by roll_number. Tap roll button/row to toggle Present (default/neutral) <-> Absent (red highlight). AbsentMap held locally until submit. Counters update live: Total / Present / Absent in AttendanceSummary + StatCards.

Action bar (bottom, disabled if empty/loading):
- All Present: clears all absents.
- Submit Attendance / Resubmit Attendance: creates/updates attendance_sessions (center+division+date) + attendance_records (present/absent per student). First submit -> Attendance submitted successfully + hasSubmitted=true; later edits same day -> Resubmit. Fires ATTENDANCE_UPDATED event -> Dashboard + Reports refresh instantly.
- All Absent: marks everyone absent (confirm before submit).

After submit: Submission notice (green success / red error), AbsenteesPanel appears listing absent students with Re-mark Present button + tap-to-call mobile link.

Absentee follow-up call tracking (student_call_logs):
- Each absent row shows phone icon + Call button (SwipeablePhone on mobile: swipe to call).
- Tap Call -> tel: link opens dialer. After call, click Mark as Called (or toggle). Stored with center_id + student_id + call_date + called_by (you) + called_at. Prevents duplicate for same day (alreadyCalled).
- Unmark option removes log. Call status cached in localStorage attendance-called:<center>:<date> for offline instant read, synced from Supabase via getStudentCallStatus.
- If table missing (fresh project), falls back to local cache with console warn to run docs/create-student-call-logs.sql.

Persistence: selected date/division/view-mode saved per center; refresh keeps you where you were. Attendance for past dates editable by changing date picker and resubmitting (creates audit trail via updated sessions).

Correct daily steps:
1. Select today + Division (or click red badge from Dashboard).
2. Tap absent roll numbers (leave present untouched).
3. Verify counts (Absent list matches register).
4. Submit -> check green notice.
## 11. Settings and Center Profile (/settings)

Top-right Sign Out button. Two cards:

Center Information form (prefilled): Center Name, Email, Phone, Address. Edit -> Save -> validation inline -> updateCenter() -> toast Center information saved + reload. Email/phone validated same as onboarding.

Account / Security card:
- Shows login email, role chip (owner), Google-linked badge if via Google.
- Change/Setup Password: New Password + Confirm (min 8, eye toggles) -> Save/Update Password -> toast Password saved. Google users: Save Password enables email login too; message You can now log in using either Google or email.
- Theme selector: Light / Dark radio (same as ThemeContext, synced to More/Header).

Danger: no delete-center button in UI (contact support / DB admin). Inactive center blocks login with support number.

---

## 12. More Page - Mobile Hub (/more)

Mobile-only shortcut hub. Top profile banner: logo avatar, center name, role chip + email. Management section: Students (Manage students, roll numbers, bulk import) -> /students; Divisions (Manage class divisions) -> /divisions. Settings section: Center Settings -> /settings; Theme row (Current: Light/Dark, Tap to toggle + pill); Sign Out (red, ends session).

---

## 13. Theme, Data Saving and Best Practices

Theme: toggle anywhere (Header/More/Settings) flips global.css variables + BottomNav style. Persisted in localStorage. Use Dark in low light, Light for projector.

Data saving: filters/selected division/date/view-mode/call cache persist per center+date in localStorage, so refresh/back never loses work. But source of truth is Supabase - if you switch device, reselect division/date (data follows you, UI prefs do not).

Best practices:
- Names: division Std 8-A not batch1; student full name as in register.
- Rolls: numeric, unique per division, never reuse same year.
- Mobiles: 10-digit, include for absentee calling.
- Statuses: Inactive for leavers/old batches (history kept); Delete only for wrong entries.
- Attendance: submit same day, resubmit same day for corrections (do not create duplicate registers), one division at a time.
- Imports: keep Excel headers simple (Name, Roll, Mobile, Division), check Preview before Confirm, keep file for audit.
- Security: never share password, sign out on shared PC, use Google + password both set so you have backup login.

---

## 14. Troubleshooting and FAQs

Q: I see No center found. Complete onboarding first. A: You logged in but have no membership. Go to /onboarding and create center.

Q: Login says Center is inactive. A: Admin deactivated center. Call 8139041877.

Q: Division save says already exists. A: Name clash (case-insensitive) within your center. Rename (e.g. 8-A Morning) or edit existing. Other centers can reuse same name - fine.

Q: Cannot delete division. A: Contains students. Move students to another division or delete them first.

Q: Student save says roll already used. A: Roll must be unique per division. Check list, pick next free roll.

Q: Attendance Submit disabled. A: No students in division (add students) or still loading. Check division filter.

Q: Dashboard shows No Data / 0 students. A: No active students/divisions. Add division -> add students -> mark attendance.

Q: Call log not saving. A: Run docs/create-student-call-logs.sql in Supabase SQL Editor (table missing falls back to local only). Check internet/session.

Q: Reset link expired. A: Links single-use + time-limited. Request new via Forgot Password, open within minutes, do not reuse old link.

Q: Supabase is not configured. A: Dev setup missing .env VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY. Restart dev server after adding.

Q: Another center sees my data? A: Impossible - every query filters center_id + RLS is_center_member(center_id). Verify by logging as two users - each sees empty until they add own data.

---

## 15. Recommended Daily / Weekly Checklist

Daily (teacher, 5 min per division):
1. Open Dashboard -> note red Pending badges.
2. Go Attendance -> select Today + Division.
3. Mark absents -> verify Total=Present+Absent.
4. Submit -> green notice -> check badge turns blue.
5. Call absentees from AbsenteesPanel -> Mark as Called.
6. Repeat all divisions.

Weekly (admin, 15 min):
- Reports -> filter last week Absent -> follow up chronic absentees.
- Students -> check new admissions added, leavers set Inactive.
- Divisions -> confirm counts match registers.
- Settings -> verify center phone/address current.

Monthly / Admission season:
- Smart Import new Excel batch -> review Import Summary -> fix duplicates.
- Archive finished batches to Inactive (keep reports).
- Test login + password backup (ensure both Google and email work).

Golden rule: Divisions first, Students second, Attendance daily, Reports for proof. If in doubt, Dashboard badges tell you what is Pending.

---
*End of Guidelines. App: center-portal 1.0.0 (React+Vite+Supabase). Support: call 8139041877 if center inactive. Docs: README.md, SUPABASE_RLS.md, docs/email-setup.md.*

5. Call absentees -> Mark as Called.
6. Repeat for next division.

---

## 9. Daily-Wise Attendance View (/daily-attendance)

Same engine as /attendance, date-focused layout for checking/correcting any day. Use when principal asks What happened on 15 Oct? Change date, pick division, view roster state, resubmit if correction needed. View-mode toggle and call tracking identical.

---

## 10. Reports - Attendance History (/reports)

Searchable audit log across all dates. Live-refreshes on ATTENDANCE_UPDATED.

Filters (persisted JSON in reports-filter:<center>): Date (date picker, empty = all dates), Division (All + Active), Status (All/Present/Absent), Search name or roll (debounced). Clear Filters button appears when any filter set.

Result line: N present/absent records found. Table: Student Name | Division | Status (green Present pill / red Absent pill) | Mobile (tel: link or dash). Sorted newest date first, then roll.

Empty: No records found / No absent records for this selection -> Try different date/division/search.

Workflow: verify yesterday (set Date=yesterday, Status=Absent -> call list), monthly check (Division=X, scroll dates), parent query (search name -> show status history).

---

Best practice: keep old batches as Inactive (preserves reports) instead of deleting; names short and consistent (e.g. 8-A, 9-B).

---

## 7. Students Management (/students)

Master data with manual + bulk Excel options.

Filters (remembered): Division dropdown (All + each division, auto-resets to All if division deleted), Status (All/Active/Inactive), Search (name/student no/roll/mobile, 300ms debounce).

Two import buttons + Add Student:
- Add Student: modal StudentForm: Student No auto-suggested sequential (unique per center), Name required, Roll Number numeric required unique per division, Division required (only Active shown), Status, Mobile optional (tap-to-call link in table). Rapid entry: after create, form resets, roll focuses, toast Student created, stays open for next entry. Edit prefills and closes on save.
- Smart Import (AI): StudentImportModal 3 steps: 1 Upload File (.xlsx/.xls/.csv, drag-drop, headers auto-detected) -> Match Columns -> 2 Map Columns (AI suggests name/roll/division/mobile mappings with confidence, you can correct dropdowns, extra cols ignored, warnings shown) -> Preview Transformed Data -> 3 Preview (table, choose Default Division for rows missing division) -> Confirm Import with progress bar (Preparing -> Importing). Summary: Imported N students. Duplicate/invalid rows listed.
- Legacy Import: ImportStudentsModal (division preselected) with Import Summary modal (Rows read, Imported, Duplicates, Invalid, Skipped + issues table Row/Roll/Reason).

Table: Student No | Name | Roll | Division | Mobile (tel: link with phone icon, or dash) | Status badge | Actions Edit/Delete. Delete asks Delete Student? Their attendance records will also be removed. (cascade deletes records).

Rules: student_id unique per center (auto-increments if clash), roll unique per division, division must belong to your center, deleting student removes their attendance too.

Workflow: first Smart Import your Excel, check Import Summary, fix issues, then manually Add stragglers. Set leavers to Inactive (keeps history) instead of delete.

---


Patterns: Toast confirmations, Modals for forms, type-to-confirm deletes, per-center filter persistence in localStorage, Light/Dark theme.

---

## 5. Dashboard - Daily Home (/portal)

Date chip on top. Stat cards: Total Students, Present Today (+pct), Absent Today (+pct), Divisions. Donut chart for todays percent + legend. Division badges: Red = Pending, Blue = Taken. Click badge -> /attendance with division preselected. Morning workflow: check red badges -> click -> mark -> return until all blue.

---
