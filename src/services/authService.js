// Supabase Auth is the source of truth. No localStorage auth, no custom passwords,
// no custom users table. All functions below are thin wrappers around supabase.auth.
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";

export const SUPABASE_NOT_CONFIGURED_MSG =
  "Supabase is not configured. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the dev server.";

const friendlyAuthError = (error, fallback) => {
  const fb = fallback || "Unable to sign in. Please try again.";
  if (!error) return fb;
  const msg = (error.message || "").toLowerCase();
  const code = String(error.code || "").toLowerCase();
  // Network / config failures: surface them instead of hiding behind a generic message.
  if (msg.includes("failed to fetch") || msg.includes("fetch failed") || msg.includes("network") || error.name === "TypeError")
    return "Cannot reach Supabase. Check your internet connection and VITE_SUPABASE_URL, then try again.";
  if (msg.includes("placeholder") || msg.includes("invalid api key") || msg.includes("api key") || code.includes("api"))
    return "Supabase credentials are invalid. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env file.";
  if (msg.includes("invalid login credentials") || msg.includes("invalid email or password"))
    return "Invalid email or password.";
  if (msg.includes("email not confirmed") || msg.includes("email is not verified") || msg.includes("not confirmed"))
    return "Email is not verified. Please check your inbox for the verification link.";
  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already exists") || msg.includes("duplicate"))
    return "An account with this email already exists. Try signing in instead.";
  if (msg.includes("password should be") || msg.includes("password must be") || msg.includes("weak password"))
    return "Password does not meet requirements. Use at least 8 characters.";
  if (msg.includes("signups not allowed") || msg.includes("signup is disabled"))
    return "New registrations are disabled for this project. Enable email signups in Supabase Auth settings.";
  if (msg.includes("email rate limit") || msg.includes("rate limit") || msg.includes("too many"))
    return "Too many attempts. Please wait a minute and try again.";
  if (code === "email_address_invalid" || msg.includes('email address "') || (msg.includes("email address") && msg.includes("is invalid")))
    return "Supabase rejected this email address. Check Auth → Settings in your Supabase dashboard: allowed email domains / disposable-email blocking may be enabled. Try a different email or update those settings.";
  // Last resort: include the real reason (dev) so failures are debuggable.
  const detail = (error.message || "").trim();
  return detail && import.meta.env.DEV ? `${fb} (${detail})` : fb;
};

export const registerUser = async ({ email, password }) => {
  if (!isSupabaseConfigured) return { error: SUPABASE_NOT_CONFIGURED_MSG };
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendlyAuthError(error, "Unable to create your account. Please try again."), raw: error };
    return { data };
  } catch (e) {
    return { error: friendlyAuthError(e, "Unable to create your account. Please try again."), raw: e };
  }
};

// Returns { session } when Supabase establishes one, { needsVerification: true } otherwise.
export const loginUser = async ({ email, password }) => {
  if (!isSupabaseConfigured) return { error: SUPABASE_NOT_CONFIGURED_MSG };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlyAuthError(error), raw: error };
    return { data };
  } catch (e) {
    return { error: friendlyAuthError(e), raw: e };
  }
};

export const logoutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) return { error: "Unable to sign out. Please try again." };
  return { data: true };
};

export const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, error };
  return { user: data?.user ?? null, error: null };
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { session: null, error };
  return { session: data?.session ?? null, error: null };
};

export const sendPasswordReset = async (email, redirectTo) => {
  if (!isSupabaseConfigured) return { error: SUPABASE_NOT_CONFIGURED_MSG };
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || `${window.location.origin}/login`,
    });
    if (error) return { error: friendlyAuthError(error, "Unable to send reset email. Please check the address and try again."), raw: error };
    return { data };
  } catch (e) {
    return { error: friendlyAuthError(e, "Unable to send reset email. Please check the address and try again."), raw: e };
  }
};

// Resolves the post-login destination for an authenticated user:
// "onboarding" when no membership/center or onboarding incomplete, else "portal".
export const resolvePostLoginDestination = async (userId) => {
  if (!userId) return { destination: "/login" };
  const { data: membership, error: mErr } = await supabase
    .from("center_members")
    .select("id, center_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (mErr) return { error: "Unable to load your center. Please try again.", destination: null };
  if (!membership) return { destination: "/onboarding" };
  const { data: center, error: cErr } = await supabase
    .from("centers")
    .select("id, onboarding_completed")
    .eq("id", membership.center_id)
    .maybeSingle();
  if (cErr) return { error: "Unable to load your center. Please try again.", destination: null };
  if (!center || center.onboarding_completed !== true) return { destination: "/onboarding" };
  return { destination: "/portal" };
};

export { friendlyAuthError };
