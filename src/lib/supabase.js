import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    !String(supabaseUrl).includes("placeholder") &&
    !String(supabaseKey).includes("placeholder") &&
    !String(supabaseUrl).includes("your-project-ref")
);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] Missing or placeholder VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Create a `.env` file from `.env.example` and restart `npm run dev`. Auth/database calls will fail until configured."
  );
}

// Single shared Supabase client. Never create another client elsewhere.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-publishable-key"
);
