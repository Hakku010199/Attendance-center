// Every query is scoped to the caller's center:
// auth user -> center_members -> center_id -> WHERE center_id = ...
// This keeps one center's data invisible to every other center and is
// compatible with future RLS policies on auth.uid() -> center_members.
import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";
import { notifyDivisionsUpdated } from "../utils/events.js";

const mapRow = (d) => ({
  id: d.id,
  name: d.name,
  status: d.status,
  createdAt: d.created_at ? String(d.created_at).slice(0, 10) : "",
  updatedAt: d.updated_at,
  center_id: d.center_id,
});

const requireCenterId = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error } = await getCurrentMembership(uid);
  if (error) throw new Error(error);
  if (!membership) throw new Error("No center found for this account. Please complete onboarding first.");
  return membership.center_id;
};

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export const listDivisions = async () => {
  const center_id = await requireCenterId();
  const { data: divisions, error } = await supabase
    .from("divisions")
    .select("id, center_id, name, status, created_at, updated_at")
    .eq("center_id", center_id)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load divisions. Please try again.");
  const { data: students, error: sErr } = await supabase
    .from("students")
    .select("id, division_id")
    .eq("center_id", center_id);
  if (sErr) throw new Error("Unable to load divisions. Please try again.");
  const counts = {};
  for (const s of students ?? []) {
    if (s.division_id) counts[s.division_id] = (counts[s.division_id] ?? 0) + 1;
  }
  return (divisions ?? []).map((d) => ({ ...mapRow(d), studentCount: counts[d.id] ?? 0 }));
};

export const saveDivision = async (v, id) => {
  try {
    const center_id = await requireCenterId();
    const errors = {};
    if (!v.name?.trim()) errors.name = "Division name is required.";
    if (Object.keys(errors).length) return { errors };
    // Name must be unique WITHIN this center only — another center may reuse it.
    const { data: existing, error: fErr } = await supabase
      .from("divisions")
      .select("id, name")
      .eq("center_id", center_id);
    if (fErr) return { error: "Unable to save division. Please try again." };
    if ((existing ?? []).some((d) => d.id !== id && same(d.name, v.name)))
      return { errors: { name: "A division with this name already exists." } };
    if (id) {
      const { error } = await supabase
        .from("divisions")
        .update({ name: v.name.trim(), status: v.status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("center_id", center_id);
      if (error) return { error: "Unable to save division. Please try again." };
    } else {
      const { error } = await supabase
        .from("divisions")
        .insert({ center_id, name: v.name.trim(), status: v.status ?? "active" });
      if (error) return { error: "Unable to create division. Please try again." };
    }
    notifyDivisionsUpdated();
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to save division. Please try again." };
  }
};

export const deleteDivision = async (id) => {
  try {
    const center_id = await requireCenterId();
    const { data: kids, error: kErr } = await supabase
      .from("students")
      .select("id")
      .eq("center_id", center_id)
      .eq("division_id", id)
      .limit(1);
    if (kErr) return { error: "Unable to delete division. Please try again." };
    if ((kids ?? []).length > 0)
      return { error: "This division contains students. Reassign or remove them first." };
    const { error } = await supabase.from("divisions").delete().eq("id", id).eq("center_id", center_id);
    if (error) return { error: "Unable to delete division. Please try again." };
    notifyDivisionsUpdated();
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to delete division. Please try again." };
  }
};

