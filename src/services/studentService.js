// Every query is scoped to the caller's center (auth -> center_members -> center_id).
// Uniqueness rules (student_id, roll-per-division) are enforced WITHIN a center,
// so two different centers can freely reuse the same IDs/names.
import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";
import { getFacultySession } from "./facultyAuthService.js";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

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

const mapRow = (s, divName, idx) => ({
  id: s.id,
  studentId: s.student_id,
  studentNo: idx !== undefined ? idx + 1 : s.student_id,
  name: s.name,
  rollNumber: s.roll_number,
  divisionId: s.division_id,
  divisionName: divName ?? "Unassigned",
  status: s.status ?? "active",
  mobile: s.mobile || s.phone || "",
  center_id: s.center_id,
});

export const listStudents = async () => {
  const center_id = await requireCenterId();
  const { data: auth } = await supabase.auth.getUser();
  const isCenterAdmin = Boolean(auth?.user?.id);

  let query = supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id);

  // If faculty session (teacher), strictly restrict to teacher's assigned divisions
  if (!isCenterAdmin) {
    const faculty = getFacultySession();
    const assignedIds = faculty?.teacher?.divisionIds || (faculty?.teacher?.divisionId ? [faculty.teacher.divisionId] : []);
    if (assignedIds.length > 0) {
      query = query.in("division_id", assignedIds);
    }
  }

  const { data: students, error } = await query.order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load students. Please try again.");
  const { data: divisions, error: dErr } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("center_id", center_id);
  if (dErr) throw new Error("Unable to load students. Please try again.");
  const names = Object.fromEntries((divisions ?? []).map((d) => [d.id, d.name]));
  return (students ?? []).map((s, idx) => mapRow(s, s.division_id ? names[s.division_id] : "Unassigned", idx));
};

export const saveStudent = async (v, id) => {
  try {
    const center_id = await requireCenterId();
    const { data: existing, error: fErr } = await supabase
      .from("students")
      .select("id, student_id, roll_number, division_id")
      .eq("center_id", center_id);
    if (fErr) return { error: "Unable to save student. Please try again." };

    // Auto-derive sequential student number if not explicitly specified
    let studentId = (v.studentId || v.studentNo ? String(v.studentId || v.studentNo).trim() : "");
    if (!id) {
      if (!studentId || (existing ?? []).some((s) => same(s.student_id, studentId))) {
        let maxNum = 0;
        for (const s of existing ?? []) {
          const num = parseInt(s.student_id, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
        let candidateNum = Math.max(maxNum + 1, (existing ?? []).length + 1);
        while ((existing ?? []).some((s) => same(s.student_id, String(candidateNum)))) {
          candidateNum++;
        }
        studentId = String(candidateNum);
      }
    } else if (id && !studentId) {
      const cur = (existing ?? []).find((s) => s.id === id);
      studentId = cur?.student_id || "1";
    }

    const e = {};
    if (!studentId) e.studentId = "Student number is required.";
    else if ((existing ?? []).some((s) => s.id !== id && same(s.student_id, studentId)))
      e.studentId = "This student number is already used.";
    if (!v.name?.trim()) e.name = "Student name is required.";
    if (!/^\d+$/.test(String(v.rollNumber ?? "").trim())) e.rollNumber = "Roll number must be a number.";
    if (!v.divisionId) e.divisionId = "Division is required.";
    if (!e.rollNumber && v.divisionId && (existing ?? []).some((s) => s.id !== id && s.division_id === v.divisionId && String(s.roll_number) === String(Number(v.rollNumber))))
      e.rollNumber = "Roll number already used in this division.";
    if (Object.keys(e).length) return { errors: e };
    // Ensure the division belongs to this center.
    if (v.divisionId) {
      const { data: div, error: dErr } = await supabase
        .from("divisions")
        .select("id")
        .eq("id", v.divisionId)
        .eq("center_id", center_id)
        .maybeSingle();
      if (dErr || !div) return { errors: { divisionId: "Division is required." } };
    }
    const row = {
      student_id: String(studentId).trim(),
      name: v.name.trim(),
      roll_number: Number(v.rollNumber),
      division_id: v.divisionId,
      status: v.status ?? "active",
      ...(v.mobile?.trim() ? { mobile: v.mobile.trim() } : {}),
    };
    const isMobileMissing = (err) => {
      if (!err) return false;
      const msg = String(err.message || "").toLowerCase();
      return (
        msg.includes("mobile") &&
        (msg.includes("schema cache") ||
          msg.includes("does not exist") ||
          msg.includes("could not find") ||
          err.code === "PGRST204" ||
          err.code === "42703")
      );
    };

    if (id) {
      let { error } = await supabase.from("students").update(row).eq("id", id).eq("center_id", center_id);
      if (isMobileMissing(error)) {
        const { mobile, ...rowWithoutMobile } = row;
        const retry = await supabase.from("students").update(rowWithoutMobile).eq("id", id).eq("center_id", center_id);
        error = retry.error;
      }
      if (error) {
        if (error.code === "23505") {
          return { error: "A student with this number or roll number already exists." };
        }
        return { error: error.message || "Unable to save student. Please try again." };
      }
    } else {
      let { error } = await supabase.from("students").insert({ center_id, ...row });
      if (isMobileMissing(error)) {
        const { mobile, ...rowWithoutMobile } = row;
        const retry = await supabase.from("students").insert({ center_id, ...rowWithoutMobile });
        error = retry.error;
      }
      if (error) {
        if (error.code === "23505") {
          return { error: "A student with this number already exists in this center." };
        }
        return { error: error.message || "Unable to create student. Please try again." };
      }
    }
    return { data: true };
  } catch (err) {
    return { error: err?.message || "Unable to save student. Please try again." };
  }
};

export const deleteStudent = async (id) => {
  try {
    const center_id = await requireCenterId();
    // Remove this student's attendance records first (scoped to this center).
    await supabase.from("attendance_records").delete().eq("student_id", id).eq("center_id", center_id);
    const { error } = await supabase.from("students").delete().eq("id", id).eq("center_id", center_id);
    if (error) return { error: "Unable to delete student. Please try again." };
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to delete student. Please try again." };
  }
};
