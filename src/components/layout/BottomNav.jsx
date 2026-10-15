import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../common/Icon.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "house", to: "/portal" },
  { id: "attendance", label: "Attendance", icon: "handCheck", to: "/attendance" },
  { id: "daily", label: "Daily", icon: "calendarDays", to: "/daily-attendance" },
  { id: "reports", label: "Reports", icon: "bookOpen", to: "/reports" },
  { id: "more", label: "More", icon: "wrench", to: "/more" },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const isItemActive = (item) => {
    if (item.id === "dashboard") {
      return pathname === "/portal" || pathname === "/";
    }
    if (item.id === "attendance") {
      return pathname === "/attendance";
    }
    if (item.id === "daily") {
      return pathname === "/daily-attendance";
    }
    if (item.id === "reports") {
      return pathname === "/reports";
    }
    if (item.id === "more") {
      return (
        pathname === "/more" ||
        pathname === "/students" ||
        pathname === "/divisions" ||
        pathname === "/settings"
      );
    }
    return false;
  };

  const navContent = (
    <nav
      className={`mobile-bottom-nav ${theme === "light" ? "mobile-bottom-nav--light" : ""}`}
      aria-label="Mobile Navigation"
    >
      <div className="mobile-bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(item);
          return (
            <button
              key={item.id}
              type="button"
              className={`bottom-nav-item ${active ? "bottom-nav-item--active" : ""}`}
              onClick={() => navigate(item.to)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <span className="bottom-nav-icon-wrap">
                <Icon name={item.icon} size={22} />
              </span>
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  if (typeof document !== "undefined") {
    return createPortal(navContent, document.body);
  }
  return navContent;
}


