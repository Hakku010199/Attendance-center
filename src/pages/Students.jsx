import { useEffect, useRef, useState } from "react";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Modal, { ConfirmDialog } from "../components/common/Modal.jsx";
import StatusBadge from "../components/common/StatusBadge.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Async from "../components/common/Async.jsx";
import Select from "../components/common/Select.jsx";
import { useToast } from "../components/common/Toast.jsx";
import StudentForm from "../components/students/StudentForm.jsx";
import ImportStudentsModal from "../components/students/ImportStudentsModal.jsx";
import StudentImportModal from "../components/students/StudentImportModal.jsx";
import useLoad from "../hooks/useLoad.js";
import useDivisions from "../hooks/useDivisions.js";
import { usePortal } from "../components/layout/AppLayout.jsx";
import { listStudents, saveStudent, deleteStudent } from "../services/studentService.js";

const STATUS = [{ value: "all", label: "All Status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];

const activeDivisions = (divisions) => divisions.filter((d) => d.status === "active");

// Office pattern: master-data entry with debounced search,
// auto-correcting division filter, and rapid-entry create.
export default function Students() {
  const { center, divisionsKey } = usePortal();
  const toast = useToast();
  const { divisions, loading: divLoading, error: divError } = useDivisions();
  const state = useLoad(listStudents, [divisionsKey]);
  const centerId = center?.id;
  const divStorageKey = centerId ? `students-filter-division:${centerId}` : null;

  const [division, setDivision] = useState(() => {
    if (centerId) {
      try {
        const saved = localStorage.getItem(`students-filter-division:${centerId}`);
        if (saved) return saved;
      } catch {}
    }
    return "all";
  });
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const handleDivisionChange = (newDiv) => {
    setDivision(newDiv);
    if (divStorageKey) {
      try {
        localStorage.setItem(divStorageKey, newDiv);
      } catch {}
    }
  };
  const [form, setForm] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const rollRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (division !== "all" && divisions.length > 0 && !divisions.some((d) => d.id === division)) setDivision("all");
  }, [divisions, division]);

  const save = async (values) => {
    const r = await saveStudent(values, form.student?.id);
    if (r.errors || r.error) {
      if (r.error) toast(r.error, "error");
      return r;
    }
    if (form.student) {
      setForm(null); state.reload(); toast("Student updated.");
    } else {
      state.reload(); toast("Student created.");
      setFormKey((k) => k + 1);
      setTimeout(() => rollRef.current?.focus(), 50);
    }
    return r;
  };
  const onImportComplete = (s) => {
    setImportOpen(false);
    setDivision(s.divisionId);
    setQ("");
    setDebouncedQ("");
    state.reload();
    setSummary(s);
    toast(`Imported ${s.successfullyImported} student${s.successfullyImported === 1 ? "" : "s"}.`);
  };

  const remove = async () => { setBusy(true); await deleteStudent(del.id); setBusy(false); setDel(null); state.reload(); toast("Student deleted."); };

  return (
    <>
      <Async state={state}>{(students) => {
        const term = debouncedQ.trim().toLowerCase();
        const count = students.length;
        const maxStudentNo = students.reduce((max, s) => {
          const n = parseInt(s.studentNo, 10);
          return !isNaN(n) && n > max ? n : max;
        }, 0);
        const nextNumber = Math.max(maxStudentNo + 1, count + 1);

        const rows = students.filter((s) => {
          const matchDiv = division === "all" || s.divisionId === division;
          const matchTerm =
            !term ||
            s.name.toLowerCase().includes(term) ||
            String(s.rollNumber).includes(term) ||
            (s.mobile && s.mobile.toLowerCase().includes(term)) ||
            String(s.studentNo || "").includes(term);
          return matchDiv && matchTerm;
        });

        return (
          <>
            <div className="page-actions" style={{ justifyContent: "flex-end", marginBottom: "16px" }}>
              <Button variant="secondary" onClick={() => setSmartImportOpen(true)}>
                <Icon name="download" size={16} /> Import Students
              </Button>
              <Button onClick={() => setForm({ student: null, nextNumber })}>
                <Icon name="plus" size={16} /> Add Student
              </Button>
            </div>
            {divError && <div className="notice" role="alert">{divError}</div>}
            <div className="toolbar">
              <div className="search">
                <Icon name="search" size={16} />
                <input
                  className="control"
                  type="search"
                  placeholder="Search by name, roll, or mobile"
                  aria-label="Search students"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select
                id="stu-f-div"
                aria-label="Division filter"
                options={[{ value: "all", label: "All Divisions" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
                value={division}
                onChange={(e) => handleDivisionChange(e.target.value)}
              />
            </div>
            <section className="card card--flush">
              {rows.length === 0 ? (
                <EmptyState
                  title={count === 0 ? "No students yet" : "No students found"}
                  text={count === 0 ? "Add your first student to get started." : "Try a different search or filter."}
                  action={count === 0 ? <Button onClick={() => setForm({ student: null, nextNumber })}><Icon name="plus" size={16} /> Add Student</Button> : undefined}
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>No.</th>
                        <th>Student Name</th>
                        <th>Roll Number</th>
                        <th>Division</th>
                        <th>Mobile</th>
                        <th className="th-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s, idx) => (
                        <tr key={s.id}>
                          <td data-label="No." className="muted" style={{ fontWeight: 600 }}>
                            {s.studentNo || idx + 1}
                          </td>
                          <td data-label="Name"><strong>{s.name}</strong></td>
                          <td data-label="Roll No">{s.rollNumber}</td>
                          <td data-label="Division">{s.divisionName}</td>
                          <td data-label="Mobile">
                            {s.mobile ? (
                              <a
                                href={`tel:${s.mobile}`}
                                className="phone-call-link"
                                title={`Call ${s.name} (${s.mobile})`}
                              >
                                <span className="phone-call-icon"><Icon name="phone" size={12} /></span>
                                <span className="phone-call-text">{s.mobile}</span>
                              </a>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="cell-actions">
                            <Button variant="ghost" size="sm" onClick={() => setForm({ student: s, nextNumber: s.studentNo || idx + 1 })}>
                              <Icon name="edit" size={15} /> Edit
                            </Button>
                            <Button variant="ghost-danger" size="sm" onClick={() => setDel(s)}>
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
          </>
        );
      }}</Async>
      {form && (
        <Modal title={form.student ? "Edit Student" : "Add Student"} onClose={() => setForm(null)}>
          <StudentForm
            key={formKey}
            initial={form.student}
            nextNumber={form.nextNumber || 1}
            divisions={divisions}
            onSave={save}
            onCancel={() => setForm(null)}
            rollRef={rollRef}
          />
        </Modal>
      )}
      {smartImportOpen && (
        <StudentImportModal
          divisions={activeDivisions(divisions)}
          onClose={() => setSmartImportOpen(false)}
          onImportComplete={(s) => {
            state.reload();
            toast(`Imported ${s.successfullyImported} student${s.successfullyImported === 1 ? "" : "s"}.`);
          }}
        />
      )}
      {importOpen && (
        <ImportStudentsModal
          divisions={activeDivisions(divisions)}
          defaultDivisionId={division}
          onClose={() => setImportOpen(false)}
          onImportComplete={onImportComplete}
        />
      )}
      {summary && (
        <Modal title="Import Summary" onClose={() => setSummary(null)}>
          <div className="stat-grid stat-grid--3">
            <div className="stat"><small>Rows read</small><b>{summary.totalRowsRead}</b></div>
            <div className="stat"><small>Imported</small><b>{summary.successfullyImported}</b></div>
            <div className="stat"><small>Duplicates</small><b>{summary.duplicateRollNumbers}</b></div>
            <div className="stat"><small>Invalid</small><b>{summary.invalidRecords}</b></div>
            <div className="stat"><small>Skipped</small><b>{summary.skippedRows}</b></div>
          </div>
          {summary.issues.length > 0 && (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Row</th><th>Roll</th><th>Reason</th></tr></thead>
              <tbody>{summary.issues.map((it, i) => (
                <tr key={i}><td data-label="Row">{it.rowNumber}</td><td data-label="Roll">{it.rollNumber}</td><td data-label="Reason">{it.reason}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          <div className="modal-actions"><Button onClick={() => setSummary(null)}>Done</Button></div>
        </Modal>
      )}
      {del && <ConfirmDialog title="Delete Student?" message={`Are you sure you want to delete ${del.name}? Their attendance records will also be removed.`} busy={busy} onConfirm={remove} onCancel={() => setDel(null)} />}
    </>
  );
}
