import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";

/**
 * Ensures caller is authenticated and resolves center_id.
 */
export const requireCenterId = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error } = await getCurrentMembership(uid);
  if (error) throw new Error(error);
  if (!membership) {
    throw new Error("No center found for this account. Please complete onboarding first.");
  }
  return membership.center_id;
};

const isTableMissingError = (err) => {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    err.code === "42P01" ||
    err.code === "PGRST204"
  );
};

/**
 * Fetches persistent call records for a center on a specific date.
 * Returns a map of studentId -> { id, calledAt, calledBy, callDate }.
 */
export const getStudentCallStatus = async ({ centerId, date }) => {
  try {
    const resolvedCenterId = centerId || (await requireCenterId());
    if (!resolvedCenterId || !date) {
      return { data: {}, error: null };
    }

    const { data, error } = await supabase
      .from("student_call_logs")
      .select("id, student_id, call_date, called_at, called_by")
      .eq("center_id", resolvedCenterId)
      .eq("call_date", date);

    if (error) {
      if (isTableMissingError(error)) {
        console.warn(
          "[callService] student_call_logs table not found in Supabase. Run docs/create-student-call-logs.sql in your Supabase SQL Editor."
        );
        // Fall back to local storage cache if table not yet created in remote DB
        try {
          const raw = localStorage.getItem(`attendance-called:${resolvedCenterId}:${date}`);
          return { data: raw ? JSON.parse(raw) : {}, error: null };
        } catch {
          return { data: {}, error: null };
        }
      }
      return { data: {}, error: error.message || "Failed to load call logs." };
    }

    const map = {};
    for (const r of data || []) {
      map[r.student_id] = {
        id: r.id,
        calledAt: r.called_at,
        calledBy: r.called_by,
        callDate: r.call_date,
      };
    }

    // Sync to local storage for instant offline read
    try {
      localStorage.setItem(`attendance-called:${resolvedCenterId}:${date}`, JSON.stringify(map));
    } catch {}

    return { data: map, error: null };
  } catch (err) {
    console.error("[callService] Error loading call status:", err);
    return { data: {}, error: err.message || "Unable to retrieve call history." };
  }
};

/**
 * Marks a student as called in Supabase.
 * Derives called_by strictly from current session.
 * Prevents duplicates if already called today.
 */
export const markStudentAsCalled = async ({ studentId, centerId, date, notes = null }) => {
  try {
    const resolvedCenterId = centerId || (await requireCenterId());
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (authErr || !userId) {
      return { error: "Your session has expired. Please log in again." };
    }

    if (!studentId) {
      return { error: "Student identifier is required." };
    }

    // 1. Verify student belongs to center
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("center_id", resolvedCenterId)
      .maybeSingle();

    if (studentErr || !student) {
      return { error: "Student not found in this center." };
    }

    // 2. Check if already marked today
    const { data: existing, error: existErr } = await supabase
      .from("student_call_logs")
      .select("id, student_id, call_date, called_at, called_by")
      .eq("center_id", resolvedCenterId)
      .eq("student_id", studentId)
      .eq("call_date", date)
      .maybeSingle();

    if (!existErr && existing) {
      return { data: existing, alreadyCalled: true, error: null };
    }

    // 3. Insert record into Supabase
    const nowIso = new Date().toISOString();
    const record = {
      center_id: resolvedCenterId,
      student_id: studentId,
      call_date: date,
      called_by: userId,
      called_at: nowIso,
      notes: notes || null,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("student_call_logs")
      .insert(record)
      .select()
      .single();

    if (insertErr) {
      if (isTableMissingError(insertErr)) {
        console.warn(
          "[callService] student_call_logs table not found in Supabase. Falling back to local cache."
        );
        const fallback = {
          id: `local-${Date.now()}`,
          student_id: studentId,
          call_date: date,
          called_by: userId,
          called_at: nowIso,
        };
        // Update local cache
        try {
          const raw = localStorage.getItem(`attendance-called:${resolvedCenterId}:${date}`);
          const cur = raw ? JSON.parse(raw) : {};
          cur[studentId] = fallback;
          localStorage.setItem(`attendance-called:${resolvedCenterId}:${date}`, JSON.stringify(cur));
        } catch {}
        return { data: fallback, error: null };
      }
      return { error: insertErr.message || "Failed to persist call status." };
    }

    // Update local cache
    try {
      const raw = localStorage.getItem(`attendance-called:${resolvedCenterId}:${date}`);
      const cur = raw ? JSON.parse(raw) : {};
      cur[studentId] = inserted;
      localStorage.setItem(`attendance-called:${resolvedCenterId}:${date}`, JSON.stringify(cur));
    } catch {}

    return { data: inserted, error: null };
  } catch (err) {
    console.error("[callService] Error marking student as called:", err);
    return { error: err.message || "Unable to mark student as called." };
  }
};

/**
 * Unmarks a student call log in Supabase.
 */
export const unmarkStudentAsCalled = async ({ studentId, centerId, date }) => {
  try {
    const resolvedCenterId = centerId || (await requireCenterId());

    const { error } = await supabase
      .from("student_call_logs")
      .delete()
      .eq("center_id", resolvedCenterId)
      .eq("student_id", studentId)
      .eq("call_date", date);

    if (error && !isTableMissingError(error)) {
      return { error: error.message || "Failed to unmark student." };
    }

    // Remove from local cache
    try {
      const raw = localStorage.getItem(`attendance-called:${resolvedCenterId}:${date}`);
      if (raw) {
        const cur = JSON.parse(raw);
        delete cur[studentId];
        localStorage.setItem(`attendance-called:${resolvedCenterId}:${date}`, JSON.stringify(cur));
      }
    } catch {}

    return { data: true, error: null };
  } catch (err) {
    console.error("[callService] Error unmarking student call:", err);
    return { error: err.message || "Unable to unmark student." };
  }
};

