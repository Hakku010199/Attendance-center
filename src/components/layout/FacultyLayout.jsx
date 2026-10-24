import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PortalContext } from "./AppLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { getFacultySession, logoutFaculty } from "../../services/facultyAuthService.js";
import { LoadingScreen } from "../auth/RouteGuards.jsx";
import Icon from "../common/Icon.jsx";
import { ATTENDANCE_UPDATED, DIVISIONS_UPDATED } from "../../utils/events.js";
import { useTheme } from "../../context/ThemeContext.jsx";
import { supabase } from "../../lib/supabase.js";
import { formatTime12h, checkFacultyAccessTime } from "../../utils/timeSettings.js";
import FacultyWaitingScreen from "../faculty/FacultyWaitingScreen.jsx";
import "../../styles/faculty.css";

export default function FacultyLayout({ children }) {
  const navigate = useNavigate();
  const { user, center, membership, signOut, refreshCenter } = useAuth();
  const facultySession = getFacultySession();

  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [divisionsKey, setDivisionsKey] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    const onAttendance = () => setAttendanceRefreshKey((k) => k + 1);
    const onDivisions = () => setDivisionsKey((k) => k + 1);
    window.addEventListener(ATTENDANCE_UPDATED, onAttendance);
    window.addEventListener(DIVISIONS_UPDATED, onDivisions);
    return () => {
      window.removeEventListener(ATTENDANCE_UPDATED, onAttendance);
      window.removeEventListener(DIVISIONS_UPDATED, onDivisions);
    };
  }, []);

  const isTeacherSession = Boolean(facultySession?.teacher && facultySession?.center);
  const [liveCenter, setLiveCenter] = useState(isTeacherSession ? facultySession.center : center);
  const [checkingInitial, setCheckingInitial] = useState(isTeacherSession);
  const [timeCheckState, setTimeCheckState] = useState(() =>
    isTeacherSession ? checkFacultyAccessTime(facultySession.center) : { allowed: true }
  );

  const verifyAccessTime = useCallback(async () => {
    if (!isTeacherSession || !facultySession?.center?.id) {
      setCheckingInitial(false);
      return;
    }
    try {
      const { data: cData } = await supabase
        .from("centers")
        .select("id, name, center_number, status, faculty_time_restriction_enabled, faculty_start_time, faculty_end_time, timezone")
        .eq("id", facultySession.center.id)
        .maybeSingle();

      const centerToCheck = cData || facultySession.center;
      if (cData) {
        setLiveCenter(cData);
        try {
          const freshSession = {
            ...facultySession,
            center: {
              ...facultySession.center,
              ...cData,
            },
          };
          localStorage.setItem("rbc_faculty_session", JSON.stringify(freshSession));
        } catch {}
      }

      if (centerToCheck?.status === "inactive") {
        logoutFaculty();
        navigate("/faculty/login", {
          replace: true,
          state: { error: "Your center is currently inactive. Please contact center administration." },
        });
        return;
      }

      const check = checkFacultyAccessTime(centerToCheck);
      setTimeCheckState(check);
    } catch (err) {
      console.warn("[FacultyLayout] verifyAccessTime warning:", err);
    } finally {
      setCheckingInitial(false);
    }
  }, [isTeacherSession, facultySession, navigate]);

  // Validate center operating hours in real-time even if session was saved earlier
  useEffect(() => {
    if (!isTeacherSession) return;
    verifyAccessTime();
    const interval = setInterval(verifyAccessTime, 10000);
    return () => clearInterval(interval);
  }, [isTeacherSession, verifyAccessTime]);

  const activeCenter = liveCenter || (isTeacherSession ? facultySession.center : center);
  const activeUser = isTeacherSession
    ? {
        name: facultySession.teacher.name || facultySession.teacher.userId,
        email: facultySession.teacher.userId,
        role: "Teacher",
      }
    : user
    ? {
        name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Faculty",
        email: user.email,
        role: "Faculty Staff",
      }
    : null;

  if (checkingInitial || !activeCenter || !activeUser) return <LoadingScreen />;

  const handleSignOut = async () => {
    if (isTeacherSession) {
      logoutFaculty();
      navigate("/faculty/login", { replace: true });
    } else {
      if (signOut) await signOut();
      navigate("/", { replace: true });
    }
  };

  return (
    <PortalContext.Provider
      value={{
        center: activeCenter,
        user: activeUser,
        authUser: user || null,
        teacher: facultySession?.teacher || null,
        membership,
        signOut: handleSignOut,
        reload: refreshCenter,
        attendanceRefreshKey,
        divisionsKey,
      }}
    >
      <div className={`app faculty-app ${theme === "light" ? "theme-light" : "theme-dark"}`}>
        {/* Sleek Faculty Top Navigation Bar */}
        <header className="faculty-topbar" aria-label="Faculty Navigation">
          <div className="faculty-topbar-left">
            <Link to="/" className="faculty-brand-link" title="Exit to Portal Choice">
              <span className="faculty-logo-badge">RB</span>
              <span className="faculty-brand-name">RollBee</span>
            </Link>
            <span className="faculty-role-pill">
              <Icon name="userCheck" size={14} />
              <span>{isTeacherSession ? activeUser.name : "Faculty Portal"}</span>
            </span>
            {activeCenter?.name && (
              <span className="faculty-center-tag" title={activeCenter.name}>
                <Icon name="building" size={13} />
                <span>{activeCenter.name}</span>
              </span>
            )}
          </div>

          <div className="faculty-topbar-right">
            <Link
              to="/"
              className="faculty-nav-btn faculty-nav-btn--exit"
              title="Return to portal selection"
            >
              <Icon name="arrowLeft" size={14} />
              <span className="faculty-btn-text">Portal Selector</span>
            </Link>

            <button
              type="button"
              className="faculty-nav-btn faculty-nav-btn--signout"
              onClick={handleSignOut}
              title="Sign out of your account"
            >
              <Icon name="logout" size={14} />
              <span className="faculty-btn-text">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Dedicated Attendance Marking Content */}
        <div className="main faculty-main">
          <main className="content faculty-content">
            {isTeacherSession && !timeCheckState.allowed ? (
              <FacultyWaitingScreen
                teacher={facultySession.teacher}
                center={activeCenter}
                timeCheck={timeCheckState}
                onRefresh={verifyAccessTime}
                onSignOut={handleSignOut}
              />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </PortalContext.Provider>
  );
}

