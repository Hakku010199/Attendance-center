import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../common/Icon.jsx";

// Mobile top-bar: shows Back arrow + Page title on secondary pages, Center brand on primary tabs.
// Desktop topbar remains hidden as desktop uses the sidebar.
export default function Header({ center }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/portal");
    }
  };

  const isSecondary =
    path === "/students" ||
    path === "/divisions" ||
    path === "/settings" ||
    path === "/more";

  const getPageTitle = () => {
    if (path === "/students") return "Students";
    if (path === "/divisions") return "Divisions";
    if (path === "/settings") return "Settings";
    if (path === "/more") return "More";
    return center?.name || "rollbeecall.online";
  };

  return (
    <header className="office-topbar" aria-label="Mobile Header">
      {isSecondary ? (
        <div className="topbar-secondary-wrap">
          <button
            type="button"
            className="topbar-back-btn"
            onClick={handleBack}
            aria-label="Go back to previous page"
          >
            <Icon name="arrowLeft" size={20} />
          </button>
          <h1 className="topbar-page-title">{getPageTitle()}</h1>
        </div>
      ) : (
        <div className="office-brand">
          <span className="brand-logo brand-logo--sm">
            <Icon name="logo" size={18} />
          </span>
          <b>{center?.name}</b>
        </div>
      )}
    </header>
  );
}


