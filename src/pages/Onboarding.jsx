import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Input from "../components/common/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabase.js";
import { createCenterOnboarding, findUniqueSlug, getCurrentMembership, slugify } from "../services/centerService.js";

const STEPS = ["Welcome", "Center Information", "Review", "Success"];

// Spec wizard: Welcome -> Info -> Review -> Creating -> Success.
// Creates centers row, then center_members (owner), then onboarding_completed=true.
export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshCenter } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: user?.email || "", phone: "", address: "" });
  const [errors, setErrors] = useState({});
  const [slugPreview, setSlugPreview] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (user?.email) {
      setForm((prev) => ({ ...prev, email: prev.email || user.email }));
    }
  }, [user?.email]);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!live) return;
      if (!auth?.user) {
        navigate("/login", { replace: true });
        return;
      }
      const { membership } = await getCurrentMembership(auth.user.id);
      if (!live) return;
      if (membership) {
        const { data: c } = await supabase.from("centers").select("*").eq("id", membership.center_id).maybeSingle();
        if (c?.onboarding_completed === true) {
          navigate("/portal", { replace: true });
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

  return (
    <div className="onboard">
      <div className="onboard-card">
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
            <div className="spinner" aria-hidden="true" />
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
