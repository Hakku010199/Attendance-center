import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Input from "../components/common/Input.jsx";
import LoadingIcon from "../components/common/LoadingIcon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabase.js";
import { createCenterOnboarding, findUniqueSlug, getCurrentMembership, slugify } from "../services/centerService.js";
import { isGoogleUser, hasUserSetPassword, setUserPassword } from "../services/authService.js";

const STEPS = ["Welcome", "Center Information", "Review", "Success"];

// Spec wizard: Welcome -> Info -> Review -> Creating -> Success.
// Creates centers row, then center_members (owner), then onboarding_completed=true.
export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshCenter, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: user?.email || "", phone: "", address: "" });
  const [errors, setErrors] = useState({});
  const [slugPreview, setSlugPreview] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Google user mandatory password setup modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ password: "", confirm: "" });
  const [pwdErrors, setPwdErrors] = useState({});
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdFormError, setPwdFormError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    if (user?.email) {
      setForm((prev) => ({ ...prev, email: prev.email || user.email }));
      setCurrentUser((prev) => prev || user);
    }
  }, [user]);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!live) return;
      if (!auth?.user) {
        navigate("/login", { replace: true });
        return;
      }
      setCurrentUser(auth.user);

      const { membership } = await getCurrentMembership(auth.user.id);
      if (!live) return;
      if (membership) {
        const { data: c } = await supabase.from("centers").select("*").eq("id", membership.center_id).maybeSingle();
        if (c?.onboarding_completed === true) {
          navigate("/portal", { replace: true });
          return;
        } else if (c) {
          setForm({
            name: c.name || "",
            email: c.email || auth.user.email || "",
            phone: c.phone || "",
            address: c.address || "",
          });
          setStep(1);
        }
      }

      // Check if user authenticated via Google and has not configured a password yet
      const isGoogle = isGoogleUser(auth.user);
      const hasPassword = hasUserSetPassword(auth.user);
      if (isGoogle && !hasPassword) {
        setShowPasswordModal(true);
      } else {
        setShowPasswordModal(false);
      }
    })();
    return () => { live = false; };
  }, [navigate]);


  useEffect(() => {
    let live = true;
    if (!form.name.trim() || step < 1) {
      setSlugPreview("");
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const s = await findUniqueSlug(form.name);
        if (live) setSlugPreview(s);
      } catch {
        if (live) setSlugPreview(slugify(form.name));
      }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [form.name, step]);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
    setFormError("");
  };

  const validateInfo = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Center name is required.";
    if (!form.email.trim()) {
      e.email = "Center email is required.";
    } else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      e.email = "Please enter a valid email address.";
    }
    if (!form.phone.trim()) {
      e.phone = "Mobile number is required.";
    } else if (!/^[+\d\s\-()]{7,18}$/.test(form.phone.trim())) {
      e.phone = "Please enter a valid mobile number.";
    }
    return e;
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setFormError("");
    const r = await createCenterOnboarding(form);
    if (r?.data) {
      await refreshCenter();
      setStep(3);
    } else if (r?.code === "ALREADY_HAS_CENTER") {
      setFormError(r.error);
    } else if (r?.code === "NO_SESSION") {
      navigate("/login", { replace: true });
      return;
    } else {
      setFormError(r?.error || "Unable to create your center. Please try again.");
    }
    setCreating(false);
  };

  const finish = async () => {
    await refreshCenter();
    navigate("/portal", { replace: true });
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pwdForm.password) {
      errs.password = "Password is required.";
    } else if (pwdForm.password.length < 8) {
      errs.password = "Password must be at least 8 characters.";
    }
    if (!pwdForm.confirm) {
      errs.confirm = "Please confirm your password.";
    } else if (pwdForm.confirm !== pwdForm.password) {
      errs.confirm = "Passwords do not match.";
    }
    if (Object.keys(errs).length > 0) {
      setPwdErrors(errs);
      return;
    }

    setPwdSubmitting(true);
    setPwdFormError("");
    const res = await setUserPassword(pwdForm.password);
    setPwdSubmitting(false);

    if (res?.error) {
      setPwdFormError(res.error);
      return;
    }

    if (res.data?.user) {
      setCurrentUser(res.data.user);
    }
    setPwdSuccess("Password set successfully! Continuing to onboarding…");
    setTimeout(() => {
      setShowPasswordModal(false);
    }, 700);
  };

  const handleSignOutFromModal = async () => {
    if (signOut) {
      await signOut();
    } else {
      await supabase.auth.signOut();
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="onboard">
      {showPasswordModal && (
        <div className="onboard-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pwd-modal-title">
          <div className="onboard-modal-card">
            <div className="onboard-modal-badge">
              <Icon name="google" size={16} />
              <span>Google Account Security</span>
            </div>

            <div className="auth-header">
              <h2 id="pwd-modal-title" className="auth-title" style={{ fontSize: "1.45rem" }}>
                Set Account Password
              </h2>
              <p className="auth-subtitle">
                To enable signing in with your email and password in addition to Google, please set your password before continuing with onboarding.
              </p>
            </div>

            {pwdSuccess ? (
              <div className="form-success" role="status">
                <Icon name="check" size={18} />
                <span>{pwdSuccess}</span>
              </div>
            ) : (
              <form noValidate onSubmit={handlePasswordSubmit} className="auth-form">
                <Input
                  id="ob-pwd-email"
                  label="Registered Email"
                  type="email"
                  value={currentUser?.email || user?.email || ""}
                  readOnly
                  disabled
                  icon={<Icon name="mail" size={16} />}
                />

                <Input
                  id="ob-new-pwd"
                  label="New Password *"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={pwdForm.password}
                  onChange={(e) => {
                    setPwdForm({ ...pwdForm, password: e.target.value });
                    setPwdErrors({ ...pwdErrors, password: undefined });
                    setPwdFormError("");
                  }}
                  error={pwdErrors.password}
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
                  required
                />

                <Input
                  id="ob-confirm-pwd"
                  label="Confirm Password *"
                  type={showConfirmPwd ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={pwdForm.confirm}
                  onChange={(e) => {
                    setPwdForm({ ...pwdForm, confirm: e.target.value });
                    setPwdErrors({ ...pwdErrors, confirm: undefined });
                    setPwdFormError("");
                  }}
                  error={pwdErrors.confirm}
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
                  required
                />

                {pwdFormError && (
                  <p className="form-error" role="alert" style={{ marginTop: "4px" }}>
                    {pwdFormError}
                  </p>
                )}

                <div className="onboard-modal-actions">
                  <button
                    type="submit"
                    disabled={pwdSubmitting}
                    className="btn--auth-primary"
                    style={{ width: "100%" }}
                  >
                    {pwdSubmitting ? (
                      "Saving password…"
                    ) : (
                      <>
                        <span>Set Password &amp; Continue</span>
                        <Icon name="arrowRight" size={16} />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOutFromModal}
                    className="btn--signout-subtle"
                  >
                    <Icon name="logout" size={14} />
                    <span>Sign out instead</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div
        className="onboard-card"
        style={showPasswordModal ? { filter: "blur(2px)", pointerEvents: "none", userSelect: "none" } : undefined}
        aria-hidden={showPasswordModal ? "true" : undefined}
      >

        <div className="auth-header">
          <div className="auth-eyebrow">
            {user?.email ? `Signed in as ${user.email}` : "Center setup wizard"}
          </div>
          <h1 className="auth-title">
            {step === 0 && "Let's set up your center"}
            {step === 1 && "Center Information"}
            {step === 2 && "Review your center"}
            {step === 3 && "Center created successfully"}
          </h1>
          <p className="auth-subtitle">
            {step === 0 && "Welcome to Center Portal. Set up your center profile to start managing students and attendance."}
            {step === 1 && "Tell us about your center. Center name, email, and mobile number are required."}
            {step === 2 && "Confirm your center details before creating your organization."}
            {step === 3 && "You are now the owner. Let's open your center dashboard."}
          </p>
        </div>

        <ol className="steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={i === step ? "step step--current" : i < step ? "step step--done" : "step"}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="step-dot">{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
              <span className="step-label">{s}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="onboard-step-content">
            <div className="onboard-actions" style={{ justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn--auth-primary"
                style={{ width: "auto", minWidth: "180px" }}
              >
                <span>Get Started</span>
                <Icon name="arrowRight" size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboard-step-content">
            <div className="form-grid">
              <Input
                id="ob-name"
                label="Center Name *"
                value={form.name}
                onChange={set("name")}
                error={errors.name}
                placeholder="ABC Academy"
                required
              />
              <Input
                id="ob-email"
                label="Center Email *"
                type="email"
                value={form.email}
                onChange={set("email")}
                error={errors.email}
                placeholder="info@abcacademy.com"
                required
              />
              <Input
                id="ob-phone"
                label="Mobile Number *"
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                error={errors.phone}
                placeholder="+91 98765 43210"
                required
              />
              <Input
                id="ob-addr"
                label="Address"
                value={form.address}
                onChange={set("address")}
                placeholder="Street, City"
              />
            </div>

            {slugPreview && (
              <p className="slug-preview-text">
                Your portal web address: <b>{slugPreview}</b>
              </p>
            )}

            <div className="onboard-actions">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="btn--social"
                style={{ padding: "0 20px" }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  const e = validateInfo();
                  if (Object.keys(e).length) return setErrors(e);
                  setStep(2);
                }}
                className="btn--auth-primary"
                style={{ width: "auto", minWidth: "160px" }}
              >
                <span>Continue</span>
                <Icon name="arrowRight" size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && !creating && (
          <div className="onboard-step-content">
            <dl className="review">
              <div><dt>Center Name</dt><dd>{form.name}</dd></div>
              <div><dt>Center Email</dt><dd>{form.email}</dd></div>
              <div><dt>Mobile Number</dt><dd>{form.phone}</dd></div>
              <div><dt>Address</dt><dd>{form.address || "—"}</dd></div>
              <div><dt>Portal Slug</dt><dd><code>{slugPreview || slugify(form.name)}</code></dd></div>
            </dl>

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <div className="onboard-actions">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn--social"
                style={{ padding: "0 20px" }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={create}
                className="btn--auth-primary"
                style={{ width: "auto", minWidth: "180px" }}
              >
                <span>Create Center</span>
                <Icon name="arrowRight" size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && creating && (
          <div className="done" aria-busy="true">
            <LoadingIcon size={100} />
            <h2 style={{ color: "#fff", marginTop: "12px" }}>Creating your center…</h2>
            <p className="auth-subtitle">Please wait. Do not close or refresh this page.</p>
          </div>
        )}

        {step === 3 && (
          <div className="done">
            <span className="done-icon"><Icon name="check" size={32} /></span>
            <h2 style={{ color: "#fff", marginTop: "8px" }}>Your center is ready!</h2>
            <p className="auth-subtitle">All workspace permissions and admin privileges are active.</p>
            <button
              type="button"
              onClick={finish}
              className="btn--auth-primary"
              style={{ width: "auto", minWidth: "200px", marginTop: "16px" }}
            >
              <span>Go to Dashboard</span>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        )}
      </div>

      <p className="auth-legal">
        Center Portal • Organization Onboarding
      </p>
    </div>
  );
}
