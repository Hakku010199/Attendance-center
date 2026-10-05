import { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader.jsx";
import StatCard from "../components/common/StatCard.jsx";
import Async from "../components/common/Async.jsx";
import Select from "../components/common/Select.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Icon from "../components/common/Icon.jsx";
import useLoad from "../hooks/useLoad.js";
import useDivisions from "../hooks/useDivisions.js";
import { usePortal } from "../components/layout/AppLayout.jsx";
import { getAttendance, setAbsent, todayISO } from "../services/attendanceService.js";
import { ATTENDANCE_UPDATED } from "../utils/events.js";
import { useToast } from "../components/common/Toast.jsx";

const fmtDate = (iso) => {
  try {
    return new Date(`${iso}T00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

// Office pattern: Daily Attendance is a read-first audit view. Marking still
// works inline; every write broadcasts attendance-updated so History refreshes.
export default function Attendance() {
  const { attendanceRefreshKey, divisionsKey } = usePortal();
  const toast = useToast();
  const { divisions } = useDivisions();
  const [date, setDate] = useState(todayISO);
  const [divisionId, setDivisionId] = useState("");
  const [absent, setAbsentIds] = useState([]);
  const active = divisions.filter((d) => d.status === "active");
  useEffect(() => {
    if (!divisionId && active[0]) setDivisionId(active[0].id);
    if (divisionId && active.length > 0 && !active.some((d) => d.id === divisionId)) setDivisionId(active[0].id);
  }, [active, divisionId]);

  const list = useLoad(() => (divisionId ? getAttendance(date, divisionId) : Promise.resolve({ students: [], absentIds: [] })), [date, divisionId, attendanceRefreshKey, divisionsKey]);
  useEffect(() => { if (list.data) setAbsentIds(list.data.absentIds); }, [list.data]);

  useEffect(() => {
    const onUpdate = () => list.reload();
    window.addEventListener(ATTENDANCE_UPDATED, onUpdate);
    return () => window.removeEventListener(ATTENDANCE_UPDATED, onUpdate);
  }, [list.reload]);

  // Optimistic update, then persist through the service
  const mark = async (id, isAbsent) => {
    setAbsentIds((cur) => (isAbsent ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));
    const r = await setAbsent(date, divisionId, id, isAbsent);
    if (r?.error) {
      toast(r.error, "error");
      if (list.data) setAbsentIds(list.data.absentIds);
    }
  };
  const students = list.data?.students ?? [];
  const absentCount = students.filter((s) => absent.includes(s.id)).length;
  const presentCount = students.length - absentCount;

  return (
    <>
      <PageHeader title="Daily Attendance" text={`Audit what was marked — ${fmtDate(date)}.`} />
      <div className="toolbar toolbar--att">
        <div className="field"><label htmlFor="att-date">Date</label><input id="att-date" className="control" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></div>
        <Select id="att-div" label="Division" placeholder="All Divisions" options={active.map((d) => ({ value: d.id, label: d.name }))} value={divisionId} onChange={(e) => setDivisionId(e.target.value)} />
      </div>
      <div className="stat-grid">
        <StatCard label="Total Students" value={students.length} icon="students" />
        <StatCard label="Present" value={presentCount} icon="attendance" tone="green" />
        <StatCard label="Absent" value={absentCount} icon="attendance" tone="red" />
        <StatCard label="Attendance %" value={`${students.length ? Math.round((presentCount / students.length) * 100) : 0}%`} icon="reports" />
      </div>
      <Async state={list}>{() => (
        <section className="card card--flush">
          {students.length === 0 ? <EmptyState title="No records" text={divisionId ? "No active students in this division for this date." : "Pick a division to view its daily records."} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Roll No.</th><th>Student Name</th><th>Status</th><th className="th-right">Mark</th></tr></thead>
              <tbody>{students.map((s) => {
              const isAbsent = absent.includes(s.id);
              return (
                <tr key={s.id}>
                  <td data-label="Roll No">{s.rollNumber}</td>
                  <td data-label="Name"><strong>{s.name}</strong> <small className="muted">{s.studentId}</small></td>
                  <td data-label="Status">{isAbsent ? <span className="badge-absent">Absent</span> : <span className="badge-present">Present</span>}</td>
                  <td className="cell-actions">
                  <div className="seg" role="group" aria-label={`Attendance for ${s.name}`}>
                    <button type="button" className={`seg-btn seg-btn--present ${!isAbsent ? "on" : ""}`} aria-pressed={!isAbsent} onClick={() => mark(s.id, false)}>Present</button>
                    <button type="button" className={`seg-btn seg-btn--absent ${isAbsent ? "on" : ""}`} aria-pressed={isAbsent} onClick={() => mark(s.id, true)}>Absent</button>
                  </div>
                    </td>
                  </tr>
              );
            })}</tbody>
            </table></div>
          )}
        </section>
      )}</Async>
    </>
  );
}
