import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Button from "../components/common/Button.jsx";
import { registerUser } from "../services/authService.js";
import { isSupabaseConfigured } from "../lib/supabase.js";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Register() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => {
    setValues({ ...values, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
    setFormError("");
  };

  const validate = () => {
    const e = {};
    if (!values.email.trim()) e.email = "Email is required.";
    else if (!EMAIL_RE.test(values.email.trim())) e.email = "Please enter a valid email address.";
    if (!values.password) e.password = "Password is required.";
    else if (values.password.length < 8) e.password = "Password must be at least 8 characters.";
    if (!values.confirm) e.confirm = "Please confirm your password.";
    else if (values.confirm !== values.password) e.confirm = "Passwords do not match.";
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) return setErrors(e);
    setSubmitting(true);
    setFormError("");
    const r = await registerUser({ email: values.email.trim(), password: values.password });
    setSubmitting(false);
    if (r.error) return setFormError(r.error);
    // Supabase may or may not create a session immediately (email confirmation setting).
    if (r.data?.session) {
      navigate("/login", { replace: true });
    } else {
      setSuccess("Registration successful. Please check your email to verify your account.");
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="auth-logo">CP</span><div><small>CENTER</small><b>Center Portal</b></div></div>
        <h2>Create your account</h2>
        <p className="muted">Register with your email to get started. You will set up your center after signing in.</p>
        {!isSupabaseConfigured && (
          <p className="form-error" role="alert">
            Supabase is not configured. Create a <code>.env</code> file with{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (or <code>VITE_SUPABASE_ANON_KEY</code>), then restart the dev server.
          </p>
        )}
        {success ? (
          <div className="notice notice--success" role="status">
            <p>{success}</p>
            <Button onClick={() => navigate("/login")}>Go to Login</Button>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="auth-form">
            <Input id="r-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set("email")} error={errors.email} />
            <Input id="r-pass" label="Password" type="password" autoComplete="new-password" placeholder="Minimum 8 characters" value={values.password} onChange={set("password")} error={errors.password} />
            <Input id="r-confirm" label="Confirm Password" type="password" autoComplete="new-password" placeholder="Repeat your password" value={values.confirm} onChange={set("confirm")} error={errors.confirm} />
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <Button type="submit" disabled={submitting} className="btn--block">{submitting ? "Creating account…" : "Create Account"}</Button>
          </form>
        )}
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
