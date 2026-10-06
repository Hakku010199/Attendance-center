// Central email configuration for Center Portal.
//
// Supabase Auth owns ALL tokens, sessions, and confirmation/recovery URLs.
// Resend ONLY delivers the messages Supabase Auth generates (via Custom SMTP),
// plus this optional dev-only test endpoint.
//
// Sender logic (no code changes needed when you get a domain):
//   - Set RESEND_FROM_EMAIL in your server environment (Vercel env vars / .env.local).
//     Example later: RESEND_FROM_EMAIL="Center Portal <noreply@mydomain.com>"
//   - Without a custom domain, leave it UNSET to use Resend's test sender:
//     "Center Portal <onboarding@resend.dev>"
//     LIMITATION: resend.dev can ONLY send to the email address you used to
//     sign up for Resend. Every other recipient will be rejected by Resend.
//
// NEVER expose RESEND_API_KEY to the browser (no VITE_ prefix, ever).
export const RESEND_FROM_ENV_KEY = "RESEND_FROM_EMAIL";
export const RESEND_API_ENV_KEY = "RESEND_API_KEY";

const getEnv = (key) => {
  try {
    if (typeof process !== "undefined" && process.env && process.env[key]) return process.env[key];
  } catch {
    /* ignore */
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) return import.meta.env[key];
  } catch {
    /* ignore */
  }
  return "";
};

// Resolves the sender at runtime. Test sender is the default so the app
// works before a custom domain is verified.
export const getResendFrom = () => getEnv(RESEND_FROM_ENV_KEY) || "Center Portal <onboarding@resend.dev>";

export const isTestSender = (from = getResendFrom()) => String(from).includes("onboarding@resend.dev");
