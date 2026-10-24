import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getFacultySession, logoutFaculty } from "../services/facultyAuthService.js";
import Icon from "../components/common/Icon.jsx";
import "../styles/portalSelector.css";

export default function PortalSelector() {
  const navigate = useNavigate();
  const { user, center, isAuthenticated, signOut } = useAuth();
  const facultySession = getFacultySession();

  const isTeacher = Boolean(facultySession?.teacher && facultySession?.center);

  const handleSelectCenter = () => {
    if (isAuthenticated) {
      navigate("/portal");
    } else {
      navigate("/login", { state: { returnTo: "/portal", role: "center" } });
    }
  };

  const handleSelectFaculty = () => {
    if (isTeacher || isAuthenticated) {
      navigate("/faculty");
    } else {
      navigate("/faculty/login");
    }
  };

  const handleSignOut = async () => {
    if (isTeacher) {
      logoutFaculty();
      navigate("/", { replace: true });
    } else if (signOut) {
      await signOut();
    }
  };

  return (
    <div className="selector-page">
      <div className="selector-container">
        {/* Brand & Introduction */}
        <header className="selector-header">
          <div className="selector-brand">
            <span className="selector-brand-badge" aria-hidden="true">RB</span>
            <div className="selector-brand-text">
              <span className="selector-brand-title">RollBee</span>
              <span className="selector-brand-domain">rollbeecall.online</span>
            </div>
          </div>
          <h1 className="selector-hero-title">Select Your Portal</h1>
        </header>

        {/* 2 Interactive Options: Center & Faculty */}
        <div className="selector-grid" role="group" aria-label="Portal Selection Options">
          {/* Option 1: Center Portal */}
          <div
            className="portal-card portal-card--center"
            onClick={handleSelectCenter}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelectCenter();
              }
            }}
            aria-label="Open Center Portal"
          >
            <div className="portal-card-top">
              <div className="portal-card-icon-row">
                <span className="portal-card-icon-badge">
                  <Icon name="building" size={26} />
                </span>
              </div>
              <h2 className="portal-card-title">Center</h2>
            </div>

            <button
              type="button"
              className="portal-card-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectCenter();
              }}
            >
              <span>Enter Center Portal</span>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>

          {/* Option 2: Faculty Portal */}
          <div
            className="portal-card portal-card--faculty"
            onClick={handleSelectFaculty}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelectFaculty();
              }
            }}
            aria-label="Open Faculty Portal"
          >
            <div className="portal-card-top">
              <div className="portal-card-icon-row">
                <span className="portal-card-icon-badge">
                  <Icon name="userCheck" size={26} />
                </span>
              </div>
              <h2 className="portal-card-title">Faculty</h2>
            </div>

            <button
              type="button"
              className="portal-card-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectFaculty();
              }}
            >
              <span>Enter Faculty Attendance</span>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        </div>

        {/* User Status / Account Options */}
        {isTeacher ? (
          <div className="selector-session-bar">
            <span className="selector-session-info">
              <Icon name="userCheck" size={16} />
              <span>
                Signed in as Teacher: <strong>{facultySession.teacher.name || facultySession.teacher.userId}</strong>
                {facultySession.center?.name ? ` • ${facultySession.center.name}` : ""}
              </span>
            </span>
            <button
              type="button"
              className="selector-signout-link"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        ) : isAuthenticated && user ? (
          <div className="selector-session-bar">
            <span className="selector-session-info">
              <Icon name="checkCircle" size={16} />
              <span>
                Signed in as <strong>{user.email}</strong>
                {center?.name ? ` • ${center.name}` : ""}
              </span>
            </span>
            <button
              type="button"
              className="selector-signout-link"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="selector-footer-links">
            <span>Need to set up a new center?</span>
            <Link to="/register" className="selector-footer-link">
              Create Center Account →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

