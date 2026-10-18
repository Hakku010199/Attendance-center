import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Icon from "../components/common/Icon.jsx";
import { updatePassword } from "../services/authService.js";
import { supabase } from "../lib/supabase.js";
import { LoadingScreen } from "../components/auth/RouteGuards.jsx";

// /reset-password — opened from the RollBeeCall password recovery email.
// Correct lifecycle:
// 1. Checks for error params (e.g., otp_expired).
// 2. Exchanges PKCE code if ?code= is present.
// 3. Verifies active session or waits for PASSWORD_RECOVERY event.
// 4. Opens the password reset modal with New Password and Confirm Password.
// 5. On submit, updates the password, signs out the recovery session, and redirects to login with confirmation.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    let live = true;
    let settled = false;

    const markReady = () => {
      if (!live || settled) return;
      settled = true;
      setReady(true);
      setLinkError("");
    };

    const markBad = (msg) => {
      if (!live || settled) return;
      settled = true;
      setLinkError(msg || "This password reset link is invalid or has expired. Please request a new one.");
    };

    const checkRecovery = async () => {
      // 1. Check for explicit error parameters in hash or search
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const searchParams = new URLSearchParams(window.location.search);
      const err = searchParams.get("error") || hashParams.get("error");
      const errDesc = searchParams.get("error_description") || hashParams.get("error_description");
      const errCode = searchParams.get("error_code") || hashParams.get("error_code");

      if (err || errDesc) {
        const isExpired = errCode === "otp_expired" || errDesc?.toLowerCase().includes("expired");
        markBad(isExpired ? "This password reset link has expired. Please request a new one." : (errDesc || "This password reset link is invalid. Please request a new one."));
        return;
      }

      // 2. PKCE code exchange if ?code= is present in the URL
      const code = searchParams.get("code");
      if (code) {
        try {
          const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!live) return;
          if (exchangeErr) {
            markBad(exchangeErr.message || "Unable to verify password reset code. Please request a new one.");
            return;
          }
          if (data?.session) {
            markReady();
            return;
          }
        } catch (e) {
          if (!live) return;
          markBad(e?.message || "Failed to exchange reset code. Please request a new one.");
          return;
        }
      }

      // 3. Check existing session (implicit flow or established session)
      const { data } = await supabase.auth.getSession();
      if (!live) return;
      if (data?.session) {
        markReady();
        return;
      }
    };

    checkRecovery();

    // 4. Listen for auth state change events
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live || settled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        markReady();
      }
    });

    // 5. Fallback timer: only mark invalid if no session arrives within 5 seconds
    const t = setTimeout(async () => {
      if (!live || settled) return;
      const { data } = await supabase.auth.getSession();
      if (!live || settled) return;
      if (data?.session) {
        markReady();
      } else {
        markBad("This password reset link is invalid or has expired. Please request a new one.");
      }
    }, 5000);

    return () => {
      live = false;
      clearTimeout(t);
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const set = (k) => (e) => {
    setValues({ ...values, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
    setFormError("");
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!values.password) e.password = "Password is required.";
    else if (values.password.length < 8) e.password = "Password must be at least 8 characters.";
    if (!values.confirm) e.confirm = "Please confirm your new password.";
    else if (values.confirm !== values.password) e.confirm = "Passwords do not match.";
    if (Object.keys(e).length) return setErrors(e);

    setSubmitting(true);
    setFormError("");
    const r = await updatePassword(values.password);
    setSubmitting(false);
    if (r?.error) return setFormError(r.error);

    setSuccess("Your password has been updated successfully. Redirecting to sign in…");

    // Clean up temporary recovery session and navigate to login
    try {
      await supabase.auth.signOut();
    } catch {}

    setTimeout(() => {
      navigate("/login", {
        replace: true,
        state: { success: "Password reset successful! Please sign in with your new password." },
      });
    }, 1600);
  };

  if (linkError) {
    return (
      <div className="auth-wrap">
        <div className="auth-card" role="alertdialog" aria-modal="true" aria-labelledby="link-err-title">
          <div className="auth-header">
            <div className="auth-eyebrow">rollbeecall.online</div>
            <h1 id="link-err-title" className="auth-title">Link expired or invalid</h1>
            <p className="auth-subtitle">This password reset link is invalid or has expired.</p>
          </div>
          <p className="form-error" role="alert">{linkError}</p>
          <p className="auth-switch">
            <Link to="/forgot-password" className="auth-highlight-link">
              Request a new reset link
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingScreen />;

  return (
    <div className="auth-wrap">
      <div className="auth-card" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="auth-header">
          <div className="auth-eyebrow">rollbeecall.online</div>
          <h1 id="reset-title" className="auth-title">Set new password</h1>
          <p className="auth-subtitle">Enter and confirm your new password below</p>
        </div>

        {success ? (
          <div className="notice notice--success" role="status">
            <p>{success}</p>
            <Link to="/login" className="btn--auth-primary" style={{ textDecoration: "none" }}>
              <span>Go to Sign In</span>
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="auth-form">
            <Input
              id="np-pass"
              label="New Password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={values.password}
              onChange={set("password")}
              error={errors.password}
              icon={<Icon name="lock" size={16} />}
              rightSlot={
                <button
                  type="button"
                  className="pwd-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </button>
              }
            />

            <Input
              id="np-confirm"
              label="Confirm New Password"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your new password"
              value={values.confirm}
              onChange={set("confirm")}
              error={errors.confirm}
              icon={<Icon name="lock" size={16} />}
              rightSlot={
                <button
                  type="button"
                  className="pwd-toggle-btn"
                  onClick={() => setShowConfirm(!showConfirm)}
                  title={showConfirm ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <Icon name={showConfirm ? "eyeOff" : "eye"} size={16} />
                </button>
              }
            />

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <button type="submit" disabled={submitting} className="btn--auth-primary">
              {submitting ? "Updating…" : (
                <>
                  <span>Update Password</span>
                  <Icon name="arrowRight" size={16} />
                </>
              )}
            </button>
          </form>
        )}

        <p className="auth-switch">
          Remember your password ?{" "}
          <Link to="/login" className="auth-highlight-link">
            Sign in
          </Link>
        </p>
      </div>

      <p className="auth-legal">
        rollbeecall.online • Secure Authentication
      </p>
    </div>
  );
}
