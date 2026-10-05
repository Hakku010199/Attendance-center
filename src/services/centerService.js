// Center identity ALWAYS comes from: auth user -> center_members -> centers.
// Never from URL params, localStorage, form fields, or hardcoded IDs.
import { supabase } from "../lib/supabase.js";

export const slugify = (name = "") =>
  String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export const findUniqueSlug = async (baseName) => {
  const base = slugify(baseName) || "center";
  let candidate = base;
  let n = 1;
  for (;;) {
    const { data, error } = await supabase.from("centers").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
};

export const getCurrentMembership = async (userId) => {
  let id = userId;
  if (!id) {
    const { data } = await supabase.auth.getUser();
    id = data?.user?.id;
  }
  if (!id) return { membership: null, error: "Your session has expired. Please log in again." };
  const { data, error } = await supabase
    .from("center_members")
    .select("id, user_id, center_id, role, created_at")
    .eq("user_id", id)
    .maybeSingle();
  if (error) return { membership: null, error: "Unable to load your center membership. Please try again." };
  return { membership: data ?? null, error: null };
};

export const getCurrentCenter = async (userId) => {
  const { membership, error } = await getCurrentMembership(userId);
  if (error) return { center: null, membership: null, error };
  if (!membership) return { center: null, membership: null, error: null };
  const { data, error: cErr } = await supabase.from("centers").select("*").eq("id", membership.center_id).maybeSingle();
  if (cErr) return { center: null, membership, error: "Unable to load your center. Please try again." };
  return { center: data ?? null, membership, error: null };
};

export const getCurrentUserCenter = async () => getCurrentCenter();

export const updateCenter = async (values) => {
  const errors = {};
  if (!values?.name?.trim()) errors.name = "Center name is required.";
  if (values?.email && !/^\S+@\S+\.\S+$/.test(values.email)) errors.email = "Enter a valid email.";
  if (Object.keys(errors).length) return { errors };
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { error: "Your session has expired. Please log in again." };
  const { membership, error: mErr } = await getCurrentMembership(uid);
  if (mErr) return { error: mErr };
  if (!membership) return { error: "No center found for this account. Please complete onboarding first." };
  const { data, error } = await supabase
    .from("centers")
    .update({
      name: values.name.trim(),
      email: values.email?.trim() || null,
      phone: values.phone?.trim() || null,
      address: values.address?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", membership.center_id)
    .select()
    .single();
  if (error) return { error: "Unable to save center information. Please try again." };
  return { data };
};

// Full onboarding transaction: require auth, block 2nd center,
// insert center, insert owner membership, mark onboarding complete.
export const createCenterOnboarding = async ({ name, email, phone, address }) => {
  const { data: auth } = await supabase.auth.getUser();
  const authedUser = auth?.user;
  if (!authedUser) return { error: "Your session has expired. Please log in again.", code: "NO_SESSION" };
  const checked = await getCurrentMembership(authedUser.id);
  if (checked.error) return { error: checked.error };
  if (checked.membership) {
    const { data: ec } = await supabase.from("centers").select("*").eq("id", checked.membership.center_id).maybeSingle();
    return { error: "This account already has a center. You cannot create a second one.", code: "ALREADY_HAS_CENTER", membership: checked.membership, center: ec ?? null };
  }
  if (!name?.trim()) return { error: "Center name is required.", code: "VALIDATION" };
  let slug;
  try {
    slug = await findUniqueSlug(name);
  } catch {
    return { error: "Unable to create your center right now. Please try again." };
  }
  const { data: created, error: cErr } = await supabase
    .from("centers")
    .insert({ name: name.trim(), slug, email: email?.trim() || null, phone: phone?.trim() || null, address: address?.trim() || null, status: "active", onboarding_completed: false })
    .select()
    .single();
  if (cErr) {
    const m = String(cErr.message || "").toLowerCase();
    if (m.includes("duplicate") || cErr.code === "23505") return { error: "That center name is already taken. Please try a different name." };
    return { error: "Unable to create your center. Please try again." };
  }
  const { error: memErr } = await supabase.from("center_members").insert({ user_id: authedUser.id, center_id: created.id, role: "owner" });
  if (memErr) {
    await supabase.from("centers").delete().eq("id", created.id);
    const m = String(memErr.message || "").toLowerCase();
    if (m.includes("duplicate") || memErr.code === "23505") return { error: "This account already has a center. You cannot create a second one.", code: "ALREADY_HAS_CENTER" };
    return { error: "Center was created but membership failed. Please try again." };
  }
  const { data: completed, error: doneErr } = await supabase
    .from("centers")
    .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
    .eq("id", created.id)
    .select()
    .single();
  if (doneErr) return { error: "Center created, but onboarding could not be completed. Please open onboarding again.", center: created };
  return { data: completed };
};
