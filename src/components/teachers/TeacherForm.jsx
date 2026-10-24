import { useState } from "react";
import Input from "../common/Input.jsx";
import Select from "../common/Select.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function TeacherForm({ initial, divisions = [], onSave, onCancel }) {
  const isEditing = Boolean(initial?.id);

  // Initialize selected division IDs (supports multiple divisions)
  const initialDivisionIds = Array.isArray(initial?.divisionIds) && initial.divisionIds.length > 0
    ? initial.divisionIds
    : (initial?.divisionId ? [initial.divisionId] : []);

  const [v, setV] = useState({
    userId: initial?.userId ?? "",
    password: initial?.password ?? "",
    name: initial?.name ?? "",
    divisionIds: initialDivisionIds,
    status: initial?.status ?? "active",
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(!isEditing);

  const set = (k) => (e) => {
    setV((prev) => ({ ...prev, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const toggleDivision = (id) => {
    setV((prev) => {
      const exists = prev.divisionIds.includes(id);
      const updated = exists
        ? prev.divisionIds.filter((d) => d !== id)
        : [...prev.divisionIds, id];
      return { ...prev, divisionIds: updated };
    });
  };

  const handleSelectAllDivisions = () => {
    setV((prev) => ({
      ...prev,
      divisionIds: divisions.map((d) => d.id),
    }));
  };

  const handleClearAllDivisions = () => {
    setV((prev) => ({
      ...prev,
      divisionIds: [],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await onSave(v);
    setSaving(false);
    if (result?.errors) {
      setErrors(result.errors);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="form">
      <div className="form-grid">
        {/* User ID / Username */}
        <Input
          id="teacher-user-id"
          label="User ID / Username *"
          value={v.userId}
          onChange={set("userId")}
          error={errors.userId}
          autoFocus={!isEditing}
          icon={<Icon name="userCheck" size={16} />}
        />

        {/* Teacher Full Name */}
        <Input
          id="teacher-name"
          label="Teacher Name"
          value={v.name}
          onChange={set("name")}
          error={errors.name}
        />

        {/* Password */}
        <Input
          id="teacher-password"
          label={isEditing ? "Password (Leave blank to keep current)" : "Password *"}
          type={showPassword ? "text" : "password"}
          placeholder={isEditing ? "•••••••• (Unchanged)" : "Create a password"}
          value={v.password}
          onChange={set("password")}
          error={errors.password}
          icon={<Icon name="lock" size={16} />}
          rightSlot={
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
            </button>
          }
        />

        {/* Status */}
        <Select
          id="teacher-status"
          label="Account Status"
          options={STATUS_OPTIONS}
          value={v.status}
          onChange={set("status")}
        />
      </div>

      {/* Multiple Divisions Assignment Section */}
      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <label style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-primary-text, #ffffff)" }}>
            Assign Divisions
          </label>
          {divisions.length > 0 && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleSelectAllDivisions}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#60a5fa",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  padding: "0",
                  textDecoration: "underline",
                }}
              >
                Select All
              </button>
              <span style={{ color: "#64748b" }}>•</span>
              <button
                type="button"
                onClick={handleClearAllDivisions}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  padding: "0",
                  textDecoration: "underline",
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {divisions.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
            No divisions found in this center. You can create divisions in the Divisions tab first.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              padding: "12px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              maxHeight: "180px",
              overflowY: "auto",
            }}
          >
            {divisions.map((d) => {
              const isSelected = v.divisionIds.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDivision(d.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "0.84rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background: isSelected ? "rgba(37, 99, 235, 0.25)" : "rgba(255, 255, 255, 0.05)",
                    color: isSelected ? "#93c5fd" : "#cbd5e1",
                    border: isSelected ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <span
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "3px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isSelected ? "#3b82f6" : "rgba(255, 255, 255, 0.1)",
                      color: "#ffffff",
                      fontSize: "10px",
                    }}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <span>{d.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <p className="muted" style={{ fontSize: "0.78rem", marginTop: "6px", marginBottom: 0 }}>
          {v.divisionIds.length === 0
            ? "Tip: If no specific divisions are selected, teacher can view all divisions in attendance marking."
            : `Teacher will have access to mark attendance for: ${v.divisionIds.length} assigned division(s).`}
        </p>
      </div>

      <div className="modal-actions" style={{ marginTop: "24px" }}>
        <Button variant="secondary" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? isEditing
              ? "Updating..."
              : "Adding..."
            : isEditing
            ? "Update Teacher"
            : "Add Teacher"}
        </Button>
      </div>
    </form>
  );
}
