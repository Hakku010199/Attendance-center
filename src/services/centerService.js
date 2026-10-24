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
    const { data: sData } = await supabase.auth.getSession();
    id = sData?.session?.user?.id;
    if (!id) {
      const { data } = await supabase.auth.getUser();
      id = data?.user?.id;
    }
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

export const getNextCenterNumber = async () => {
  try {
    const { data, error } = await supabase
      .from("centers")
      .select("center_number")
      .not("center_number", "is", null)
      .order("center_number", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0 && typeof data[0].center_number === "number") {
      return Math.max(data[0].center_number + 1, 101);
    }

    const { count, error: cErr } = await supabase
      .from("centers")
      .select("id", { count: "exact", head: true });

    if (!cErr && typeof count === "number" && count > 0) {
      return 100 + count + 1;
    }
  } catch (err) {
    console.warn("[centerService] getNextCenterNumber error:", err);
  }
  return 101;
};

export const getCurrentCenter = async (userId) => {
  const { membership, error } = await getCurrentMembership(userId);
  if (error) return { center: null, membership: null, error };
  if (!membership) return { center: null, membership: null, error: null };
  const { data, error: cErr } = await supabase.from("centers").select("*").eq("id", membership.center_id).maybeSingle();
  if (cErr) return { center: null, membership, error: "Unable to load your center. Please try again." };

  let center = data ?? null;

  // Auto-backfill center_number if missing
  if (center && (center.center_number === null || center.center_number === undefined)) {
    try {
      const nextNum = await getNextCenterNumber();
      const { data: updated, error: uErr } = await supabase
        .from("centers")
        .update({ center_number: nextNum })
        .eq("id", center.id)
        .select()
        .single();
      if (!uErr && updated) {
        center = updated;
      }
    } catch (e) {
      console.warn("[centerService] auto-assign center_number skipped:", e);
    }
  }

  return { center, membership, error: null };
};

export const getCurrentUserCenter = async (userId) => getCurrentCenter(userId);

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

export const updateFacultyTimeSettings = async ({
  enabled,
  startTime,
  endTime,
  timezone,
}) => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { error: "Your session has expired. Please log in again." };
  const { membership, error: mErr } = await getCurrentMembership(uid);
  if (mErr) return { error: mErr };
  if (!membership) return { error: "No center found for this account. Please complete onboarding first." };

  const payload = {
    faculty_time_restriction_enabled: Boolean(enabled),
    faculty_start_time: startTime ? `${startTime}:00`.slice(0, 8) : "07:00:00",
    faculty_end_time: endTime ? `${endTime}:00`.slice(0, 8) : "10:00:00",
    timezone: timezone || "Asia/Kolkata",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("centers")
    .update(payload)
    .eq("id", membership.center_id)
    .select()
    .single();

  if (error) {
    console.error("[centerService] updateFacultyTimeSettings error:", error);
    return { error: error?.message || "Unable to save faculty access time settings. Please try again." };
  }

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
    // If onboarding is incomplete, resume and complete it with the updated details
    if (ec && ec.onboarding_completed !== true) {
      if (!name?.trim()) return { error: "Center name is required.", code: "VALIDATION" };
      if (!email?.trim()) return { error: "Center email is required.", code: "VALIDATION" };
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return { error: "Enter a valid email address.", code: "VALIDATION" };
      if (!phone?.trim()) return { error: "Mobile number is required.", code: "VALIDATION" };
      const { data: updated, error: uErr } = await supabase
        .from("centers")
        .update({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address?.trim() || null,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ec.id)
        .select()
        .single();
      if (uErr) return { error: "Unable to complete onboarding. Please try again." };
      return { data: updated };
    }
    return { error: "This account already has a center. You cannot create a second one.", code: "ALREADY_HAS_CENTER", membership: checked.membership, center: ec ?? null };
  }
  if (!name?.trim()) return { error: "Center name is required.", code: "VALIDATION" };
  if (!email?.trim()) return { error: "Center email is required.", code: "VALIDATION" };
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return { error: "Enter a valid email address.", code: "VALIDATION" };
  if (!phone?.trim()) return { error: "Mobile number is required.", code: "VALIDATION" };
  let slug;
  try {
    slug = await findUniqueSlug(name);
  } catch {
    return { error: "Unable to generate a unique center address. Please try again." };
  }

  // Pre-generate the center UUID upfront to avoid RLS chicken-and-egg:
  // PostgreSQL cannot evaluate SELECT policies for returning rows until the user
  // is recorded in center_members.
  const centerId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : (
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })
  );

  const nextCenterNo = await getNextCenterNumber();

  const fullPayload = {
    id: centerId,
    name: name.trim(),
    slug,
    email: email.trim(),
    phone: phone.trim(),
    address: address?.trim() || null,
    status: "active",
    onboarding_completed: false,
    center_number: nextCenterNo,
  };

  // 1. Insert center (without requiring .select() before membership exists)
  let { error: cErr } = await supabase.from("centers").insert(fullPayload);

  // If table lacks newer columns (e.g. email/phone/status), fallback to core columns
  if (cErr && (cErr.message?.includes("column") || cErr.code === "42703")) {
    console.warn("[centerService] Retrying center insert with core columns:", cErr.message);
    const corePayload = { id: centerId, name: name.trim(), slug };
    const retry = await supabase.from("centers").insert(corePayload);
    cErr = retry.error;
  }

  if (cErr) {
    console.error("[centerService] Failed to insert center:", cErr);
    const m = String(cErr.message || "").toLowerCase();
    if (m.includes("duplicate") || cErr.code === "23505") {
      return { error: "That center name or slug is already taken. Please try a different name." };
    }
    if (m.includes("row-level security") || m.includes("policy")) {
      return { error: "Database permission error: check Supabase RLS policies for centers table." };
    }
    return { error: cErr.message ? `Unable to create center: ${cErr.message}` : "Unable to create your center. Please check your Supabase connection and try again." };
  }

  // 2. Insert owner membership in center_members
  const { error: memErr } = await supabase
    .from("center_members")
    .insert({ user_id: authedUser.id, center_id: centerId, role: "owner" });

  if (memErr) {
    console.error("[centerService] Failed to insert center membership:", memErr);
    // Cleanup orphaned center record if membership failed
    try { await supabase.from("centers").delete().eq("id", centerId); } catch {}
    const m = String(memErr.message || "").toLowerCase();
    if (m.includes("duplicate") || memErr.code === "23505") {
      return { error: "This account already has a center membership.", code: "ALREADY_HAS_CENTER" };
    }
    return { error: `Center was created, but membership failed: ${memErr.message || "Please try again."}` };
  }

  // 3. Now that membership exists, mark onboarding_completed: true
  try {
    await supabase
      .from("centers")
      .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq("id", centerId);
  } catch (err) {
    console.warn("[centerService] Could not update onboarding_completed flag:", err);
  }

  return {
    data: {
      id: centerId,
      name: name.trim(),
      slug,
      email: email.trim(),
      phone: phone.trim(),
      address: address?.trim() || null,
      center_number: nextCenterNo,
      onboarding_completed: true,
    },
  };
};
