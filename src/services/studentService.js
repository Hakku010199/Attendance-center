// Every query is scoped to the caller's center (auth -> center_members -> center_id).
// Uniqueness rules (student_id, roll-per-division) are enforced WITHIN a center,
// so two different centers can freely reuse the same IDs/names.
import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

const requireCenterId = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error } = await getCurrentMembership(uid);
  if (error) throw new Error(error);
  if (!membership) throw new Error("No center found for this account. Please complete onboarding first.");
  return membership.center_id;
};

const mapRow = (s, divName) => ({
  id: s.id,
  studentId: s.student_id,
  name: s.name,
  rollNumber: s.roll_number,
  divisionId: s.division_id,
  divisionName: divName ?? "Unassigned",
  status: s.status,
  mobile: s.mobile || s.phone || "",
  center_id: s.center_id,
});

export const listStudents = async () => {
  const center_id = await requireCenterId();
  const { data: students, error } = await supabase
    .from("students")
    .select("*")
    .eq("center_id", center_id)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load students. Please try again.");
  const { data: divisions, error: dErr } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("center_id", center_id);
  if (dErr) throw new Error("Unable to load students. Please try again.");
  const names = Object.fromEntries((divisions ?? []).map((d) => [d.id, d.name]));
  return (students ?? []).map((s) => mapRow(s, s.division_id ? names[s.division_id] : "Unassigned"));
};

export const saveStudent = async (v, id) => {
  try {
    const center_id = await requireCenterId();
    const { data: existing, error: fErr } = await supabase
      .from("students")
      .select("id, student_id, roll_number, division_id")
      .eq("center_id", center_id);
    if (fErr) return { error: "Unable to save student. Please try again." };
    const e = {};
    if (!v.studentId?.trim()) e.studentId = "Student ID is required.";
    else if ((existing ?? []).some((s) => s.id !== id && same(s.student_id, v.studentId)))
      e.studentId = "This Student ID is already used.";
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
      student_id: v.studentId.trim(),
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
      if (error) return { error: "Unable to save student. Please try again." };
    } else {
      let { error } = await supabase.from("students").insert({ center_id, ...row });
      if (isMobileMissing(error)) {
        const { mobile, ...rowWithoutMobile } = row;
        const retry = await supabase.from("students").insert({ center_id, ...rowWithoutMobile });
        error = retry.error;
      }
      if (error) return { error: "Unable to create student. Please try again." };
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
