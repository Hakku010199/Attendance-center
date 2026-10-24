import { useState } from "react";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Modal, { ConfirmModal } from "../components/common/Modal.jsx";
import StatusBadge from "../components/common/StatusBadge.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Select from "../components/common/Select.jsx";
import { useToast } from "../components/common/Toast.jsx";
import TeacherForm from "../components/teachers/TeacherForm.jsx";
import useTeachers from "../hooks/useTeachers.js";
import useDivisions from "../hooks/useDivisions.js";
import { saveTeacher, deleteTeacher } from "../services/teacherService.js";
import { usePortal } from "../components/layout/AppLayout.jsx";

const STATUS_FILTERS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const fmt = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T00:00`).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export default function Teachers() {
  const { center } = usePortal();
  const { teachers, loading, error, needsSetup, refetch } = useTeachers();
  const { divisions } = useDivisions();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedDivision, setSelectedDivision] = useState("all");

  const [form, setForm] = useState(null); // { teacher: ... }
  const [del, setDel] = useState(null); // teacher to delete
  const [delError, setDelError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async (values) => {
    const isEdit = Boolean(form?.teacher?.id);
    const r = await saveTeacher(values, form?.teacher?.id);
    if (r.errors || r.error) {
      if (r.error) toast(r.error, "error");
      return r;
    }
    setForm(null);
    refetch();
    toast(isEdit ? "Teacher updated successfully." : "Teacher created successfully.");
    return r;
  };

  const handleDelete = async () => {
    if (!del) return;
    setBusy(true);
    const r = await deleteTeacher(del.id);
    setBusy(false);
    if (r.error) {
      return setDelError(r.error);
    }
    setDel(null);
    setDelError("");
    refetch();
    toast("Teacher deleted.");
  };

  const divisionFilterOptions = [
    { value: "all", label: "All Divisions" },
    ...divisions.map((d) => ({ value: d.id, label: d.name })),
  ];

  const rows = teachers.filter((t) => {
    const matchesStatus = status === "all" || t.status === status;
    const matchesDivision =
      selectedDivision === "all" ||
      (t.divisionIds && t.divisionIds.includes(selectedDivision)) ||
      t.divisionId === selectedDivision;
    const query = q.trim().toLowerCase();
    const matchesQuery =
      !query ||
      t.userId.toLowerCase().includes(query) ||
      (t.name && t.name.toLowerCase().includes(query)) ||
      t.divisionName.toLowerCase().includes(query);
    return matchesStatus && matchesDivision && matchesQuery;
  });

  return (
    <>
      {/* Top Action Bar */}
      <div className="page-actions" style={{ justifyContent: "flex-end", marginBottom: "16px" }}>
        <Button onClick={() => setForm({ teacher: null })}>
          <Icon name="plus" size={16} /> Add Teacher
        </Button>
      </div>

      {/* Database Setup Notice if table not created yet */}
      {needsSetup && (
        <div
          className="notice"
          style={{
            background: "rgba(234, 179, 8, 0.12)",
            borderColor: "rgba(234, 179, 8, 0.35)",
            color: "#fef08a",
            marginBottom: "16px",
            padding: "16px",
            borderRadius: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <Icon name="alert" size={20} />
            <div>
              <strong style={{ display: "block", marginBottom: "4px", color: "#facc15" }}>
                Database Table Required
              </strong>
              <p style={{ margin: "0 0 8px", fontSize: "0.88rem", color: "#e2e8f0" }}>
                The <code>teachers</code> table has not been created in your Supabase database yet. Run the SQL script from <code>supabase/migrations/20261023_teachers_table.sql</code> in your Supabase SQL Editor to enable teacher storage.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && !needsSetup && <div className="notice" role="alert">{error}</div>}

      {/* Search and Filter Toolbar */}
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            className="control"
            type="search"
            placeholder="Search by User ID, Name, or Division"
            aria-label="Search teachers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          id="teacher-div-filter"
          aria-label="Division filter"
          options={divisionFilterOptions}
          value={selectedDivision}
          onChange={(e) => setSelectedDivision(e.target.value)}
        />
        <Select
          id="teacher-status-filter"
          aria-label="Status filter"
          options={STATUS_FILTERS}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
      </div>

      {/* Teachers Table */}
      <section className="card card--flush">
        {loading ? (
          <div className="empty" aria-busy="true">Loading teachers…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={teachers.length === 0 ? "No teachers added yet" : "No matching teachers"}
            text={
              teachers.length === 0
                ? "Add your first teacher with a user ID, password, and assigned division."
                : "Try adjusting your search query or division filter."
            }
            action={
              teachers.length === 0 ? (
                <Button onClick={() => setForm({ teacher: null })}>
                  <Icon name="plus" size={16} /> Add Teacher
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Teacher Name</th>
                  <th>Assigned Divisions</th>
                  <th>Password</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="th-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td data-label="User ID">
                      <strong style={{ color: "var(--color-primary-text, #ffffff)" }}>
                        {t.userId}
                      </strong>
                    </td>
                    <td data-label="Teacher Name">
                      {t.name || <span className="muted">Not specified</span>}
                    </td>
                    <td data-label="Assigned Divisions">
                      {t.assignedDivisions && t.assignedDivisions.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {t.assignedDivisions.map((ad) => (
                            <span
                              key={ad.id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "10px",
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#93c5fd",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                              }}
                            >
                              <Icon name="divisions" size={12} />
                              {ad.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontStyle: "italic", fontSize: "0.82rem" }}>
                          All Divisions
                        </span>
                      )}
                    </td>
                    <td data-label="Password">
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <code style={{ fontSize: "0.88rem", letterSpacing: visiblePasswords[t.id] ? "normal" : "0.15em" }}>
                          {visiblePasswords[t.id] ? t.password : "••••••••"}
                        </code>
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(t.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#94a3b8",
                            cursor: "pointer",
                            padding: "2px",
                            display: "inline-flex",
                          }}
                          title={visiblePasswords[t.id] ? "Hide password" : "Show password"}
                        >
                          <Icon name={visiblePasswords[t.id] ? "eyeOff" : "eye"} size={14} />
                        </button>
                      </div>
                    </td>
                    <td data-label="Status">
                      <StatusBadge variant={t.status}>
                        {t.status === "active" ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td data-label="Created">{fmt(t.createdAt)}</td>
                    <td className="cell-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm({ teacher: t })}
                        title="Edit teacher and assigned division"
                      >
                        <Icon name="edit" size={15} /> Edit
                      </Button>
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={() => {
                          setDel(t);
                          setDelError("");
                        }}
                        title="Delete teacher"
                      >
                        <Icon name="trash" size={15} /> Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Teacher Modal */}
      {form && (
        <Modal
          title={form.teacher ? "Edit Teacher & Division" : "Add New Teacher"}
          onClose={() => setForm(null)}
        >
          <TeacherForm
            initial={form.teacher}
            divisions={divisions}
            onSave={handleSave}
            onCancel={() => setForm(null)}
          />
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {del && (
        <ConfirmModal
          title="Delete Teacher"
          message={`Are you sure you want to delete teacher "${del.userId}" (${del.name || "No name"})? They will lose access to mark attendance.`}
          requireText={`Delete ${del.userId}`}
          confirmLabel="Delete Teacher"
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => {
            setDel(null);
            setDelError("");
          }}
        />
      )}

      {delError && del && <div className="notice" role="alert">{delError}</div>}
    </>
  );
}

