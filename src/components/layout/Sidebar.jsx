import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import Icon from "../common/Icon.jsx";

const NAV_ITEMS = [
  { to: "/portal", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/attendance", label: "Daily Wise Attendance", icon: "daily" },
  { to: "/reports", label: "History", icon: "history" },
];

const MANAGEMENT_ITEMS = [
  { to: "/students", label: "Students", icon: "students" },
  { to: "/divisions", label: "Divisions", icon: "divisions" },
];

const Link = ({ l, onNavigate, className = "" }) => (
  <NavLink
    to={l.to}
    end={l.end}
    title={l.label}
    onClick={onNavigate}
    className={({ isActive }) => `nav-link ${className} ${isActive ? "nav-link--active" : ""}`}
  >
    <Icon name={l.icon} /><span className="nav-text">{l.label}</span>
  </NavLink>
);

// Desktop aside + mobile overlay drawer.
export default function Sidebar({ center, user, open, onClose, onSignOut }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isManagementActive = location.pathname === "/students" || location.pathname === "/divisions";
  const [managementOpen, setManagementOpen] = useState(isManagementActive);

  useEffect(() => {
    if (isManagementActive) {
      setManagementOpen(true);
    }
  }, [isManagementActive]);

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
          {NAV_ITEMS.map((l) => (
            <Link key={l.to} l={l} onNavigate={onClose} />
          ))}

          <div className="nav-group">
            <button
              type="button"
              className={`nav-link nav-toggle ${isManagementActive ? "nav-toggle--active" : ""} ${managementOpen ? "nav-toggle--open" : ""}`}
              onClick={() => setManagementOpen((v) => !v)}
              aria-expanded={managementOpen}
              title="Management"
            >
              <Icon name="management" />
              <span className="nav-text">Management</span>
              <span className={`nav-text nav-chevron ${managementOpen ? "nav-chevron--open" : ""}`}>
                <Icon name="chevron" size={14} />
              </span>
            </button>

            {managementOpen && (
              <div className="nav-sub" role="group" aria-label="Management options">
                {MANAGEMENT_ITEMS.map((l) => (
                  <Link key={l.to} l={l} onNavigate={onClose} className="nav-sub-link" />
                ))}
              </div>
            )}
          </div>
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

