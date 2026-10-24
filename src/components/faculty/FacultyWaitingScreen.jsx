import { useEffect, useState } from "react";
import Icon from "../common/Icon.jsx";
import { formatTime12h, getCurrentTimeInZone } from "../../utils/timeSettings.js";
import "../../styles/facultyWaiting.css";

/**
 * FacultyWaitingScreen
 * Displayed when a faculty member's center has time restrictions enabled
 * and the current time is outside the permitted daily access window.
 * Avoids asking already logged-in faculty to re-enter credentials.
 */
export default function FacultyWaitingScreen({
  teacher,
  center,
  timeCheck,
  onRefresh,
  onEnter,
  onSignOut,
}) {
  const timezone = center?.timezone || timeCheck?.timezone || "Asia/Kolkata";
  const [currentClock, setCurrentClock] = useState(() => {
    const t = getCurrentTimeInZone(timezone);
    return `${String(t.hour % 12 || 12).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:${String(t.second).padStart(2, "0")} ${t.hour >= 12 ? "PM" : "AM"}`;
  });

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const t = getCurrentTimeInZone(timezone);
      setCurrentClock(
        `${String(t.hour % 12 || 12).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:${String(t.second).padStart(2, "0")} ${t.hour >= 12 ? "PM" : "AM"}`
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [timezone]);

  const handleCheckNow = async () => {
    setRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => setRefreshing(false), 600);
  };

  const isAllowed = Boolean(timeCheck?.allowed);
  const isBefore = timeCheck?.reason === "before";
  const startStr = formatTime12h(center?.faculty_start_time || timeCheck?.formattedStart || "07:00");
  const endStr = formatTime12h(center?.faculty_end_time || timeCheck?.formattedEnd || "10:00");

  return (
    <div className="faculty-waiting-wrap" role="status" aria-live="polite">
      <div className="faculty-waiting-card">
        {/* Warning Title & Message */}
        <h2 className="faculty-waiting-title">
          {isAllowed
            ? "Operating Window is Open"
            : isBefore
            ? "Operating Hours Not Started"
            : "Attendance Window Closed"}
        </h2>

        {isAllowed ? (
          <div className="faculty-waiting-alert-box faculty-waiting-alert-box--open">
            <Icon name="checkCircle" size={20} />
            <div className="faculty-waiting-alert-text">
              <strong>Attendance window is currently active ({startStr} – {endStr}).</strong>
              <p>Your session is active. Click below to open your faculty attendance portal.</p>
            </div>
          </div>
        ) : (
          <div className="faculty-waiting-alert-box">
            <Icon name="clock" size={20} />
            <div className="faculty-waiting-alert-text">
              <strong>
                {isBefore
                  ? `Faculty login opens at ${startStr}.`
                  : "Faculty attendance access has closed for today."}
              </strong>
              <p>
                {isBefore
                  ? "Please wait until the configured operating hours begin. You do not need to re-enter your credentials."
                  : "The attendance window for today has concluded. Access will reopen during tomorrow's scheduled hours."}
              </p>
            </div>
          </div>
        )}

        {/* Operating Window Details */}
        <div className="faculty-waiting-details-grid">
          <div className="waiting-detail-item">
            <span className="waiting-detail-label">Current Time ({timezone})</span>
            <span className="waiting-detail-value waiting-detail-clock">{currentClock}</span>
          </div>

          <div className="waiting-detail-item">
            <span className="waiting-detail-label">Daily Permitted Hours</span>
            <span className="waiting-detail-value waiting-detail-window">
              <Icon name="clock" size={14} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px" }} />
              {startStr} – {endStr}
            </span>
          </div>
        </div>

        {/* Actions */}
        {isAllowed && (
          <div className="faculty-waiting-actions">
            <button
              type="button"
              className="btn btn--primary btn-open-portal"
              onClick={onEnter}
            >
              <span>Open Faculty Portal</span>
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

