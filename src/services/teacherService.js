import { supabase } from "../lib/supabase.js";
import { getCurrentMembership } from "./centerService.js";
import { notifyTeachersUpdated } from "../utils/events.js";

const requireCenterId = async () => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error } = await getCurrentMembership(uid);
  if (error) throw new Error(error);
  if (!membership) throw new Error("No center found for this account. Please complete onboarding first.");
  return membership.center_id;
};

/**
 * Checks whether an error is due to the 'teachers' table not yet being created in Supabase.
 */
export const isTableMissingError = (err) => {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = err.code || "";
  return (
    code === "42P01" ||
    msg.includes("relation \"public.teachers\" does not exist") ||
    msg.includes("relation \"teachers\" does not exist") ||
    msg.includes("could not find the 'teachers' table")
  );
};

export const isColumnMissingError = (err) => {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = err.code || "";
  return code === "42703" || (msg.includes("does not exist") && msg.includes("division_ids"));
};

export const listTeachers = async () => {
  try {
    const center_id = await requireCenterId();

    let teachers = null;
    const res = await supabase
      .from("teachers")
      .select("id, center_id, user_id, password, name, phone, division_id, division_ids, status, created_at, updated_at")
      .eq("center_id", center_id)
      .order("created_at", { ascending: false });

    if (res.error) {
      if (isTableMissingError(res.error)) {
        return { teachers: [], needsSetup: true };
      }
      if (isColumnMissingError(res.error)) {
        // Fallback without division_ids column if not yet added in Supabase
        const fallback = await supabase
          .from("teachers")
          .select("id, center_id, user_id, password, name, phone, division_id, status, created_at, updated_at")
          .eq("center_id", center_id)
          .order("created_at", { ascending: false });

        if (fallback.error) {
          if (isTableMissingError(fallback.error)) {
            return { teachers: [], needsSetup: true };
          }
          throw new Error(fallback.error.message || "Unable to load teachers.");
        }
        teachers = fallback.data;
      } else {
        throw new Error(res.error.message || "Unable to load teachers. Please try again.");
      }
    } else {
      teachers = res.data;
    }

    // Fetch center divisions to resolve division names
    const { data: divisions } = await supabase
      .from("divisions")
      .select("id, name")
      .eq("center_id", center_id);

    const divMap = {};
    for (const d of divisions || []) {
      divMap[d.id] = d.name;
    }

    const mapped = (teachers || []).map((t) => {
      const divisionIds = Array.isArray(t.division_ids) && t.division_ids.length > 0
        ? t.division_ids
        : (t.division_id ? [t.division_id] : []);

      const assignedDivisions = divisionIds
        .map((id) => ({ id, name: divMap[id] || "Assigned Division" }))
        .filter(Boolean);

      return {
        id: t.id,
        centerId: t.center_id,
        userId: t.user_id,
        password: t.password,
        name: t.name || "",
        phone: t.phone || "",
        divisionId: t.division_id || divisionIds[0] || "",
        divisionIds: divisionIds,
        assignedDivisions: assignedDivisions,
        divisionName: assignedDivisions.length > 0
          ? assignedDivisions.map((d) => d.name).join(", ")
          : "All Divisions",
        status: t.status || "active",
        createdAt: t.created_at ? String(t.created_at).slice(0, 10) : "",
        updatedAt: t.updated_at,
      };
    });

    return { teachers: mapped, needsSetup: false };
  } catch (err) {
    if (isTableMissingError(err)) {
      return { teachers: [], needsSetup: true };
    }
    throw err;
  }
};

export const saveTeacher = async (values, id) => {
  try {
    const center_id = await requireCenterId();
    const errors = {};

    const rawUserId = String(values?.userId ?? "").trim();
    const rawPassword = String(values?.password ?? "").trim();
    const rawName = String(values?.name ?? "").trim();
    
    // Normalize assigned division IDs (array of UUIDs)
    let rawDivisionIds = [];
    if (Array.isArray(values?.divisionIds)) {
      rawDivisionIds = values.divisionIds.filter(Boolean);
    } else if (values?.divisionId) {
      rawDivisionIds = [values.divisionId];
    }
    const primaryDivisionId = rawDivisionIds[0] || null;
    const rawStatus = values?.status === "inactive" ? "inactive" : "active";

    if (!rawUserId) {
      errors.userId = "User ID / Username is required.";
    } else if (rawUserId.length < 3) {
      errors.userId = "User ID must be at least 3 characters.";
    }

    if (!id && !rawPassword) {
      errors.password = "Password is required for new teacher.";
    } else if (rawPassword && rawPassword.length < 4) {
      errors.password = "Password must be at least 4 characters.";
    }

    if (Object.keys(errors).length > 0) {
      return { errors };
    }

    // Duplicate User ID check: scoped strictly to the current center
    let checkQuery = supabase
      .from("teachers")
      .select("id")
      .eq("center_id", center_id)
      .ilike("user_id", rawUserId);

    if (id) {
      checkQuery = checkQuery.neq("id", id);
    }

    const { data: existing, error: checkErr } = await checkQuery;
    if (checkErr) {
      if (isTableMissingError(checkErr)) {
        return { error: "Teachers table has not been created in Supabase yet. Please run the SQL migration." };
      }
    }

    if (existing && existing.length > 0) {
      return {
        errors: {
          userId: `A teacher with User ID "${rawUserId}" already exists in your center.`,
        },
      };
    }

    const payload = {
      center_id,
      user_id: rawUserId,
      name: rawName || null,
      division_id: primaryDivisionId,
      division_ids: rawDivisionIds,
      status: rawStatus,
      updated_at: new Date().toISOString(),
    };

    if (rawPassword) {
      payload.password = rawPassword;
    }

    if (id) {
      // Update teacher
      let { data, error } = await supabase
        .from("teachers")
        .update(payload)
        .eq("id", id)
        .eq("center_id", center_id)
        .select()
        .single();

      if (error && isColumnMissingError(error)) {
        // Fallback without division_ids if column not yet added
        delete payload.division_ids;
        const retry = await supabase
          .from("teachers")
          .update(payload)
          .eq("id", id)
          .eq("center_id", center_id)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (isTableMissingError(error)) {
          return { error: "Teachers table has not been created in Supabase yet. Please run the SQL migration." };
        }
        return { error: error.message || "Failed to update teacher." };
      }

      notifyTeachersUpdated();
      return { teacher: data };
    } else {
      // Create teacher
      payload.created_at = new Date().toISOString();
      let { data, error } = await supabase
        .from("teachers")
        .insert(payload)
        .select()
        .single();

      if (error && isColumnMissingError(error)) {
        // Fallback without division_ids if column not yet added
        delete payload.division_ids;
        const retry = await supabase
          .from("teachers")
          .insert(payload)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (isTableMissingError(error)) {
          return { error: "Teachers table has not been created in Supabase yet. Please run the SQL migration." };
        }
        return { error: error.message || "Failed to create teacher." };
      }

      notifyTeachersUpdated();
      return { teacher: data };
    }
  } catch (err) {
    return { error: err.message || "An unexpected error occurred while saving teacher." };
  }
};

export const deleteTeacher = async (id) => {
  try {
    const center_id = await requireCenterId();
    const { error } = await supabase
      .from("teachers")
      .delete()
      .eq("id", id)
      .eq("center_id", center_id);

    if (error) {
      return { error: error.message || "Unable to delete teacher." };
    }

    notifyTeachersUpdated();
    return { ok: true };
  } catch (err) {
    return { error: err.message || "Unable to delete teacher." };
  }
};

