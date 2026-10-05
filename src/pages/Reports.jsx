import { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader.jsx";
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

// Office pattern: Attendance History = searchable audit log across all dates,
// live-refreshed on attendance-updated, with debounced name/roll search.
export default function Reports() {
  const { attendanceRefreshKey } = usePortal();
  const { divisions } = useDivisions();
  const active = divisions.filter((d) => d.status === "active");
  const [date, setDate] = useState("");
  const [division, setDivision] = useState("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [hasFilter, setHasFilter] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setHasFilter(Boolean(date || (division !== "all") || q.trim()));
  }, [date, division, q]);

  const state = useLoad(
    () => getHistory({ date: date || undefined, divisionId: division, search: debouncedQ }),
    [date, division, debouncedQ, attendanceRefreshKey]
  );

  useEffect(() => {
    const onUpdate = () => state.reload();
    window.addEventListener(ATTENDANCE_UPDATED, onUpdate);
    return () => window.removeEventListener(ATTENDANCE_UPDATED, onUpdate);
  }, [state.reload]);

  const clearFilters = () => {
    setDate("");
    setDivision("all");
    setQ("");
    setDebouncedQ("");
  };

  const divName = (id) => active.find((d) => d.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader title="Attendance History" text="Searchable audit log across all dates." />
      <div className="toolbar toolbar--att3">
        <div className="field"><label htmlFor="h-date">Date</label><input id="h-date" className="control" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
        <Select id="h-div" label="Division" options={[{ value: "all", label: "All Divisions" }, ...active.map((d) => ({ value: d.id, label: d.name }))]} value={division} onChange={(e) => setDivision(e.target.value)} />
        <div className="search"><Icon name="search" size={16} /><input className="control" type="search" placeholder="Search name or roll" aria-label="Search history" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {(hasFilter) && <div className="page-actions"><Button variant="secondary" size="sm" onClick={clearFilters}>Clear Filters</Button></div>}
      <Async state={state}>{(rows) => (
        <section className="card card--flush">
          <p className="muted history-meta">{rows.length} record{rows.length === 1 ? "" : "s"} found</p>
          {rows.length === 0 ? <EmptyState title="No history found" text="Try a different date, division, or search." /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Roll No.</th><th>Student Name</th><th>Division</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={`${r.sessionId}-${r.studentId}-${i}`}>
                  <td data-label="Date">{fmtDate(r.date)}</td>
                  <td data-label="Roll No">{r.rollNumber}</td>
                  <td data-label="Name"><strong>{r.name}</strong> <small className="muted">{r.studentId}</small></td>
                  <td data-label="Division">{divName(r.divisionId)}</td>
                  <td data-label="Status">{r.status === "absent" ? <span className="badge-absent">Absent</span> : <span className="badge-present">Present</span>}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>
      )}</Async>
    </>
  );
}
