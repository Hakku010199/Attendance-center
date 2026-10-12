import { useEffect, useState } from "react";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Async from "../components/common/Async.jsx";
import Select from "../components/common/Select.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import useLoad from "../hooks/useLoad.js";
import useDivisions from "../hooks/useDivisions.js";
import { usePortal } from "../components/layout/AppLayout.jsx";
import { getHistory, todayISO } from "../services/attendanceService.js";
import { ATTENDANCE_UPDATED } from "../utils/events.js";

const fmtDate = (iso) => {
  try {
    return new Date(`${iso}T00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
];

// Office pattern: Attendance History = searchable audit log across all dates,
// live-refreshed on attendance-updated, with debounced name/roll search.
export default function Reports() {
  const { center, attendanceRefreshKey } = usePortal();
  const { divisions } = useDivisions();
  const active = divisions.filter((d) => d.status === "active");
  const centerId = center?.id;
  const storageKey = centerId ? `reports-filter:${centerId}` : null;

  const [savedFilters] = useState(() => {
    if (!centerId) return {};
    try {
      const raw = localStorage.getItem(`reports-filter:${centerId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [date, setDate] = useState(() => savedFilters.date || "");
  const [division, setDivision] = useState(() => savedFilters.division || "all");
  const [statusFilter, setStatusFilter] = useState(() => savedFilters.statusFilter || "all");
  const [q, setQ] = useState(() => savedFilters.q || "");
  const [debouncedQ, setDebouncedQ] = useState(() => savedFilters.q || "");
  const [hasFilter, setHasFilter] = useState(() => {
    return Boolean(
      (savedFilters.date) ||
      (savedFilters.division && savedFilters.division !== "all") ||
      (savedFilters.statusFilter && savedFilters.statusFilter !== "all") ||
      (savedFilters.q && savedFilters.q.trim())
    );
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setHasFilter(Boolean(date || division !== "all" || statusFilter !== "all" || q.trim()));
  }, [date, division, statusFilter, q]);

  // Persist filters to localStorage
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ date, division, statusFilter, q })
      );
    } catch {}
  }, [date, division, statusFilter, q, storageKey]);

  // Ensure active division selection remains valid if divisions list changes
  useEffect(() => {
    if (division !== "all" && active.length > 0 && !active.some((d) => d.id === division)) {
      setDivision("all");
    }
  }, [active, division]);

  const state = useLoad(
    () => getHistory({ date: date || undefined, divisionId: division, status: statusFilter, search: debouncedQ }),
    [date, division, statusFilter, debouncedQ, attendanceRefreshKey]
  );

  useEffect(() => {
    const onUpdate = () => state.reload();
    window.addEventListener(ATTENDANCE_UPDATED, onUpdate);
    return () => window.removeEventListener(ATTENDANCE_UPDATED, onUpdate);
  }, [state.reload]);

  const clearFilters = () => {
    setDate("");
    setDivision("all");
    setStatusFilter("all");
    setQ("");
    setDebouncedQ("");
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
  };

  const divName = (id) => active.find((d) => d.id === id)?.name ?? "—";

  return (
    <>
      <div className="toolbar toolbar--att4">
        <div className="field"><label htmlFor="h-date">Date</label><input id="h-date" className="control" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
        <Select id="h-div" label="Division" options={[{ value: "all", label: "All Divisions" }, ...active.map((d) => ({ value: d.id, label: d.name }))]} value={division} onChange={(e) => setDivision(e.target.value)} />
        <Select id="h-status" label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
        <div className="search"><Icon name="search" size={16} /><input className="control" type="search" placeholder="Search name or roll" aria-label="Search reports" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {(hasFilter) && <div className="page-actions"><Button variant="secondary" size="sm" onClick={clearFilters}>Clear Filters</Button></div>}
      <Async state={state}>{(rawRows) => {
        const rows = statusFilter === "all" ? rawRows : rawRows.filter((r) => r.status === statusFilter);
        const statusLabel = statusFilter === "present" ? "present " : statusFilter === "absent" ? "absent " : "";
        return (
          <section className="card card--flush">
            <p className="muted history-meta">{rows.length} {statusLabel}record{rows.length === 1 ? "" : "s"} found</p>
            {rows.length === 0 ? <EmptyState title="No records found" text={statusFilter !== "all" ? `No ${statusFilter} records found for this selection.` : "Try a different date, division, or search."} /> : (
            <div className="table-wrap"><table className="table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Division</th>
                  <th>Status</th>
                  <th>Mobile</th>
                </tr>
              </thead>
              <tbody>{rows.map((r, i) => (
                <tr key={`${r.sessionId}-${r.studentId}-${i}`}>
                  <td data-label="Name"><strong>{r.name}</strong></td>
                  <td data-label="Division">{divName(r.divisionId)}</td>
                  <td data-label="Status">{r.status === "absent" ? <span className="badge-absent">Absent</span> : <span className="badge-present">Present</span>}</td>
                  <td data-label="Mobile">
                    {r.mobile ? (
                      <a
                        href={`tel:${r.mobile}`}
                        className="phone-call-link"
                        title={`Call ${r.name} (${r.mobile})`}
                      >
                        <span className="phone-call-icon"><Icon name="phone" size={12} /></span>
                        <span className="phone-call-text">{r.mobile}</span>
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>
        );
      }}</Async>
    </>
  );
}
