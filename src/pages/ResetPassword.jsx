import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Button from "../components/common/Button.jsx";
import { updatePassword } from "../services/authService.js";
import { supabase } from "../lib/supabase.js";
import { LoadingScreen } from "../components/auth/RouteGuards.jsx";

// /reset-password — opened from the Supabase recovery email.
// Correct lifecycle: wait for Supabase to process the recovery URL
// (INITIAL_SESSION empty -> PASSWORD_RECOVERY event -> session ready)
// BEFORE declaring the link invalid. Only then allow updateUser().
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let live = true;
    let settled = false;

    const markReady = () => {
      if (!live || settled) return;
      settled = true;
      setReady(true);
    };
    const markBad = () => {
      if (!live || settled) return;
      settled = true;
      setLinkError("This password reset link is invalid or has expired. Please request a new one.");
    };

    // Case 1: session already present (page refresh during recovery keeps it).
    supabase.auth.getSession().then(({ data }) => {
      if (!live || settled) return;
      if (data?.session) markReady();
    });

    // Case 2: recovery event arrives after Supabase parses the URL hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live || settled) return;
      if (event === "PASSWORD_RECOVERY") markReady();
      else if (event === "SIGNED_IN" && session) markReady();
    });

    // Case 3: give Supabase time, then decide. Only show invalid AFTER waiting.
    const t = setTimeout(() => {
      if (settled) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!live || settled) return;
        if (data?.session) markReady();
        else markBad();
      });
    }, 2500);

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
    if (r.error) return setFormError(r.error);
    setSuccess("Your password has been updated successfully. You can now sign in with your new password.");
    setTimeout(() => navigate("/login", { replace: true }), 2000);
  };

  if (linkError) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-brand"><span className="auth-logo">CP</span><div><small>CENTER</small><b>Center Portal</b></div></div>
          <h2>Reset link expired</h2>
          <p className="form-error" role="alert">{linkError}</p>
          <p className="auth-switch"><Link to="/forgot-password">Request a new reset link</Link></p>
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingScreen />;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="auth-logo">CP</span><div><small>CENTER</small><b>Center Portal</b></div></div>
        <h2>Set a new password</h2>
        <p className="muted">Enter your new password below.</p>
        {success ? (
          <div className="notice notice--success" role="status">
            <p>{success}</p>
            <Link to="/login" className="btn btn--primary btn--md">Go to Login</Link>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="auth-form">
            <Input id="np-pass" label="New Password" type="password" autoComplete="new-password" placeholder="Minimum 8 characters" value={values.password} onChange={set("password")} error={errors.password} />
            <Input id="np-confirm" label="Confirm New Password" type="password" autoComplete="new-password" placeholder="Repeat your new password" value={values.confirm} onChange={set("confirm")} error={errors.confirm} />
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <Button type="submit" disabled={submitting} className="btn--block">{submitting ? "Updating…" : "Update Password"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
