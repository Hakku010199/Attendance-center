import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Button from "../components/common/Button.jsx";
import { loginUser, resolvePostLoginDestination } from "../services/authService.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Login() {
  const navigate = useNavigate();
  const { refreshCenter } = useAuth();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => {
    setValues({ ...values, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
    setFormError("");
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!values.email.trim()) e.email = "Email is required.";
    else if (!EMAIL_RE.test(values.email.trim())) e.email = "Please enter a valid email address.";
    if (!values.password) e.password = "Password is required.";
    if (Object.keys(e).length) return setErrors(e);

    setSubmitting(true);
    setFormError("");
    const r = await loginUser({ email: values.email.trim(), password: values.password });
    if (r.error) {
      setSubmitting(false);
      return setFormError(r.error);
    }
    const userId = r.data?.user?.id;
    // Post-login routing: user -> center_members -> centers.
    const dest = await resolvePostLoginDestination(userId);
    await refreshCenter();
    setSubmitting(false);
    if (dest.error) return setFormError(dest.error);
    navigate(dest.destination || "/onboarding", { replace: true });
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="auth-logo">CP</span><div><small>CENTER</small><b>Center Portal</b></div></div>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to access your center dashboard.</p>
        {!isSupabaseConfigured && (
          <p className="form-error" role="alert">
            Supabase is not configured. Create a <code>.env</code> file with{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (or <code>VITE_SUPABASE_ANON_KEY</code>), then restart the dev server.
          </p>
        )}
        <form noValidate onSubmit={submit} className="auth-form">
          <Input id="l-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set("email")} error={errors.email} />
          <Input id="l-pass" label="Password" type="password" autoComplete="current-password" placeholder="Your password" value={values.password} onChange={set("password")} error={errors.password} />
          <div className="auth-row"><span /><Link to="/forgot-password">Forgot Password?</Link></div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <Button type="submit" disabled={submitting} className="btn--block">{submitting ? "Signing in…" : "Sign In"}</Button>
        </form>
        <p className="auth-switch">Don&apos;t have an account? <Link to="/register">Create one</Link></p>
      </div>
    </div>
  );
}
