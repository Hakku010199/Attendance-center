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
  const { data: students, error: sErr } = await supabase
    .from("students")
    .select("id, student_id, name, roll_number, division_id, status")
    .eq("center_id", center_id)
    .eq("division_id", divisionId)
    .eq("status", "active")
    .order("roll_number", { ascending: true });
  if (sErr) throw new Error("Unable to load attendance. Please try again.");
  const rows = (students ?? []).map((s) => ({
    id: s.id,
    studentId: s.student_id,
    name: s.name,
    rollNumber: s.roll_number,
    divisionId: s.division_id,
    status: s.status,
  }));
  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("id")
    .eq("center_id", center_id)
    .eq("division_id", divisionId)
    .eq("attendance_date", date)
    .maybeSingle();
  if (!session) return { students: rows, absentIds: [] };
  const { data: records, error: rErr } = await supabase
    .from("attendance_records")
    .select("student_id, status")
    .eq("center_id", center_id)
    .eq("session_id", session.id);
  if (rErr) throw new Error("Unable to load attendance. Please try again.");
  return { students: rows, absentIds: (records ?? []).filter((r) => r.status === "absent").map((r) => r.student_id) };
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
export const getHistory = async ({ date, divisionId, search } = {}) => {
  const center_id = await requireCenterId();
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
  const { data: records, error: rErr } = await supabase
    .from("attendance_records")
    .select("session_id, student_id, status")
    .eq("center_id", center_id)
    .in("session_id", sessionIds);
  if (rErr) throw new Error("Unable to load attendance history. Please try again.");
  const { data: students, error: stErr } = await supabase
    .from("students")
    .select("id, student_id, name, roll_number, division_id")
    .eq("center_id", center_id);
  if (stErr) throw new Error("Unable to load attendance history. Please try again.");
  const byStudent = Object.fromEntries((students ?? []).map((s) => [s.id, s]));
  const term = String(search ?? "").trim().toLowerCase();
  const out = [];
  for (const r of records ?? []) {
    const st = byStudent[r.student_id];
    if (!st) continue;
    if (term && !st.name.toLowerCase().includes(term) && !String(st.student_id).toLowerCase().includes(term)) continue;
    const sess = sessions.find((s) => s.id === r.session_id);
    out.push({
      sessionId: r.session_id,
      date: sess?.attendance_date ?? "",
      divisionId: sess?.division_id ?? st.division_id,
      rollNumber: st.roll_number,
      studentId: st.student_id,
      name: st.name,
      status: r.status,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Number(a.rollNumber) - Number(b.rollNumber)));
  return out;
};
