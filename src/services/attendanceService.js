// Attendance lives in Supabase: attendance_sessions + attendance_records.
// All reads/writes are scoped to the caller's center_id.
import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";
import { getFacultySession } from "./facultyAuthService.js";
import { notifyAttendanceUpdated } from "../utils/events.js";
import { checkFacultyAccessTime } from "../utils/timeSettings.js";

export const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const requireCenterId = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (uid) {
    const { membership, error } = await getCurrentMembership(uid);
    if (!error && membership?.center_id) {
      return membership.center_id;
    }
  }
  const faculty = getFacultySession();
  if (faculty?.center?.id) {
    return faculty.center.id;
  }
  throw new Error("Your session has expired. Please log in again.");
};

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

const isUUID = (val) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

/**
 * Ensures there is only ONE attendance session per center + division + date.
 * If one already exists, reuses it rather than creating a duplicate.
 * Avoids passing optional columns that may trigger foreign key (23503) or column missing (42703) errors.
 */
export const ensureSameSession = async (center_id, division_id, date) => {
  if (!center_id || !division_id || division_id === "all" || !date) return null;

  try {
    // 1. Check if a session already exists for this center + division + date
    const { data: existing, error: eErr } = await supabase
      .from("attendance_sessions")
      .select("id")
      .eq("center_id", center_id)
      .eq("division_id", division_id)
      .eq("attendance_date", date)
      .limit(1)
      .maybeSingle();

    if (!eErr && existing?.id) {
      return existing.id;
    }

    // 2. Insert single session if none exists
    const { data: created, error: cErr } = await supabase
      .from("attendance_sessions")
      .insert({
        center_id,
        division_id,
        attendance_date: date,
      })
      .select("id")
      .maybeSingle();

    if (!cErr && created?.id) return created.id;

    if (cErr) {
      console.warn("[attendance] ensureSameSession initial insert warning:", cErr);

      // Fallback: column name might be 'date' instead of 'attendance_date'
      if (cErr.code === "42703" || String(cErr.message || "").toLowerCase().includes("attendance_date")) {
        const { data: fallbackCreated, error: fbErr } = await supabase
          .from("attendance_sessions")
          .insert({
            center_id,
            division_id,
            date: date,
          })
          .select("id")
          .maybeSingle();
        if (!fbErr && fallbackCreated?.id) return fallbackCreated.id;
      }

      // Retry fetch in case of concurrent creation or race condition
      const { data: retry } = await supabase
        .from("attendance_sessions")
        .select("id")
        .eq("center_id", center_id)
        .eq("division_id", division_id)
        .eq("attendance_date", date)
        .limit(1)
        .maybeSingle();
      if (retry?.id) return retry.id;
    }

    return null;
  } catch (err) {
    console.warn("[attendance] ensureSameSession error:", err);
    return null;
  }
};

export const getAttendance = async (date, divisionId) => {
  const center_id = await requireCenterId();
  const { data: auth } = await supabase.auth.getUser();
  const isCenterAdmin = Boolean(auth?.user?.id);

  let targetDivId = divisionId;
  let studentsQuery = supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id);

  // If accessed by a faculty teacher, strictly scope to their assigned divisions
  if (!isCenterAdmin) {
    const faculty = getFacultySession();
    const assignedIds = faculty?.teacher?.divisionIds || (faculty?.teacher?.divisionId ? [faculty.teacher.divisionId] : []);
    if (assignedIds.length > 0) {
      if (targetDivId && targetDivId !== "all") {
        if (!assignedIds.includes(targetDivId)) {
          targetDivId = assignedIds[0];
        }
      } else {
        targetDivId = assignedIds[0];
      }
    }
  }

  if (targetDivId && targetDivId !== "all") {
    studentsQuery = studentsQuery.eq("division_id", targetDivId);
  }
  const { data: students, error: sErr } = await studentsQuery
    .order("roll_number", { ascending: true });
  if (sErr) throw new Error("Unable to load attendance. Please try again.");
  const rows = (students ?? []).map((s) => ({
    id: s.id,
    studentId: s.student_id,
    name: s.name,
    rollNumber: s.roll_number,
    divisionId: s.division_id,
    status: s.status,
    mobile: s.mobile || s.phone || "",
  }));

  // 1. Check public.attendance table first
  let absentIds = [];
  let foundInTable = false;
  try {
    let attQuery = supabase
      .from("attendance")
      .select("student_id, status, division_id")
      .eq("center_id", center_id)
      .eq("date", date);
    if (targetDivId && targetDivId !== "all") {
      attQuery = attQuery.eq("division_id", targetDivId);
    }
    let { data: attData, error: attErr } = await attQuery;

    // Fallback: match by student IDs in this division
    if ((!attData || attData.length === 0) && rows.length > 0) {
      const studentIds = rows.map((r) => r.id);
      const { data: fallbackData } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("center_id", center_id)
        .eq("date", date)
        .in("student_id", studentIds);
      if (fallbackData && fallbackData.length > 0) {
        attData = fallbackData;
      }
    }

    if (attData && attData.length > 0) {
      foundInTable = true;
      absentIds = attData.filter((r) => r.status === "absent").map((r) => r.student_id);
    }
  } catch (e) {
    console.warn("[attendance] getAttendance attendance table check:", e);
  }

  // 2. Check if a session exists in attendance_sessions
  let hasSession = false;
  if (targetDivId && targetDivId !== "all") {
    const { data: session } = await supabase
      .from("attendance_sessions")
      .select("id")
      .eq("center_id", center_id)
      .eq("division_id", targetDivId)
      .eq("attendance_date", date)
      .limit(1)
      .maybeSingle();
    if (session) {
      hasSession = true;
    }
  }

  return { students: rows, absentIds, hasSubmitted: foundInTable || hasSession };
};

export const fetchDivisionStudentCounts = async () => {
  try {
    const center_id = await requireCenterId();
    const { data: students } = await supabase
      .from("students")
      .select("id, division_id")
      .eq("center_id", center_id);
    const counts = {};
    for (const s of students ?? []) {
      if (s.division_id) {
        counts[s.division_id] = (counts[s.division_id] ?? 0) + 1;
      }
    }
    return counts;
  } catch {
    return {};
  }
};

export const submitAttendance = async ({ date, divisionId, roster, absentMap }) => {
  try {
    const center_id = await requireCenterId();
    const faculty = getFacultySession();

    // Check Faculty Access Time window when submitted by a teacher
    if (faculty?.center?.id) {
      try {
        const { data: cRow } = await supabase
          .from("centers")
          .select("faculty_time_restriction_enabled, faculty_start_time, faculty_end_time, timezone")
          .eq("id", faculty.center.id)
          .maybeSingle();
        const timeCheck = checkFacultyAccessTime(cRow || faculty.center);
        if (!timeCheck.allowed) {
          return { error: timeCheck.message || "Faculty attendance access has closed for today." };
        }
      } catch (err) {
        console.warn("[attendance] time check warning:", err);
      }
    }
    
    // Resolve valid submitter UUID (Postgres column is UUID; never pass username string)
    let submitter_uuid = null;
    if (faculty?.teacher?.id && isUUID(faculty.teacher.id)) {
      submitter_uuid = faculty.teacher.id;
    } else {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id && isUUID(auth.user.id)) {
        submitter_uuid = auth.user.id;
      }
    }

    if (!roster || roster.length === 0) {
      return { error: "No students in this division to submit." };
    }

    // 1. Primary write to public.attendance table
    const records = roster.map((s) => ({
      center_id,
      division_id: s.divisionId || divisionId,
      student_id: s.id,
      date,
      status: absentMap[s.id] ? "absent" : "present",
      submitted_by: submitter_uuid,
      updated_at: new Date().toISOString(),
    }));

    let { error: attErr } = await supabase
      .from("attendance")
      .upsert(records, { onConflict: "student_id,date" });

    if (attErr) {
      // Fallback: if submitted_by threw 22P02, 23503, 42703 or UUID error, retry with null
      if (
        attErr.code === "22P02" ||
        attErr.code === "23503" ||
        attErr.code === "42703" ||
        String(attErr.message || "").toLowerCase().includes("submitted_by") ||
        String(attErr.message || "").toLowerCase().includes("uuid")
      ) {
        const stripped = records.map(({ submitted_by, ...rest }) => ({
          ...rest,
          submitted_by: null,
        }));
        const { error: retryErr } = await supabase
          .from("attendance")
          .upsert(stripped, { onConflict: "student_id,date" });
        attErr = retryErr;
      }
    }

    if (attErr) {
      console.error("[attendance] error upserting to attendance table:", attErr);
      return {
        error:
          attErr?.message ||
          "Unable to save attendance records. Please verify database permissions in Supabase.",
      };
    }

    // 2. Ensure single session in attendance_sessions and sync attendance_records
    const divIdsToEnsure = new Set();
    if (divisionId && divisionId !== "all") {
      divIdsToEnsure.add(divisionId);
    }
    for (const s of roster) {
      const dId = s.divisionId || s.division_id;
      if (dId && dId !== "all") {
        divIdsToEnsure.add(dId);
      }
    }

    for (const dId of divIdsToEnsure) {
      const sessionId = await ensureSameSession(center_id, dId, date);
      if (sessionId) {
        try {
          const divStudents = roster.filter(
            (s) => (s.divisionId || s.division_id || divisionId) === dId
          );
          const recRows = divStudents.map((s) => ({
            center_id,
            session_id: sessionId,
            student_id: s.id,
            status: absentMap[s.id] ? "absent" : "present",
            marked_at: new Date().toISOString(),
          }));
          if (recRows.length > 0) {
            await supabase
              .from("attendance_records")
              .upsert(recRows, { onConflict: "session_id,student_id" });
          }
        } catch (recErr) {
          console.warn("[attendance] attendance_records sync warning:", recErr);
        }
      }
    }

    notifyAttendanceUpdated();
    return { data: true };
  } catch (e) {
    console.error("[attendance] submitAttendance error:", e);
    return { error: e?.message || "Unable to save attendance. Please try again." };
  }
};

export const setAbsent = async (date, divisionId, studentId, isAbsent) => {
  try {
    const center_id = await requireCenterId();
    const faculty = getFacultySession();

    // Check Faculty Access Time window when toggled by a teacher
    if (faculty?.center?.id) {
      try {
        const { data: cRow } = await supabase
          .from("centers")
          .select("faculty_time_restriction_enabled, faculty_start_time, faculty_end_time, timezone")
          .eq("id", faculty.center.id)
          .maybeSingle();
        const timeCheck = checkFacultyAccessTime(cRow || faculty.center);
        if (!timeCheck.allowed) {
          return { error: timeCheck.message || "Faculty attendance access has closed for today." };
        }
      } catch (err) {
        console.warn("[attendance] time check warning:", err);
      }
    }

    let submitter_uuid = null;
    if (faculty?.teacher?.id && isUUID(faculty.teacher.id)) {
      submitter_uuid = faculty.teacher.id;
    } else {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id && isUUID(auth.user.id)) {
        submitter_uuid = auth.user.id;
      }
    }

    // Resolve target division ID
    let targetDivId = divisionId;
    if (!targetDivId || targetDivId === "all") {
      const { data: st } = await supabase
        .from("students")
        .select("division_id")
        .eq("id", studentId)
        .maybeSingle();
      if (st?.division_id) {
        targetDivId = st.division_id;
      }
    }

    // 1. Primary update/upsert to public.attendance table
    const attRecord = {
      center_id,
      division_id: targetDivId,
      student_id: studentId,
      date,
      status: isAbsent ? "absent" : "present",
      submitted_by: submitter_uuid,
      updated_at: new Date().toISOString(),
    };

    let { error: attErr } = await supabase
      .from("attendance")
      .upsert(attRecord, { onConflict: "student_id,date" });

    if (attErr) {
      if (
        attErr.code === "22P02" ||
        attErr.code === "23503" ||
        attErr.code === "42703" ||
        String(attErr.message || "").toLowerCase().includes("submitted_by") ||
        String(attErr.message || "").toLowerCase().includes("uuid")
      ) {
        const { submitted_by, ...stripped } = attRecord;
        const { error: retryErr } = await supabase
          .from("attendance")
          .upsert({ ...stripped, submitted_by: null }, { onConflict: "student_id,date" });
        attErr = retryErr;
      }
    }

    if (attErr) {
      console.error("[attendance] setAbsent error in attendance table:", attErr);
      return { error: "Unable to save attendance record. Please try again." };
    }

    // 2. Ensure single session in attendance_sessions and sync attendance_records
    if (targetDivId && targetDivId !== "all") {
      const sessionId = await ensureSameSession(center_id, targetDivId, date);
      if (sessionId) {
        try {
          await supabase
            .from("attendance_records")
            .upsert(
              {
                center_id,
                session_id: sessionId,
                student_id: studentId,
                status: isAbsent ? "absent" : "present",
                marked_at: new Date().toISOString(),
              },
              { onConflict: "session_id,student_id" }
            );
        } catch (rErr) {
          console.warn("[attendance] setAbsent records sync warning:", rErr);
        }
      }
    }

    notifyAttendanceUpdated();
    return { data: true };
  } catch (e) {
    console.error("[attendance] setAbsent error:", e);
    return { error: e?.message || "Unable to save attendance. Please try again." };
  }
};

export const getOverview = async () => {
  const center_id = await requireCenterId();
  const today = todayISO();

  // Load students, divisions, and today's sessions concurrently
  const [{ data: students }, { data: divisions }, { data: sessions }] = await Promise.all([
    supabase
      .from("students")
      .select("id, division_id")
      .eq("center_id", center_id)
      .eq("status", "active"),
    supabase
      .from("divisions")
      .select("id, name")
      .eq("center_id", center_id)
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase
      .from("attendance_sessions")
      .select("id, division_id")
      .eq("center_id", center_id)
      .eq("attendance_date", today),
  ]);

  const total = (students ?? []).length;
  const studentToDiv = {};
  for (const s of students ?? []) {
    if (s.division_id) {
      studentToDiv[s.id] = s.division_id;
    }
  }

  const completedDivIds = new Set();

  // 1. Mark divisions that have an attendance session created for today
  for (const s of sessions ?? []) {
    if (s.division_id) {
      completedDivIds.add(s.division_id);
    }
  }

  // 2. Mark divisions and calculate stats from public.attendance table for today
  let absent = 0;
  let present = 0;
  let foundInAttendance = false;

  try {
    const { data: attData } = await supabase
      .from("attendance")
      .select("student_id, division_id, status")
      .eq("center_id", center_id)
      .eq("date", today);

    if (attData && attData.length > 0) {
      foundInAttendance = true;
      for (const r of attData) {
        if (r.status === "absent") absent++;
        else if (r.status === "present") present++;
        const divId = r.division_id || studentToDiv[r.student_id];
        if (divId) completedDivIds.add(divId);
      }
    }
  } catch (e) {
    console.warn("[overview] error checking attendance table:", e);
  }

  // 3. Fallback: if no rows in attendance table, calculate from attendance_records
  if (!foundInAttendance && (sessions ?? []).length > 0) {
    try {
      const sessionIds = (sessions ?? []).map((s) => s.id);
      const { data: records } = await supabase
        .from("attendance_records")
        .select("id")
        .eq("center_id", center_id)
        .in("session_id", sessionIds)
        .eq("status", "absent");
      absent = (records ?? []).length;
      present = Math.max(total - absent, 0);
    } catch {}
  }

  const divisionList = (divisions ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    attendanceTaken: completedDivIds.has(d.id),
  }));

  return {
    total,
    absent,
    present,
    presentPct: pct(present, total),
    divisions: (divisions ?? []).length,
    divisionList,
    weekly: await weeklyTrend(center_id),
    activity: [],
  };
};

const weeklyTrend = async (center_id) => {
  const days = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const p = (n) => String(n).padStart(2, "0");
    days.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const { data: students } = await supabase.from("students").select("id").eq("center_id", center_id).eq("status", "active");
  const total = (students ?? []).length || 1;
  const out = [];
  for (let i = 0; i < days.length; i++) {
    let dayAbsent = 0;
    let dayRecorded = false;
    try {
      const { data: att } = await supabase
        .from("attendance")
        .select("status")
        .eq("center_id", center_id)
        .eq("date", days[i]);
      if (att && att.length > 0) {
        dayRecorded = true;
        dayAbsent = att.filter((r) => r.status === "absent").length;
      }
    } catch {}

    if (!dayRecorded) {
      const { data: sessions } = await supabase
        .from("attendance_sessions")
        .select("id")
        .eq("center_id", center_id)
        .eq("attendance_date", days[i]);
      if ((sessions ?? []).length > 0) {
        const { data: records } = await supabase
          .from("attendance_records")
          .select("id")
          .eq("center_id", center_id)
          .in("session_id", sessions.map((s) => s.id))
          .eq("status", "absent");
        dayAbsent = (records ?? []).length;
      }
    }
    out.push({ label: labels[i], value: pct(Math.max(total - dayAbsent, 0), total) });
  }
  return out;
};

export const getReport = async () => {
  const center_id = await requireCenterId();
  const { data: divisions } = await supabase.from("divisions").select("id, name").eq("center_id", center_id).eq("status", "active");
  const { data: students } = await supabase.from("students").select("id, division_id").eq("center_id", center_id).eq("status", "active");
  const { data: sessions } = await supabase.from("attendance_sessions").select("id, division_id").eq("center_id", center_id);
  let records = [];
  if ((sessions ?? []).length > 0) {
    const { data } = await supabase.from("attendance_records").select("session_id, status").eq("center_id", center_id).in("session_id", sessions.map((s) => s.id));
    records = data ?? [];
  }
  const sessById = Object.fromEntries((sessions ?? []).map((s) => [s.id, s.division_id]));
  const absentByDiv = {};
  for (const r of records) {
    if (r.status !== "absent") continue;
    const div = sessById[r.session_id];
    if (div) absentByDiv[div] = (absentByDiv[div] ?? 0) + 1;
  }
  const sessionCount = (sessions ?? []).length || 1;
  const performance = (divisions ?? []).map((d) => {
    const count = (students ?? []).filter((s) => s.division_id === d.id).length || 1;
    const absent = absentByDiv[d.id] ?? 0;
    return { label: d.name, value: pct(Math.max(count * sessionCount - absent, 0), count * sessionCount) };
  });
  const avg = performance.length ? Math.round((performance.reduce((a, p) => a + p.value, 0) / performance.length) * 10) / 10 : 0;
  return { average: avg, present: records.filter((r) => r.status !== "absent").length, absent: records.filter((r) => r.status === "absent").length, trend: await weeklyTrend(center_id), performance };
};

// Office pattern: searchable audit log across all dates for this center.
// Orders by attendance_date DESC, groups by date, sorts each group by roll.
export const getHistory = async ({ date, divisionId, status, search } = {}) => {
  const center_id = await requireCenterId();

  const { data: students, error: stErr } = await supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id);
  if (stErr) throw new Error("Unable to load attendance history. Please try again.");
  const byStudent = Object.fromEntries((students ?? []).map((s) => [s.id, s]));
  const term = String(search ?? "").trim().toLowerCase();

  // 1. Try public.attendance table first
  let attRecords = [];
  let foundInAttendance = false;
  try {
    let attQuery = supabase
      .from("attendance")
      .select("id, student_id, division_id, date, status")
      .eq("center_id", center_id)
      .order("date", { ascending: false });
    if (date) attQuery = attQuery.eq("date", date);
    if (divisionId && divisionId !== "all") attQuery = attQuery.eq("division_id", divisionId);
    if (status && status !== "all") attQuery = attQuery.eq("status", status);

    const { data: attData, error: attErr } = await attQuery;
    if (!attErr && attData && attData.length > 0) {
      foundInAttendance = true;
      attRecords = attData;
    }
  } catch (e) {
    console.warn("[history] attendance table query:", e);
  }

  const out = [];

  if (foundInAttendance) {
    for (const r of attRecords) {
      const st = byStudent[r.student_id];
      if (!st) continue;
      if (
        term &&
        !st.name.toLowerCase().includes(term) &&
        !String(st.student_id).toLowerCase().includes(term) &&
        !String(st.roll_number ?? "").toLowerCase().includes(term) &&
        !String(st.mobile || "").toLowerCase().includes(term)
      )
        continue;
      out.push({
        sessionId: r.id,
        date: r.date ?? "",
        divisionId: r.division_id ?? st.division_id,
        rollNumber: st.roll_number,
        studentId: st.student_id,
        name: st.name,
        mobile: st.mobile || st.phone || "",
        status: r.status,
      });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Number(a.rollNumber) - Number(b.rollNumber)));
    return out;
  }

  // 2. Fallback to attendance_sessions + attendance_records
  let sessionQuery = supabase
    .from("attendance_sessions")
    .select("id, attendance_date, division_id")
    .eq("center_id", center_id)
    .order("attendance_date", { ascending: false });
  if (date) sessionQuery = sessionQuery.eq("attendance_date", date);
  if (divisionId && divisionId !== "all") sessionQuery = sessionQuery.eq("division_id", divisionId);
  const { data: sessions, error: sErr } = await sessionQuery;
  if (sErr) throw new Error("Unable to load attendance history. Please try again.");
  if ((sessions ?? []).length === 0) return [];
  const sessionIds = sessions.map((s) => s.id);

  let recordQuery = supabase
    .from("attendance_records")
    .select("session_id, student_id, status")
    .eq("center_id", center_id)
    .in("session_id", sessionIds);
  if (status && status !== "all") {
    recordQuery = recordQuery.eq("status", status);
  }
  const { data: records, error: rErr } = await recordQuery;
  if (rErr) throw new Error("Unable to load attendance history. Please try again.");

  for (const r of records ?? []) {
    const st = byStudent[r.student_id];
    if (!st) continue;
    if (
      term &&
      !st.name.toLowerCase().includes(term) &&
      !String(st.student_id).toLowerCase().includes(term) &&
      !String(st.roll_number ?? "").toLowerCase().includes(term) &&
      !String(st.mobile || "").toLowerCase().includes(term)
    )
      continue;
    const sess = sessions.find((s) => s.id === r.session_id);
    out.push({
      sessionId: r.session_id,
      date: sess?.attendance_date ?? "",
      divisionId: sess?.division_id ?? st.division_id,
      rollNumber: st.roll_number,
      studentId: st.student_id,
      name: st.name,
      mobile: st.mobile || st.phone || "",
      status: r.status,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Number(a.rollNumber) - Number(b.rollNumber)));
  return out;
};

/**
 * Fetches division-wide attendance report data for a date range.
 * Computes each student's present/absent days and attendance percentage.
 */
export const getDivisionPrintReport = async ({ divisionId, fromDate, toDate }) => {
  const center_id = await requireCenterId();

  // 1. Fetch division info
  let divisionName = "All Divisions";
  if (divisionId && divisionId !== "all") {
    const { data: div } = await supabase
      .from("divisions")
      .select("name")
      .eq("center_id", center_id)
      .eq("id", divisionId)
      .maybeSingle();
    if (div?.name) divisionName = div.name;
  }

  // 2. Fetch active students in this division
  let stQuery = supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id)
    .eq("status", "active")
    .order("roll_number", { ascending: true });
  if (divisionId && divisionId !== "all") {
    stQuery = stQuery.eq("division_id", divisionId);
  }
  const { data: students, error: stErr } = await stQuery;
  if (stErr) throw new Error("Unable to load students for report.");
  const studentList = students || [];

  // 3. Query attendance records in date range from public.attendance table
  const dateMap = new Set();
  const studentStatusByDate = {};
  for (const s of studentList) {
    studentStatusByDate[s.id] = {};
  }

  try {
    let attQuery = supabase
      .from("attendance")
      .select("student_id, date, status, division_id")
      .eq("center_id", center_id)
      .gte("date", fromDate)
      .lte("date", toDate);
    if (divisionId && divisionId !== "all") {
      attQuery = attQuery.eq("division_id", divisionId);
    }
    const { data: attData } = await attQuery;
    if (attData && attData.length > 0) {
      for (const row of attData) {
        if (row.date) dateMap.add(row.date);
        if (studentStatusByDate[row.student_id]) {
          studentStatusByDate[row.student_id][row.date] = row.status;
        }
      }
    }
  } catch (e) {
    console.warn("[report] attendance table query:", e);
  }

  // Also query attendance_sessions in date range
  try {
    let sessQuery = supabase
      .from("attendance_sessions")
      .select("id, attendance_date, division_id")
      .eq("center_id", center_id)
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate);
    if (divisionId && divisionId !== "all") {
      sessQuery = sessQuery.eq("division_id", divisionId);
    }
    const { data: sessions } = await sessQuery;
    if (sessions && sessions.length > 0) {
      const sessMap = {};
      for (const s of sessions) {
        dateMap.add(s.attendance_date);
        sessMap[s.id] = s.attendance_date;
      }
      const sessionIds = sessions.map((s) => s.id);
      const { data: records } = await supabase
        .from("attendance_records")
        .select("session_id, student_id, status")
        .eq("center_id", center_id)
        .in("session_id", sessionIds);
      if (records) {
        for (const r of records) {
          const dt = sessMap[r.session_id];
          if (dt && studentStatusByDate[r.student_id]) {
            if (!studentStatusByDate[r.student_id][dt]) {
              studentStatusByDate[r.student_id][dt] = r.status;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[report] sessions query:", e);
  }

  // Generate all consecutive calendar dates in the selected date range
  const allDates = [];
  const curDate = new Date(`${fromDate}T00:00:00`);
  const endDate = new Date(`${toDate}T00:00:00`);
  while (curDate <= endDate) {
    const y = curDate.getFullYear();
    const m = String(curDate.getMonth() + 1).padStart(2, "0");
    const d = String(curDate.getDate()).padStart(2, "0");
    allDates.push(`${y}-${m}-${d}`);
    curDate.setDate(curDate.getDate() + 1);
  }

  // Calculate stats for each student
  const studentReports = studentList.map((s) => {
    let presentCount = 0;
    let absentCount = 0;
    const history = {};

    for (const d of allDates) {
      const st = studentStatusByDate[s.id]?.[d];
      if (st === "absent") {
        absentCount++;
        history[d] = "A";
      } else if (st === "present") {
        presentCount++;
        history[d] = "P";
      } else {
        history[d] = "—";
      }
    }

    const recordedDays = presentCount + absentCount;
    const pctVal = recordedDays > 0 ? Math.round((presentCount / recordedDays) * 1000) / 10 : 0;
    return {
      id: s.id,
      name: s.name,
      rollNumber: s.roll_number ?? s.student_id ?? "—",
      mobile: s.mobile || s.phone || "—",
      presentCount,
      absentCount,
      recordedDays,
      totalSessions: allDates.length,
      percentage: pctVal,
      history,
    };
  });

  // Calculate daily totals for bottom summary rows
  const dailyTotals = {};
  for (const d of allDates) {
    let present = 0;
    let absent = 0;
    for (const s of studentReports) {
      if (s.history[d] === "P") present++;
      else if (s.history[d] === "A") absent++;
    }
    dailyTotals[d] = { present, absent };
  }

  const totalRecorded = studentReports.reduce((acc, cur) => acc + cur.recordedDays, 0);
  const totalPresents = studentReports.reduce((acc, cur) => acc + cur.presentCount, 0);
  const overallPercentage = totalRecorded > 0 ? Math.round((totalPresents / totalRecorded) * 1000) / 10 : 0;

  return {
    divisionName,
    fromDate,
    toDate,
    totalSessions: allDates.length,
    dates: allDates,
    students: studentReports,
    dailyTotals,
    overallPercentage,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Fetches attendance report data for a single student over a date range.
 * Returns daily logs and overall summary.
 */
export const getStudentPrintReport = async ({
  studentId,
  fromDate,
  toDate,
  includeAllDates = false,
  reportFormat = "custom",
}) => {
  const center_id = await requireCenterId();

  // 1. Fetch student info
  const { data: st, error: stErr } = await supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id)
    .eq("id", studentId)
    .single();
  if (stErr || !st) throw new Error("Student not found.");

  // 2. Fetch division name
  let divisionName = "Unassigned";
  if (st.division_id) {
    const { data: div } = await supabase
      .from("divisions")
      .select("name")
      .eq("center_id", center_id)
      .eq("id", st.division_id)
      .maybeSingle();
    if (div?.name) divisionName = div.name;
  }

  // 3. Fetch all attendance dates conducted for this student's division or center in the date range
  const datesConducted = new Set();
  const dayStatusMap = {};

  try {
    let q = supabase
      .from("attendance")
      .select("date, status")
      .eq("center_id", center_id)
      .eq("student_id", studentId)
      .gte("date", fromDate)
      .lte("date", toDate);
    const { data: attData } = await q;
    if (attData) {
      for (const row of attData) {
        datesConducted.add(row.date);
        dayStatusMap[row.date] = row.status;
      }
    }
  } catch (e) {
    console.warn("[student report] attendance query:", e);
  }

  // Also check sessions & records
  try {
    let sessQuery = supabase
      .from("attendance_sessions")
      .select("id, attendance_date")
      .eq("center_id", center_id)
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate);
    if (st.division_id) {
      sessQuery = sessQuery.eq("division_id", st.division_id);
    }
    const { data: sessions } = await sessQuery;
    if (sessions && sessions.length > 0) {
      const sessMap = {};
      for (const s of sessions) {
        datesConducted.add(s.attendance_date);
        sessMap[s.id] = s.attendance_date;
      }
      const sessionIds = sessions.map((s) => s.id);
      const { data: records } = await supabase
        .from("attendance_records")
        .select("session_id, status")
        .eq("center_id", center_id)
        .eq("student_id", studentId)
        .in("session_id", sessionIds);
      if (records) {
        for (const r of records) {
          const dt = sessMap[r.session_id];
          if (dt && !dayStatusMap[dt]) {
            dayStatusMap[dt] = r.status;
          }
        }
      }
    }
  } catch (e) {
    console.warn("[student report] session query:", e);
  }

  // Resolve target dates:
  // If includeAllDates = true (Weekly/Monthly), list all calendar days between fromDate and toDate
  let sortedDates = [];
  if (includeAllDates) {
    const cur = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const dayNum = String(cur.getDate()).padStart(2, "0");
      sortedDates.push(`${y}-${m}-${dayNum}`);
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    sortedDates = Array.from(datesConducted).sort();
  }

  let presentDays = 0;
  let absentDays = 0;

  const logs = sortedDates.map((d) => {
    const rawStatus = dayStatusMap[d];
    let attendance = "—";
    if (rawStatus === "present") {
      attendance = "P";
      presentDays++;
    } else if (rawStatus === "absent") {
      attendance = "A";
      absentDays++;
    }

    const dateObj = new Date(`${d}T00:00:00`);
    const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "short" });
    const formattedDate = dateObj.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return {
      date: d,
      formattedDate,
      dayOfWeek,
      attendance,
      status: rawStatus || "none",
    };
  });

  const totalConducted = presentDays + absentDays;
  const percentage = totalConducted > 0
    ? Math.round((presentDays / totalConducted) * 1000) / 10
    : 0;

  return {
    student: {
      id: st.id,
      name: st.name,
      rollNumber: st.roll_number ?? st.student_id ?? "—",
      mobile: st.mobile || st.phone || "—",
    },
    divisionName,
    fromDate,
    toDate,
    reportFormat,
    summary: {
      totalDays: sortedDates.length,
      presentDays,
      absentDays,
      totalConducted,
      percentage,
    },
    logs,
    generatedAt: new Date().toISOString(),
  };
};
