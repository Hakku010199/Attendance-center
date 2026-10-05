import { useState } from "react";
import Input from "../common/Input.jsx";
import Select from "../common/Select.jsx";
import Button from "../common/Button.jsx";

const STATUS = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];

// onSave(values) resolves to { errors? }. Validation rules live in the service layer.
export default function DivisionForm({ initial, onSave, onCancel }) {
  const [v, setV] = useState({ name: initial?.name ?? "", status: initial?.status ?? "active" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); };
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    const r = await onSave(v); setSaving(false);
    if (r?.errors) setErrors(r.errors);
  };
  return (
    <form noValidate onSubmit={submit} className="form">
      <Input id="div-name" label="Division Name" placeholder="Division A" value={v.name} onChange={set("name")} error={errors.name} autoFocus />
      <Select id="div-status" label="Status" options={STATUS} value={v.status} onChange={set("status")} />
      <div className="modal-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : initial ? "Save Changes" : "Create Division"}</Button></div>
    </form>
  );
}
