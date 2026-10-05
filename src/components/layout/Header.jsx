import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../common/Icon.jsx";

const TITLES = {
  "/portal": ["Dashboard", "Overview"],
  "/": ["Dashboard", "Overview"],
  "/students": ["Students", "Master data"],
  "/attendance": ["Daily Attendance", "Audit what was marked"],
  "/divisions": ["Divisions", "Foundation"],
  "/reports": ["Attendance History", "Audit log"],
  "/settings": ["Settings", "Center"],
};

// Office pattern: mobile top-bar (menu + brand + sign out) + desktop content header.
export default function Header({ center, user, onMenu, onSignOut }) {
  const [title, crumb] = TITLES[useLocation().pathname] ?? TITLES["/portal"];
  const navigate = useNavigate();
  const signOut = async () => {
    if (onSignOut) await onSignOut();
    navigate("/login", { replace: true });
  };
  return (
    <>
      <div className="office-topbar">
        <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu"><Icon name="menu" /></button>
        <div className="office-brand"><span className="brand-logo brand-logo--sm"><Icon name="logo" size={18} /></span><b>{center.name}</b></div>
        <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
      </div>
      <header className="topbar">
        <div className="topbar-title"><h1>{title}</h1><span>{crumb}</span></div>
        <button type="button" className="icon-btn" aria-label="Notifications"><Icon name="bell" /></button>
        <div className="topbar-user"><span className="avatar">{(user.name || "O")[0]}</span><span className="topbar-name">{user.name}</span><Icon name="chevron" size={16} /></div>
        <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
      </header>
    </>
  );
}

