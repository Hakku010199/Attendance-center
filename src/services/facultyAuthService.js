import { supabase } from "../lib/supabase.js";
import { checkFacultyAccessTime } from "../utils/timeSettings.js";

export const FACULTY_SESSION_KEY = "rbc_faculty_session";

/**
 * Retrieves the currently active faculty session from localStorage.
 */
export const getFacultySession = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FACULTY_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session?.teacher?.id && session?.center?.id) {
      // Validate expiration (2 weeks if rememberMe was selected, 1 day otherwise)
      if (session.expiresAt && Date.now() > session.expiresAt) {
        localStorage.removeItem(FACULTY_SESSION_KEY);
        return null;
      }
      return session;
    }
  } catch (e) {
    console.warn("[facultyAuth] Failed to parse faculty session:", e);
  }
  return null;
};

/**
 * Checks if a faculty teacher session is currently authenticated.
 */
export const isFacultyAuthenticated = () => {
  return Boolean(getFacultySession());
};

/**
 * Clears the active faculty session.
 */
export const logoutFaculty = () => {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(FACULTY_SESSION_KEY);
    } catch {}
  }
};

/**
 * Logs in a teacher using Center Number, User ID, and Password.
 * Disambiguates teachers across centers so different centers can freely have teachers with the same username.
 * @param {Object} params
 * @param {string|number} params.centerNo - Unique center natural number starting from 101
 * @param {string} params.userId - Teacher username / User ID
 * @param {string} params.password - Teacher account password
 * @param {boolean} [params.rememberMe=true] - If true, persists session for 2 weeks until manual logout
 */
export const loginFaculty = async ({ centerNo, userId, password, rememberMe = true }) => {
  try {
    const trimmedCenterNo = String(centerNo ?? "").trim();
    const trimmedUserId = String(userId ?? "").trim();
    const trimmedPassword = String(password ?? "").trim();

    if (!trimmedCenterNo) {
      return { error: "Center No is required." };
    }
    if (!trimmedUserId) {
      return { error: "User ID / Username is required." };
    }
    if (!trimmedPassword) {
      return { error: "Password is required." };
    }

    // 1. Resolve Center by center_number (e.g. 101, 102, ...)
    const centerNum = parseInt(trimmedCenterNo, 10);
    let centerData = null;

    if (!isNaN(centerNum)) {
      const { data: byNum, error: numErr } = await supabase
        .from("centers")
        .select("*")
        .eq("center_number", centerNum)
        .maybeSingle();

      if (!numErr && byNum) {
        centerData = byNum;
      }
    }

    // Fallback: check by slug or name if not found by center_number
    if (!centerData) {
      const { data: bySlug } = await supabase
        .from("centers")
        .select("*")
        .or(`slug.eq.${trimmedCenterNo},name.ilike.${trimmedCenterNo}`)
        .limit(1)
        .maybeSingle();

      if (bySlug) centerData = bySlug;
    }

    if (!centerData) {
      return {
        error: `Center No. "${trimmedCenterNo}" could not be found. Please contact your center administrator.`,
      };
    }

    if (centerData.status === "inactive") {
      return { error: "Your center is currently inactive. Please contact center administration." };
    }

    // 2. Enforce Faculty Access Time window if restrictions are enabled
    const timeCheck = checkFacultyAccessTime(centerData);
    if (!timeCheck.allowed) {
      return {
        error: timeCheck.message,
        code: timeCheck.reason === "before" ? "TIME_BEFORE_START" : "TIME_AFTER_END",
      };
    }

    // 3. Query teachers table strictly scoped to this center
    let teacher = null;
    const primaryRes = await supabase
      .from("teachers")
      .select("id, center_id, user_id, password, name, phone, division_id, division_ids, status")
      .eq("center_id", centerData.id)
      .ilike("user_id", trimmedUserId);

    if (primaryRes.error) {
      if (
        primaryRes.error.code === "42703" ||
        String(primaryRes.error.message || "").includes("division_ids")
      ) {
        // Fallback: column division_ids doesn't exist yet
        const fallback = await supabase
          .from("teachers")
          .select("id, center_id, user_id, password, name, phone, division_id, status")
          .eq("center_id", centerData.id)
          .ilike("user_id", trimmedUserId);
        if (fallback.error) {
          console.error("[facultyAuth] teachers query error:", fallback.error);
          return { error: "Unable to verify credentials. Please try again." };
        }
        const rows = fallback.data || [];
        teacher = rows.find((t) => String(t.password ?? "").trim() === trimmedPassword) || null;
      } else {
        console.error("[facultyAuth] teachers query error:", primaryRes.error);
        return { error: "Unable to verify credentials. Please try again." };
      }
    } else {
      const rows = primaryRes.data || [];
      if (rows.length === 0) {
        return {
          error: `No teacher with User ID "${trimmedUserId}" exists in Center No. ${centerData.center_number || trimmedCenterNo}.`,
        };
      }
      teacher = rows.find((t) => String(t.password ?? "").trim() === trimmedPassword) || null;
    }

    if (!teacher) {
      return { error: "Incorrect password. Please check your credentials." };
    }

    if (teacher.status === "inactive") {
      return {
        error: "Your teacher account is inactive. Please contact your center administrator.",
      };
    }

    // 3. Resolve assigned division IDs
    let divisionIds = [];
    if (Array.isArray(teacher.division_ids) && teacher.division_ids.length > 0) {
      divisionIds = teacher.division_ids;
    } else if (teacher.division_id) {
      divisionIds = [teacher.division_id];
    }

    // 2 weeks = 14 * 24 * 60 * 60 * 1000 ms
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
    const expiresAt = rememberMe ? Date.now() + TWO_WEEKS_MS : Date.now() + 24 * 60 * 60 * 1000;

    const sessionPayload = {
      teacher: {
        id: teacher.id,
        userId: teacher.user_id,
        name: teacher.name || teacher.user_id,
        phone: teacher.phone || "",
        divisionId: teacher.division_id || divisionIds[0] || null,
        divisionIds: divisionIds,
        centerId: teacher.center_id,
      },
      center: {
        id: centerData.id,
        name: centerData.name,
        slug: centerData.slug,
        centerNumber: centerData.center_number,
        email: centerData.email,
        phone: centerData.phone,
        status: centerData.status,
        faculty_time_restriction_enabled: Boolean(centerData.faculty_time_restriction_enabled),
        faculty_start_time: centerData.faculty_start_time || "07:00:00",
        faculty_end_time: centerData.faculty_end_time || "10:00:00",
        timezone: centerData.timezone || "Asia/Kolkata",
      },
      rememberMe: Boolean(rememberMe),
      expiresAt,
      loginTime: new Date().toISOString(),
    };

    localStorage.setItem(FACULTY_SESSION_KEY, JSON.stringify(sessionPayload));

    return {
      success: true,
      teacher: sessionPayload.teacher,
      center: sessionPayload.center,
    };
  } catch (err) {
    console.error("[facultyAuth] unexpected error:", err);
    return { error: err.message || "An unexpected error occurred during faculty sign in." };
  }
};

