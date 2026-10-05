import PageHeader from "../components/common/PageHeader.jsx";
import StatCard from "../components/common/StatCard.jsx";
import Async from "../components/common/Async.jsx";
import BarChart from "../components/dashboard/BarChart.jsx";
import { usePortal } from "../components/layout/AppLayout.jsx";
import useLoad from "../hooks/useLoad.js";
import { getOverview } from "../services/attendanceService.js";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

// Dashboard keeps its existing design. Center/user now come from the Supabase session.
export default function Dashboard() {
  const { center, user } = usePortal();
  const state = useLoad(getOverview);
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name}`} text={`${center.name} - Here's what's happening at your center today.`}><span className="date-chip">{date}</span></PageHeader>
      <Async state={state}>{(o) => (
        <>
          <div className="stat-grid">
            <StatCard label="Total Students" value={o.total} note="Active students" icon="students" />
            <StatCard label="Present Today" value={o.present} note={`${o.presentPct}% attendance`} icon="attendance" tone="green" />
            <StatCard label="Absent Today" value={o.absent} note={`${(100 - o.presentPct).toFixed(1)}% absent`} icon="attendance" tone="red" />
            <StatCard label="Divisions" value={o.divisions} note="Active divisions" icon="divisions" />
          </div>
          <div className="dash-grid">
            <section className="card"><h3>Attendance Overview</h3><BarChart data={o.weekly} /></section>
            <section className="card">
              <h3>Today's Attendance</h3>
              <div className="donut" style={{ "--p": o.presentPct }}><span>{o.presentPct}%</span></div>
              <ul className="legend"><li><i className="dot dot--green" />Present <b>{o.present}</b></li><li><i className="dot dot--red" />Absent <b>{o.absent}</b></li></ul>
            </section>
          </div>
          <section className="card"><h3>Recent Activity</h3>
            {o.activity.length === 0 ? (
              <p className="muted">No activity yet. Add divisions and students, then mark attendance to see it here.</p>
            ) : (
              <ul className="activity">{o.activity.map((a) => <li key={a.text}><span>{a.text}</span><small>{a.time}</small></li>)}</ul>
            )}
          </section>
        </>
      )}</Async>
    </>
  );
}
