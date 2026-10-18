import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import { loginUser, resolvePostLoginDestination, signInWithGoogle } from "../services/authService.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { useAuth } from "../context/AuthContext.jsx";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshCenter } = useAuth();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(() => location.state?.error || "");
  const [successMsg, setSuccessMsg] = useState(() => location.state?.success || "");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const set = (k) => (e) => {
    setValues({ ...values, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
    setFormError("");
    setSuccessMsg("");
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
    if (dest.error) {
      await refreshCenter();
      setSubmitting(false);
      return setFormError(dest.error);
    }
    await refreshCenter();
    setSubmitting(false);
    navigate(dest.destination || "/onboarding", { replace: true });
  };

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-eyebrow">Welcome back</div>
          <h1 className="auth-title">Sign in to your account</h1>
          <p className="auth-subtitle">Enter your credentials to continue</p>
        </div>

        {!isSupabaseConfigured && (
          <p className="form-error" role="alert">
            Supabase is not configured. Create a <code>.env</code> file with{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev server.
          </p>
        )}

        {successMsg && (
          <div
            className="form-success"
            role="status"
            style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}
          >
            <Icon name="checkCircle" size={18} />
            <span>{successMsg}</span>
          </div>
        )}

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
            id="l-email"
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
            id="l-pass"
            label="Password"
            labelRight={
              <Link to="/forgot-password" className="auth-forgot-link">
                Forgot password?
              </Link>
            }
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
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

          <label className="auth-remember-row">
            <input
              type="checkbox"
              className="auth-checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me for 30 days</span>
          </label>

          {formError && (
            <div
              className={formError.toLowerCase().includes("inactive") ? "form-warning" : "form-error"}
              role="alert"
            >
              {formError.toLowerCase().includes("inactive") && (
                <Icon name="alert" size={18} />
              )}
              <span>
                {formError.includes("8139041877") ? (
                  <>
                    Center is inactive connect{" "}
                    <a
                      href="tel:8139041877"
                      style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}
                    >
                      8139041877
                    </a>
                    .
                  </>
                ) : (
                  formError
                )}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || googleLoading}
            className="btn--auth-primary"
          >
            {submitting ? "Signing in…" : (
              <>
                <span>Sign in</span>
                <Icon name="arrowRight" size={16} />
              </>
            )}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account ?{" "}
          <Link to="/register" className="auth-highlight-link">
            Create new account
          </Link>
        </p>
      </div>

      <p className="auth-legal">
        By signing in, you agree to our Terms and Privacy Policy
      </p>
    </div>
  );
}
