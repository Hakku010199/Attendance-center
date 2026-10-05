import { NavLink, useNavigate } from "react-router-dom";
import Icon from "../common/Icon.jsx";

// Office-style nav: Dashboard + Students + Daily Attendance + History + Divisions.
// Routes are unchanged (auth/onboarding untouched); only the shell layout is redesigned.
const SECTIONS = [
  { title: null, links: [{ to: "/portal", label: "Dashboard", icon: "dashboard", end: true }] },
  {
    title: "Management",
    links: [
      { to: "/students", label: "Students", icon: "students" },
      { to: "/attendance", label: "Daily Attendance", icon: "daily" },
      { to: "/divisions", label: "Divisions", icon: "divisions" },
    ],
  },
  { title: "Reports", links: [{ to: "/reports", label: "History", icon: "history" }] },
];

const Link = ({ l, onNavigate }) => (
  <NavLink to={l.to} end={l.end} title={l.label} onClick={onNavigate} className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
    <Icon name={l.icon} /><span className="nav-text">{l.label}</span>
  </NavLink>
);

// Desktop aside + mobile overlay drawer (Office pattern: OfficeSidebar).
export default function Sidebar({ center, user, open, onClose, onSignOut }) {
  const navigate = useNavigate();
  const signOut = async () => {
    if (onSignOut) await onSignOut();
    navigate("/login", { replace: true });
  };
  return (
    <>
      <div className={`scrim ${open ? "scrim--show" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-logo"><Icon name="logo" size={20} /></div>
          <div className="nav-text"><small>CENTER</small><b>{center.name}</b></div>
        </div>
        <nav className="nav">
          {SECTIONS.map((s) => (
            <div key={s.title ?? "main"} className="nav-section">
              {s.title && <span className="nav-title nav-text">{s.title}</span>}
              {s.links.map((l) => <Link key={l.to} l={l} onNavigate={onClose} />)}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link l={{ to: "/settings", label: "Settings", icon: "settings" }} onNavigate={onClose} />
          <button type="button" className="nav-link nav-signout" onClick={signOut}>
            <Icon name="logout" /><span className="nav-text">Sign Out</span>
          </button>
          <div className="user-card">
            <span className="avatar">{(user.name || "O")[0]}</span>
            <div className="nav-text user-meta"><b>{user.name}</b><small>{user.email}</small></div>
            <span className="nav-text"><Icon name="chevron" size={16} /></span>
          </div>
        </div>
      </aside>
    </>
  );
}

