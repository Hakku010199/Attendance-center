import { useNavigate } from "react-router-dom";
import StatCard from "../components/common/StatCard.jsx";
import Async from "../components/common/Async.jsx";
import { usePortal } from "../components/layout/AppLayout.jsx";
import useLoad from "../hooks/useLoad.js";
import { getOverview } from "../services/attendanceService.js";

// Dashboard: Stat cards, Today's Attendance overview, and Division Status Badges.
export default function Dashboard() {
  const { center, attendanceRefreshKey, divisionsKey } = usePortal();
  const navigate = useNavigate();
  const state = useLoad(getOverview, [attendanceRefreshKey, divisionsKey]);
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const handleDivisionClick = (divId) => {
    if (center?.id) {
      try {
        localStorage.setItem(`attendance-selected-division:${center.id}`, divId);
      } catch {}
    }
    navigate("/attendance", { state: { divisionId: divId } });
  };

  return (
    <>
      <div className="page-head" style={{ justifyContent: "flex-end", marginBottom: "16px" }}>
        <span className="date-chip">{date}</span>
      </div>
      <Async state={state}>{(o) => {
        const hasStudents = o.total > 0;
        const divisionList = o.divisionList || [];

        return (
          <>
            <div className="stat-grid">
              <StatCard label="Total Students" value={o.total} note="Active students" icon="students" />
              <StatCard label="Present Today" value={o.present} note={`${o.presentPct}% attendance`} icon="attendance" tone="green" />
              <StatCard label="Absent Today" value={o.absent} note={`${(100 - o.presentPct).toFixed(1)}% absent`} icon="attendance" tone="red" />
              <StatCard label="Divisions" value={o.divisions} note="Active divisions" icon="divisions" />
            </div>

            <section className="card today-attendance-card">
              <div className="today-attendance-header">
                <h3>Today's Attendance</h3>
                <span className="date-chip" style={{ fontSize: "0.8rem", padding: "4px 10px" }}>
                  {hasStudents ? `${o.presentPct}% Present` : "No Active Students"}
                </span>
              </div>
              <div className="today-attendance-body">
                <div
                  className={`donut ${!hasStudents ? "donut--empty" : ""}`}
                  style={{ "--p": o.presentPct }}
                  role="img"
                  aria-label={`Today's attendance: ${o.presentPct}% present`}
                >
                  <span>
                    {o.presentPct}%
                    <small>{hasStudents ? "Present" : "No Data"}</small>
                  </span>
                </div>
                <ul className="legend">
                  <li>
                    <i className="dot dot--green" />
                    <span>Present</span>
                    <b className="legend-val--present">{o.present}</b>
                  </li>
                  <li>
                    <i className="dot dot--red" />
                    <span>Absent</span>
                    <b className="legend-val--absent">{o.absent}</b>
                  </li>
                  <li>
                    <i className="dot dot--neutral" />
                    <span>Total Students</span>
                    <b>{o.total}</b>
                  </li>
                </ul>
              </div>
            </section>

            {/* Division Attendance Status: Red badge for Pending, Blue badge for Taken */}
            <section className="card division-status-card">
              <div className="division-status-header">
                <h3 className="division-status-title">Divisions Attendance Status</h3>
              </div>

              {divisionList.length === 0 ? (
                <div className="division-status-empty">
                  <p className="muted">No active divisions found. Create divisions in the Divisions page.</p>
                </div>
              ) : (
                <div className="division-badges-grid">
                  {divisionList.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`division-status-badge ${
                        d.attendanceTaken ? "division-status-badge--blue" : "division-status-badge--red"
                      }`}
                      onClick={() => handleDivisionClick(d.id)}
                      title={`${d.name} — Attendance ${d.attendanceTaken ? "Taken" : "Pending"}`}
                      aria-label={`${d.name}, attendance ${d.attendanceTaken ? "taken" : "pending"}`}
                    >
                      <span className="division-badge-name">{d.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        );
      }}</Async>
    </>
  );
}

