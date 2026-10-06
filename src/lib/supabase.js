import { createClient } from "@supabase/supabase-js";

const sanitize = (val) => {
  if (!val || typeof val !== "string") return "";
  return val.trim().replace(/^['"]|['"]$/g, "").trim();
};

// Vite requires direct static property access (`import.meta.env.VITE_*`)
// to replace environment variables at transform time.
const rawUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof import.meta !== "undefined" && import.meta.env?.SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
  "";

const rawKey =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_ANON_KEY) ||
  "";

const supabaseUrl = sanitize(rawUrl);
const supabaseKey = sanitize(rawKey);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("placeholder") &&
    !supabaseKey.includes("placeholder") &&
    !supabaseUrl.includes("your-project-ref") &&
    !supabaseKey.includes("your-publishable-anon-key")
);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] Supabase is not configured. " +
      "URL detected: " +
      Boolean(supabaseUrl) +
      ", Key detected: " +
      Boolean(supabaseKey) +
      ". Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) are set in .env, then restart your Vite dev server."
  );
}

// Single shared Supabase client. Never create another client elsewhere.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-publishable-key"
);
