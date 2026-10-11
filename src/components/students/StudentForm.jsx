import { useState } from "react";
import Input from "../common/Input.jsx";
import Select from "../common/Select.jsx";
import Button from "../common/Button.jsx";

const STATUS = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];

// Office pattern: StudentModal supports rapid entry — stays open after create,
// clears the form, and refocuses the roll input via rollRef.
export default function StudentForm({ initial, nextNumber = 1, divisions, onSave, onCancel, rollRef }) {
  const [v, setV] = useState({
    studentId: initial?.studentId ?? String(nextNumber),
    studentNo: initial?.studentNo ?? initial?.studentId ?? String(nextNumber),
    name: initial?.name ?? "",
    rollNumber: initial ? String(initial.rollNumber) : "",
    divisionId: initial?.divisionId ?? "",
    mobile: initial?.mobile ?? "",
    status: initial?.status ?? "active",
  });
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
      <div className="form-grid">
        <Input
          id="stu-no"
          label="Student No."
          value={`#${v.studentNo}`}
          disabled
          readOnly
          title="Sequential student number"
        />
        <Input
          id="stu-roll"
          label="Roll Number"
          inputMode="numeric"
          placeholder="1"
          value={v.rollNumber}
          onChange={set("rollNumber")}
          error={errors.rollNumber}
          ref={rollRef}
        />
        <Input
          id="stu-name"
          className="span-2"
          label="Student Name"
          placeholder="John Smith"
          value={v.name}
          onChange={set("name")}
          error={errors.name}
          autoFocus
        />
        <Select
          id="stu-div"
          label="Division"
          placeholder="Select division"
          options={divisions.map((d) => ({ value: d.id, label: d.name }))}
          value={v.divisionId}
          onChange={set("divisionId")}
          error={errors.divisionId}
        />
        <Input
          id="stu-mobile"
          label="Mobile Number"
          type="tel"
          placeholder="+91 98765 43210"
          value={v.mobile}
          onChange={set("mobile")}
          error={errors.mobile}
        />
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : initial ? "Save Changes" : "Create Student"}</Button>
      </div>
    </form>
  );
}
