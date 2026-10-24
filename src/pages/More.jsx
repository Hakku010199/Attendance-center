import { useNavigate } from "react-router-dom";
import Icon from "../components/common/Icon.jsx";
import { usePortal } from "../components/layout/AppLayout.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function More() {
  const { center, user, signOut } = usePortal();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (signOut) await signOut();
    navigate("/login", { replace: true });
  };

  const MANAGEMENT_ITEMS = [
    {
      to: "/students",
      icon: "students",
      label: "Students",
      description: "Manage students, roll numbers, and bulk import",
    },
    {
      to: "/divisions",
      icon: "divisions",
      label: "Divisions",
      description: "Manage class divisions and active statuses",
    },
    {
      to: "/teachers",
      icon: "teacher",
      label: "Teachers",
      description: "Manage teachers, user IDs, passwords, and assigned divisions",
    },
  ];

  return (
    <div className="more-page-container">
      {/* Center Profile Banner */}
      <section className="card more-profile-card">
        <div className="more-profile-avatar">
          <Icon name="logo" size={26} />
        </div>
        <div className="more-profile-info">
          <h2 className="more-center-name">{center.name}</h2>
          <p className="more-user-role">
            <span className="more-role-chip">{user.role}</span>
            <span className="more-user-email">{user.email}</span>
          </p>
        </div>
      </section>

      {/* Management Section */}
      <section className="more-section">
        <h3 className="more-section-title">Management</h3>
        <div className="more-list">
          {MANAGEMENT_ITEMS.map((item) => (
            <button
              key={item.to}
              type="button"
              className="more-item-btn"
              onClick={() => navigate(item.to)}
            >
              <div className="more-item-icon-wrap">
                <Icon name={item.icon} size={20} />
              </div>
              <div className="more-item-text">
                <strong className="more-item-title">{item.label}</strong>
                <span className="more-item-desc">{item.description}</span>
              </div>
              <span className="more-item-arrow" aria-hidden="true">
                <Icon name="chevron" size={16} />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Settings Section */}
      <section className="more-section">
        <h3 className="more-section-title">Settings</h3>
        <div className="more-list">
          <button
            type="button"
            className="more-item-btn"
            onClick={() => navigate("/settings")}
          >
            <div className="more-item-icon-wrap">
              <Icon name="settings" size={20} />
            </div>
            <div className="more-item-text">
              <strong className="more-item-title">Center Settings</strong>
              <span className="more-item-desc">Center address, contact details, and account setup</span>
            </div>
            <span className="more-item-arrow" aria-hidden="true">
              <Icon name="chevron" size={16} />
            </span>
          </button>

          <button type="button" className="more-item-btn" onClick={toggleTheme}>
            <div className="more-item-icon-wrap">
              <Icon name={theme === "light" ? "moon" : "sun"} size={20} />
            </div>
            <div className="more-item-text">
              <strong className="more-item-title">Theme</strong>
              <span className="more-item-desc">
                Current: {theme === "light" ? "Light Mode" : "Dark Mode"} (Tap to toggle)
              </span>
            </div>
            <span className="more-theme-pill">
              {theme === "light" ? "Light" : "Dark"}
            </span>
          </button>

          <button
            type="button"
            className="more-item-btn more-item-btn--danger"
            onClick={handleSignOut}
          >
            <div className="more-item-icon-wrap more-item-icon-wrap--danger">
              <Icon name="logout" size={20} />
            </div>
            <div className="more-item-text">
              <strong className="more-item-title more-item-title--danger">Sign Out</strong>
              <span className="more-item-desc">End your current session on this device</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}

