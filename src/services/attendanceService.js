// Attendance lives in Supabase: attendance_sessions + attendance_records.
// All reads/writes are scoped to the caller's center_id.
import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";
import { notifyAttendanceUpdated } from "../utils/events.js";

export const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const requireCenterId = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error } = await getCurrentMembership(uid);
  if (error) throw new Error(error);
  if (!membership) throw new Error("No center found for this account. Please complete onboarding first.");
  return membership.center_id;
};

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

const ensureSession = async (center_id, division_id, date) => {
  const { data: found, error: fErr } = await supabase
    .from("attendance_sessions")
    .select("id")
    .eq("center_id", center_id)
    .eq("division_id", division_id)
    .eq("attendance_date", date)
    .maybeSingle();
  if (fErr) throw fErr;
  if (found) return found.id;
  const { data: created, error: cErr } = await supabase
    .from("attendance_sessions")
    .insert({ center_id, division_id, attendance_date: date })
    .select("id")
    .single();
  if (cErr) throw cErr;
  return created.id;
};

export const getAttendance = async (date, divisionId) => {
  const center_id = await requireCenterId();
  let studentsQuery = supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id);
  if (divisionId && divisionId !== "all") {
    studentsQuery = studentsQuery.eq("division_id", divisionId);
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
      .select("student_id, status")
      .eq("center_id", center_id)
      .eq("date", date);
    if (divisionId && divisionId !== "all") {
      attQuery = attQuery.eq("division_id", divisionId);
    }
    const { data: attData, error: attErr } = await attQuery;
    if (!attErr && attData && attData.length > 0) {
      foundInTable = true;
      absentIds = attData.filter((r) => r.status === "absent").map((r) => r.student_id);
    }
  } catch {
    // continue to fallback
  }

  // 2. Fallback to attendance_sessions + attendance_records
  let hasSession = false;
  if (!foundInTable && divisionId && divisionId !== "all") {
    const { data: session } = await supabase
      .from("attendance_sessions")
      .select("id")
      .eq("center_id", center_id)
      .eq("division_id", divisionId)
      .eq("attendance_date", date)
      .maybeSingle();
    if (session) {
      hasSession = true;
      const { data: records, error: rErr } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("center_id", center_id)
        .eq("session_id", session.id);
      if (!rErr && records) {
        absentIds = records.filter((r) => r.status === "absent").map((r) => r.student_id);
      }
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
    const { data: auth } = await supabase.auth.getUser();
    const user_id = auth?.user?.id || null;

    if (!roster || roster.length === 0) {
      return { error: "No students in this division to submit." };
    }

    const records = roster.map((s) => ({
      center_id,
      division_id: s.divisionId || divisionId,
      student_id: s.id,
      date,
      status: absentMap[s.id] ? "absent" : "present",
      submitted_by: user_id,
      updated_at: new Date().toISOString(),
    }));

    // 1. Primary write to public.attendance table
    try {
      const { error: attErr } = await supabase
        .from("attendance")
        .upsert(records, { onConflict: "student_id,date" });
      if (attErr) {
        await supabase.from("attendance").upsert(records);
      }
    } catch (e) {
      console.warn("[attendance] error upserting to attendance table:", e);
    }

    // 2. Also sync to attendance_sessions + attendance_records for backwards compatibility
    try {
      if (divisionId && divisionId !== "all") {
        const session_id = await ensureSession(center_id, divisionId, date);
        const absentList = roster.filter((s) => absentMap[s.id]);
        const presentList = roster.filter((s) => !absentMap[s.id]);

        if (absentList.length > 0) {
          await supabase.from("attendance_records").upsert(
            absentList.map((s) => ({
              center_id,
              session_id,
              student_id: s.id,
              status: "absent",
            })),
            { onConflict: "session_id,student_id" }
          );
        }
        if (presentList.length > 0) {
          await supabase
            .from("attendance_records")
            .delete()
            .eq("center_id", center_id)
            .eq("session_id", session_id)
            .in("student_id", presentList.map((s) => s.id));
        }
      }
    } catch (e) {
      console.warn("[attendance] error syncing sessions:", e);
    }

    notifyAttendanceUpdated();
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to save attendance. Please try again." };
  }
};

export const setAbsent = async (date, divisionId, studentId, isAbsent) => {
  try {
    const center_id = await requireCenterId();
    const session_id = await ensureSession(center_id, divisionId, date);
    if (isAbsent) {
      const { error } = await supabase.from("attendance_records").upsert(
        { center_id, session_id, student_id: studentId, status: "absent" },
        { onConflict: "session_id,student_id" }
      );
      if (error) return { error: "Unable to save attendance. Please try again." };
    } else {
      const { error } = await supabase
        .from("attendance_records")
        .delete()
        .eq("center_id", center_id)
        .eq("session_id", session_id)
        .eq("student_id", studentId);
      if (error) return { error: "Unable to save attendance. Please try again." };
    }

    // Also sync to public.attendance table
    try {
      const { data: auth } = await supabase.auth.getUser();
      const attRecord = {
        center_id,
        division_id: divisionId,
        student_id: studentId,
        date,
        status: isAbsent ? "absent" : "present",
        submitted_by: auth?.user?.id || null,
        updated_at: new Date().toISOString(),
      };
      const { error: attErr } = await supabase
        .from("attendance")
        .upsert(attRecord, { onConflict: "student_id,date" });
      if (attErr) {
        await supabase.from("attendance").upsert(attRecord);
      }
    } catch (e) {
      console.warn("[attendance] error syncing to attendance table in setAbsent:", e);
    }

    notifyAttendanceUpdated();
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to save attendance. Please try again." };
  }
};

export const getOverview = async () => {
  const center_id = await requireCenterId();
  const today = todayISO();
  const [{ data: students }, { data: divisions }, { data: sessions }] = await Promise.all([
    supabase.from("students").select("id").eq("center_id", center_id).eq("status", "active"),
    supabase.from("divisions").select("id").eq("center_id", center_id).eq("status", "active"),
    supabase.from("attendance_sessions").select("id").eq("center_id", center_id).eq("attendance_date", today),
  ]);
  const total = (students ?? []).length;
  let absent = 0;
  if ((sessions ?? []).length > 0) {
    const { data: records } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("center_id", center_id)
      .in("session_id", sessions.map((s) => s.id))
      .eq("status", "absent");
    absent = (records ?? []).length;
  }
  const present = Math.max(total - absent, 0);
  return { total, absent, present, presentPct: pct(present, total), divisions: (divisions ?? []).length, weekly: await weeklyTrend(center_id), activity: [] };
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
    const { data: sessions } = await supabase.from("attendance_sessions").select("id").eq("center_id", center_id).eq("attendance_date", days[i]);
    let absent = 0;
    if ((sessions ?? []).length > 0) {
      const { data: records } = await supabase.from("attendance_records").select("id").eq("center_id", center_id).in("session_id", sessions.map((s) => s.id)).eq("status", "absent");
      absent = (records ?? []).length;
    }
    out.push({ label: labels[i], value: pct(Math.max(total - absent, 0), total) });
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
