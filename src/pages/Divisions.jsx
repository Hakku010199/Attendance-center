import { useState } from "react";
import PageHeader from "../components/common/PageHeader.jsx";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Modal, { ConfirmModal } from "../components/common/Modal.jsx";
import StatusBadge from "../components/common/StatusBadge.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Select from "../components/common/Select.jsx";
import { useToast } from "../components/common/Toast.jsx";
import DivisionForm from "../components/divisions/DivisionForm.jsx";
import useDivisions from "../hooks/useDivisions.js";
import { saveDivision, deleteDivision } from "../services/divisionService.js";

const FILTERS = [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];
const fmt = (iso) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

// Office pattern: foundation section on the shared hook with counts,
// type-to-confirm dangerous delete, and save/delete event broadcast.
export default function Divisions() {
  const { divisions, loading, error, refetch } = useDivisions();
  const toast = useToast();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("all");
  const [form, setForm] = useState(null); const [del, setDel] = useState(null);
  const [delError, setDelError] = useState(""); const [busy, setBusy] = useState(false);

  const save = async (values) => {
    const r = await saveDivision(values, form.division?.id);
    if (r.errors || r.error) {
      if (r.error) toast(r.error, "error");
      return r;
    }
    setForm(null); refetch(); toast(form.division ? "Division updated." : "Division created."); return r;
  };
  const remove = async () => {
    setBusy(true); const r = await deleteDivision(del.id); setBusy(false);
    if (r.error) return setDelError(r.error);
    setDel(null); setDelError(""); refetch(); toast("Division deleted.");
  };

  const rows = divisions.filter((d) => (status === "all" || d.status === status) && d.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader title="Divisions" text={`Foundation of your center${divisions.length ? ` (${divisions.length})` : ""}.`}><Button onClick={() => setForm({ division: null })}><Icon name="plus" size={16} /> Add Division</Button></PageHeader>
      {error && <div className="notice" role="alert">{error}</div>}
      <div className="toolbar">
        <div className="search"><Icon name="search" size={16} /><input className="control" type="search" placeholder="Search divisions" aria-label="Search divisions" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select id="div-filter" aria-label="Status filter" options={FILTERS} value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>
      <section className="card card--flush">
        {loading ? <div className="empty" aria-busy="true">Loading...</div> : rows.length === 0 ? <EmptyState title={divisions.length === 0 ? "No divisions yet" : "No divisions found"} text={divisions.length === 0 ? "Create your first division to organize students." : "Try a different search or add a new division."} action={divisions.length === 0 ? <Button onClick={() => setForm({ division: null })}><Icon name="plus" size={16} /> Add Division</Button> : undefined} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Division</th><th>Number of Students</th><th>Status</th><th>Created Date</th><th className="th-right">Actions</th></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id}>
                <td data-label="Division"><strong>{d.name}</strong></td><td data-label="Students">{d.studentCount} Students</td>
                <td data-label="Status"><StatusBadge variant={d.status}>{d.status === "active" ? "Active" : "Inactive"}</StatusBadge></td><td data-label="Created">{fmt(d.createdAt)}</td>
                <td className="cell-actions"><Button variant="ghost" size="sm" onClick={() => setForm({ division: d })}><Icon name="edit" size={15} /> Edit</Button><Button variant="ghost-danger" size="sm" onClick={() => { setDel(d); setDelError(""); }}><Icon name="trash" size={15} /> Delete</Button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
      {form && <Modal title={form.division ? "Edit Division" : "Add Division"} onClose={() => setForm(null)}><DivisionForm initial={form.division} onSave={save} onCancel={() => setForm(null)} /></Modal>}
      {del && <ConfirmModal title="Delete Division" message={`Delete "${del.name}" and all its data? This cannot be undone.`} requireText={`Delete ${del.name}`} confirmLabel="Delete Division" busy={busy} onConfirm={remove} onCancel={() => { setDel(null); setDelError(""); }} />}
      {delError && del && <div className="notice" role="alert">{delError}</div>}
    </>
  );
}
