import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { registerUser, resolvePostLoginDestination, signInWithGoogle } from "../services/authService.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Register() {
  const navigate = useNavigate();
  const { refreshCenter } = useAuth();
  const [values, setValues] = useState({ email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const set = (k) => (e) => {
    setValues({ ...values, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
    setFormError("");
  };

  const handleGoogleSignIn = async () => {
    setFormError("");
    setGoogleLoading(true);
    const r = await signInWithGoogle();
    if (r?.error) {
      setGoogleLoading(false);
      setFormError(r.error);
    }
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

    // If a session exists immediately (confirmation email disabled), route directly to portal
    if (r.data?.session) {
      const userId = r.data.session.user?.id;
      const dest = await resolvePostLoginDestination(userId);
      await refreshCenter();
      navigate(dest.destination || "/onboarding", { replace: true });
    } else {
      setSuccess("Account created successfully! You can now sign in with your email and password.");
    }
  };

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-eyebrow">Get started</div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Enter your credentials to continue</p>
        </div>

        {!isSupabaseConfigured && (
          <p className="form-error" role="alert">
            Supabase is not configured. Create a <code>.env</code> file with{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev server.
          </p>
        )}

        {success ? (
          <div className="notice notice--success" role="status">
            <p>{success}</p>
            <button type="button" onClick={() => navigate("/login")} className="btn--auth-primary">
              <span>Go to Login</span>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="auth-social-row">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={submitting || googleLoading}
                className="btn--social"
              >
                <Icon name="google" size={18} />
                <span>{googleLoading ? "Connecting…" : "Google"}</span>
              </button>
            </div>

            <div className="auth-divider"><span>OR</span></div>

            <form noValidate onSubmit={submit} className="auth-form">
              <Input
                id="r-email"
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="abc@example.com"
                value={values.email}
                onChange={set("email")}
                error={errors.email}
                icon={<Icon name="mail" size={16} />}
              />

              <Input
                id="r-pass"
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••••••••••"
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
                id="r-confirm"
                label="Confirm Password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••••••••••"
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

              <button
                type="submit"
                disabled={submitting || googleLoading}
                className="btn--auth-primary"
              >
                {submitting ? "Creating account…" : (
                  <>
                    <span>Create account</span>
                    <Icon name="arrowRight" size={16} />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        <p className="auth-switch">
          Already have an account ?{" "}
          <Link to="/login" className="auth-highlight-link">
            Sign in
          </Link>
        </p>
      </div>

      <p className="auth-legal">
        By signing up, you agree to our Terms and Privacy Policy
      </p>
    </div>
  );
}
