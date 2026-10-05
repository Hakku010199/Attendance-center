import { useState } from "react";
import { Link } from "react-router-dom";
import Input from "../components/common/Input.jsx";
import Button from "../components/common/Button.jsx";
import { sendPasswordReset } from "../services/authService.js";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!email.trim()) return setError("Email is required.");
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    setError("");
    setSending(true);
    setFormError("");
    const r = await sendPasswordReset(email.trim());
    setSending(false);
    if (r.error) return setFormError(r.error);
    setSuccess("If an account exists for this email, a password reset link has been sent. Please check your inbox.");
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="auth-logo">CP</span><div><small>CENTER</small><b>Center Portal</b></div></div>
        <h2>Reset your password</h2>
        <p className="muted">Enter your account email and we will send you a secure reset link.</p>
        {success ? (
          <div className="notice notice--success" role="status"><p>{success}</p><Link to="/login" className="btn btn--primary btn--md">Back to Login</Link></div>
        ) : (
          <form noValidate onSubmit={submit} className="auth-form">
            <Input id="f-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} error={error} />
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <Button type="submit" disabled={sending} className="btn--block">{sending ? "Sending…" : "Send Reset Link"}</Button>
          </form>
        )}
        <p className="auth-switch"><Link to="/login">Back to Login</Link></p>
      </div>
    </div>
  );
}
