import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { friendlyAuthError, resolvePostLoginDestination } from "../services/authService.js";
import { LoadingScreen } from "../components/auth/RouteGuards.jsx";

// /auth/callback — landing page for Supabase OAuth redirects and email confirmation links.
// Waits for Supabase to finish processing the exchange code or session
// before routing to the center portal or onboarding.
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;

    const route = async (userId) => {
      const dest = await resolvePostLoginDestination(userId);
      if (!live) return;
      if (dest.error) {
        setError(dest.error);
        return;
      }
      navigate(dest.destination || "/onboarding", { replace: true });
    };

    const finish = async () => {
      // Check for OAuth error params in query or hash (e.g. user cancelled Google consent)
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const errCode = searchParams.get("error") || hashParams.get("error");
      const errDesc = searchParams.get("error_description") || hashParams.get("error_description");
      if (errCode || errDesc) {
        const rawMsg = errDesc || errCode || "Authentication failed.";
        setError(friendlyAuthError({ message: rawMsg }, "Google authentication was cancelled or failed. Please try again."));
        return;
      }

      // Supabase JS v2 handles PKCE code exchange inside getSession().
      const { data, error: sessErr } = await supabase.auth.getSession();
      if (!live) return;
      if (sessErr) {
        setError(friendlyAuthError(sessErr, "Authentication link is invalid or expired. Please try again."));
        return;
      }
      if (data?.session?.user) {
        route(data.session.user.id);
        return;
      }
      // No session yet (e.g. email confirmation without auto sign-in): send to login.
      navigate("/login", { replace: true });
    };

    finish();

    // PASSWORD_RECOVERY fires when a recovery link establishes its session.
    // SIGNED_IN fires when OAuth or magic link establishes its session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session?.user) {
        route(session.user.id);
      }
    });

    return () => {
      live = false;
      sub?.subscription?.unsubscribe();
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-brand"><span className="auth-logo">CP</span><div><small>CENTER</small><b>Center Portal</b></div></div>
          <h2>Authentication issue</h2>
          <p className="form-error" role="alert">{error}</p>
          <p className="auth-switch"><a href="/login">Back to Login</a></p>
        </div>
      </div>
    );
  }

  return <LoadingScreen />;
}
