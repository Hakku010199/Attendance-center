import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/common/Button.jsx";
import Input from "../components/common/Input.jsx";
import { useToast } from "../components/common/Toast.jsx";
import { usePortal } from "../components/layout/AppLayout.jsx";
import { updateCenter } from "../services/centerService.js";
import { updatePassword, isGoogleUser, hasUserSetPassword } from "../services/authService.js";
import { useTheme } from "../context/ThemeContext.jsx";
import Icon from "../components/common/Icon.jsx";

export default function Settings() {
  const { center, user, authUser, membership, reload, signOut } = usePortal();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [v, setV] = useState({ name: center.name ?? "", email: center.email ?? "", phone: center.phone ?? "", address: center.address ?? "" });
  const [errors, setErrors] = useState({}); const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); setFormError(""); };

  const isGoogle = isGoogleUser(authUser);
  const [passwordConfigured, setPasswordConfigured] = useState(() => hasUserSetPassword(authUser));
  const [pwd, setPwd] = useState({ password: "", confirm: "" });
  const [pwdErrors, setPwdErrors] = useState({});
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdFormError, setPwdFormError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError("");
    const r = await updateCenter(v); setSaving(false);
    if (r.errors) return setErrors(r.errors);
    if (r.error) return setFormError(r.error);
    reload(); toast("Center information saved.");
  };


  const handleSavePassword = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pwd.password) errs.password = "Password is required.";
    else if (pwd.password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (!pwd.confirm) errs.confirm = "Please confirm your password.";
    else if (pwd.confirm !== pwd.password) errs.confirm = "Passwords do not match.";
    if (Object.keys(errs).length > 0) return setPwdErrors(errs);

    setPwdSaving(true);
    setPwdFormError("");
    setPwdSuccess("");
    const res = await updatePassword(pwd.password);
    setPwdSaving(false);
    if (res?.error) {
      setPwdFormError(res.error);
      return;
    }
    setPasswordConfigured(true);
    setPwdSuccess("Password saved successfully. You can now log in using either Google or your email and password.");
    setPwd({ password: "", confirm: "" });
    toast("Password saved successfully.");
  };

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };


  return (
    <>
      <div className="page-actions" style={{ justifyContent: "flex-end", marginBottom: "16px" }}>
        <Button variant="secondary" onClick={logout}>Sign Out</Button>
      </div>
      <form noValidate onSubmit={save} className="card form"><h3>Center Information</h3>
        <div className="form-grid">
          <Input id="c-name" label="Center Name" value={v.name} onChange={set("name")} error={errors.name} />
          <Input id="c-email" label="Center Email" type="email" value={v.email} onChange={set("email")} error={errors.email} />
          <Input id="c-phone" label="Phone" value={v.phone} onChange={set("phone")} />
          <Input id="c-addr" label="Address" value={v.address} onChange={set("address")} />
        </div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button></div>
      </form>

      <section className="card form">
        <h3>Appearance</h3>
        <p className="muted" style={{ marginTop: "-8px", marginBottom: "8px" }}>
          Choose your interface color theme.
        </p>
        <div className="theme-switcher-grid">
          <button
            type="button"
            className={`theme-card-btn ${theme === "dark" ? "theme-card-btn--active" : ""}`}
            onClick={() => setTheme("dark")}
          >
            <div className="theme-card-preview theme-card-preview--dark">
              <div className="preview-nav" />
              <div className="preview-body">
                <div className="preview-line" />
                <div className="preview-tile" />
              </div>
            </div>
            <div className="theme-card-text">
              <div className="theme-card-title">
                <Icon name="moon" size={16} />
                <span>Dark Theme</span>
              </div>
              <small>Default dark palette</small>
            </div>
            {theme === "dark" && <span className="theme-check-badge"><Icon name="check" size={14} /></span>}
          </button>

          <button
            type="button"
            className={`theme-card-btn ${theme === "light" ? "theme-card-btn--active" : ""}`}
            onClick={() => setTheme("light")}
          >
            <div className="theme-card-preview theme-card-preview--light">
              <div className="preview-nav" />
              <div className="preview-body">
                <div className="preview-line" />
                <div className="preview-tile" />
              </div>
            </div>
            <div className="theme-card-text">
              <div className="theme-card-title">
                <Icon name="sun" size={16} />
                <span>White Background</span>
              </div>
              <small>Clean white workspace</small>
            </div>
            {theme === "light" && <span className="theme-check-badge"><Icon name="check" size={14} /></span>}
          </button>
        </div>
      </section>

      <section className="card form"><h3>Account Settings</h3>
        <div className="form-grid">
          <Input id="u-name" label="User Name" value={user.name} readOnly /><Input id="u-email" label="Email" value={user.email} readOnly />
          <Input id="u-role" label="Role" value={user.role} readOnly />
        </div>
        <p className="muted">Membership role: <b>{membership?.role ?? "owner"}</b> · Center slug: <code>{center.slug}</code></p>
      </section>
      <section className="card form">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <h3 style={{ margin: 0 }}>Security</h3>
          {isGoogle && (
            <span className="auth-provider-tag">
              <Icon name="google" size={14} />
              <span>Signed in with Google</span>
            </span>
          )}
        </div>

        <div style={{ marginTop: "12px" }}>
          <p className="muted" style={{ margin: "0 0 12px 0" }}>
            {passwordConfigured
              ? (isGoogle
                  ? "Your account has a password configured. You can sign in using Google or your email and password."
                  : "Change your account password below.")
              : "Enable email and password sign-in by setting an account password."}
          </p>

          {!showPasswordSetup && (
            <Button
              type="button"
              variant={passwordConfigured ? "secondary" : "primary"}
              onClick={() => setShowPasswordSetup(true)}
            >
              {passwordConfigured ? "Change Account Password" : "Set Account Password"}
            </Button>
          )}

          {showPasswordSetup && (
            <form noValidate onSubmit={handleSavePassword} style={{ marginTop: "16px", maxWidth: "420px" }}>
              {pwdSuccess && (
                <div className="form-success" role="status" style={{ marginBottom: "12px" }}>
                  <Icon name="check" size={16} />
                  <span>{pwdSuccess}</span>
                </div>
              )}
              <div className="form-grid" style={{ gridTemplateColumns: "1fr", gap: "12px" }}>
                <Input
                  id="set-pwd"
                  label="New Password"
                  type={showPwd ? "text" : "password"}
                  value={pwd.password}
                  onChange={(e) => {
                    setPwd({ ...pwd, password: e.target.value });
                    setPwdErrors({ ...pwdErrors, password: undefined });
                    setPwdFormError("");
                  }}
                  error={pwdErrors.password}
                  placeholder="At least 8 characters"
                  icon={<Icon name="lock" size={16} />}
                  rightSlot={
                    <button
                      type="button"
                      className="pwd-toggle-btn"
                      onClick={() => setShowPwd(!showPwd)}
                      title={showPwd ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      <Icon name={showPwd ? "eyeOff" : "eye"} size={16} />
                    </button>
                  }
                />

                <Input
                  id="set-confirm"
                  label="Confirm Password"
                  type={showConfirmPwd ? "text" : "password"}
                  value={pwd.confirm}
                  onChange={(e) => {
                    setPwd({ ...pwd, confirm: e.target.value });
                    setPwdErrors({ ...pwdErrors, confirm: undefined });
                    setPwdFormError("");
                  }}
                  error={pwdErrors.confirm}
                  placeholder="Re-enter password"
                  icon={<Icon name="lock" size={16} />}
                  rightSlot={
                    <button
                      type="button"
                      className="pwd-toggle-btn"
                      onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                      title={showConfirmPwd ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      <Icon name={showConfirmPwd ? "eyeOff" : "eye"} size={16} />
                    </button>
                  }
                />
              </div>

              {pwdFormError && <p className="form-error" role="alert" style={{ marginTop: "8px" }}>{pwdFormError}</p>}

              <div className="page-actions" style={{ marginTop: "14px", display: "flex", gap: "8px" }}>
                <Button type="submit" disabled={pwdSaving}>
                  {pwdSaving ? "Saving..." : passwordConfigured ? "Update Password" : "Save Password"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowPasswordSetup(false);
                    setPwdErrors({});
                    setPwdFormError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
