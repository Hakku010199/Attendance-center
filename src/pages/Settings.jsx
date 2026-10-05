import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/common/PageHeader.jsx";
import Button from "../components/common/Button.jsx";
import Input from "../components/common/Input.jsx";
import { useToast } from "../components/common/Toast.jsx";
import { usePortal } from "../components/layout/AppLayout.jsx";
import { updateCenter } from "../services/centerService.js";
import { sendPasswordReset } from "../services/authService.js";

export default function Settings() {
  const { center, user, authUser, membership, reload, signOut } = usePortal();
  const toast = useToast();
  const navigate = useNavigate();
  const [v, setV] = useState({ name: center.name ?? "", email: center.email ?? "", phone: center.phone ?? "", address: center.address ?? "" });
  const [errors, setErrors] = useState({}); const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); setFormError(""); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError("");
    const r = await updateCenter(v); setSaving(false);
    if (r.errors) return setErrors(r.errors);
    if (r.error) return setFormError(r.error);
    reload(); toast("Center information saved.");
  };

  const resetPassword = async () => {
    const r = await sendPasswordReset(authUser?.email || user.email);
    if (r.error) toast(r.error, "error");
    else toast("Password reset link sent. Check your inbox.");
  };

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <PageHeader title="Settings" text="Manage your center and account.">
        <Button variant="secondary" onClick={logout}>Sign Out</Button>
      </PageHeader>
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
      <section className="card form"><h3>Account Settings</h3>
        <div className="form-grid">
          <Input id="u-name" label="User Name" value={user.name} readOnly /><Input id="u-email" label="Email" value={user.email} readOnly />
          <Input id="u-role" label="Role" value={user.role} readOnly />
        </div>
        <p className="muted">Membership role: <b>{membership?.role ?? "owner"}</b> · Center slug: <code>{center.slug}</code></p>
      </section>
      <section className="card form"><h3>Security</h3>
        <div className="page-actions"><Button variant="secondary" onClick={resetPassword}>Send Password Reset Email</Button></div>
      </section>
    </>
  );
}
