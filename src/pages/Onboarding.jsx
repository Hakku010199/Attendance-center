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
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [errors, setErrors] = useState({});
  const [slugPreview, setSlugPreview] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

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
        const { data: c } = await supabase.from("centers").select("id, onboarding_completed").eq("id", membership.center_id).maybeSingle();
        if (c?.onboarding_completed === true) navigate("/portal", { replace: true });
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
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Please enter a valid email address.";
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
        <div className="onboard-top">
          <span className="auth-logo">CP</span>
          <span className="muted">{user?.email || "Setting up your center"}</span>
        </div>
        <ol className="steps" aria-label="Setup progress">{STEPS.map((s, i) => (
          <li key={s} className={i === step ? "step step--current" : i < step ? "step step--done" : "step"} aria-current={i === step ? "step" : undefined}>
            <span className="step-dot">{i < step ? <Icon name="check" size={14} /> : i + 1}</span><span className="step-label">{s}</span>
          </li>))}</ol>

        {step === 0 && <><h2>Let&apos;s set up your center.</h2><p className="muted">Welcome to Center Portal. We will create your center, assign you as its owner, and take you to your dashboard.</p>
          <div className="onboard-actions"><span /><Button onClick={() => setStep(1)}>Get Started</Button></div></>}

        {step === 1 && <><h2>Center Information</h2><p className="muted">Tell us about your center. Only the name is required.</p>
          <div className="form-grid">
            <Input id="ob-name" label="Center Name *" value={form.name} onChange={set("name")} error={errors.name} placeholder="ABC Academy" />
            <Input id="ob-email" label="Center Email" type="email" value={form.email} onChange={set("email")} error={errors.email} placeholder="info@abcacademy.com" />
            <Input id="ob-phone" label="Phone" value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
            <Input id="ob-addr" label="Address" value={form.address} onChange={set("address")} placeholder="Street, City" />
          </div>
          {slugPreview && <p className="muted">Your address will be: <b>{slugPreview}</b></p>}
          <div className="onboard-actions">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => { const e = validateInfo(); if (Object.keys(e).length) return setErrors(e); setStep(2); }}>Continue</Button>
          </div></>}

        {step === 2 && !creating && <><h2>Review your center</h2><p className="muted">Confirm the details before we create your center.</p>
          <dl className="review">
            <div><dt>Center Name</dt><dd>{form.name}</dd></div>
            <div><dt>Center Email</dt><dd>{form.email || "—"}</dd></div>
            <div><dt>Phone</dt><dd>{form.phone || "—"}</dd></div>
            <div><dt>Address</dt><dd>{form.address || "—"}</dd></div>
            <div><dt>Generated Slug</dt><dd><code>{slugPreview || slugify(form.name)}</code></dd></div>
          </dl>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="onboard-actions">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={create}>Create Center</Button>
          </div></>}

        {step === 2 && creating && (
          <div className="done" aria-busy="true">
            <div className="spinner" aria-hidden="true" />
            <h2>Creating your center…</h2>
            <p className="muted">Please wait. Do not close or refresh this page.</p>
          </div>)}

        {step === 3 && <div className="done"><span className="done-icon"><Icon name="check" size={28} /></span><h2>Your center has been created successfully.</h2><p className="muted">You are the owner. Let&apos;s open your dashboard.</p>
          <Button onClick={finish}>Go to Dashboard</Button></div>}
      </div>
    </div>
  );
}
