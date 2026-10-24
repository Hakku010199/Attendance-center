import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Icon from "../components/common/Icon.jsx";
import { loginFaculty, getFacultySession, logoutFaculty } from "../services/facultyAuthService.js";
import { supabase } from "../lib/supabase.js";
import { checkFacultyAccessTime } from "../utils/timeSettings.js";
import FacultyWaitingScreen from "../components/faculty/FacultyWaitingScreen.jsx";
import { useToast } from "../components/common/Toast.jsx";
import "../styles/facultyLogin.css";

export default function FacultyLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [existingSession, setExistingSession] = useState(() => getFacultySession());
  const [switchAccount, setSwitchAccount] = useState(false);

  // Single Login Form State
  const [centerNo, setCenterNo] = useState(
    () => location.state?.centerNo ?? existingSession?.center?.center_number ?? ""
  );
  const [userId, setUserId] = useState(
    () => location.state?.userId ?? existingSession?.teacher?.userId ?? ""
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [timeWarning, setTimeWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(() => location.state?.error || "");

  // If already logged in, evaluate access time
  const isAlreadyLoggedIn = Boolean(
    !switchAccount && existingSession?.teacher && existingSession?.center
  );

  const [checkingExisting, setCheckingExisting] = useState(isAlreadyLoggedIn);
  const [liveExistingCenter, setLiveExistingCenter] = useState(() => existingSession?.center || null);
  const [liveExistingTimeCheck, setLiveExistingTimeCheck] = useState(() =>
    isAlreadyLoggedIn ? checkFacultyAccessTime(existingSession.center) : { allowed: true }
  );

  // When loading with an existing session, always fetch live center settings from Supabase
  useEffect(() => {
    if (!isAlreadyLoggedIn || !existingSession?.center?.id) {
      setCheckingExisting(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const { data: fresh } = await supabase
          .from("centers")
          .select("id, name, slug, center_number, status, faculty_time_restriction_enabled, faculty_start_time, faculty_end_time, timezone")
          .eq("id", existingSession.center.id)
          .maybeSingle();

        if (!isMounted) return;

        const centerToUse = fresh || existingSession.center;
        if (fresh) {
          setLiveExistingCenter(fresh);
          const updated = {
            ...existingSession,
            center: {
              ...existingSession.center,
              ...fresh,
            },
          };
          setExistingSession(updated);
          try {
            localStorage.setItem("rbc_faculty_session", JSON.stringify(updated));
          } catch {}
        }

        const check = checkFacultyAccessTime(centerToUse);
        setLiveExistingTimeCheck(check);
        setCheckingExisting(false);

        if (check.allowed) {
          navigate("/faculty", { replace: true });
        }
      } catch (err) {
        if (isMounted) setCheckingExisting(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAlreadyLoggedIn, existingSession?.center?.id, navigate]);

  useEffect(() => {
    if (location.state?.error) {
      setError(location.state.error);
    }
    if (location.state?.centerNo) {
      setCenterNo(String(location.state.centerNo));
    }
    if (location.state?.userId) {
      setUserId(String(location.state.userId));
    }
  }, [location.state]);

  // Handle re-checking operating hours for already logged-in faculty
  const handleRefreshExistingTime = async () => {
    if (!existingSession?.center?.id) return;
    try {
      const { data: fresh } = await supabase
        .from("centers")
        .select("*")
        .eq("id", existingSession.center.id)
        .maybeSingle();

      const c = fresh || existingSession.center;
      if (fresh) {
        const updated = { ...existingSession, center: fresh };
        setExistingSession(updated);
        try {
          localStorage.setItem("rbc_faculty_session", JSON.stringify(updated));
        } catch {}
      }

      const check = checkFacultyAccessTime(c);
      if (check.allowed) {
        navigate("/faculty", { replace: true });
      }
    } catch (e) {
      console.warn("[FacultyLogin] refresh warning:", e);
    }
  };

  const handleSignOutExisting = () => {
    logoutFaculty();
    setExistingSession(null);
    setSwitchAccount(true);
    setError("");
    setTimeWarning(null);
  };

  // Single Form Submit: Center No + User ID + Password
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setTimeWarning(null);

    const trimmedCenterNo = String(centerNo ?? "").trim();
    const trimmedUserId = String(userId ?? "").trim();
    const trimmedPassword = String(password ?? "").trim();

    if (!trimmedCenterNo) {
      setError("Please enter your Center No (e.g. 101).");
      return;
    }
    if (!trimmedUserId) {
      setError("Please enter your User ID / Username.");
      return;
    }
    if (!trimmedPassword) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);

    try {
      // 1. Resolve Center by center_number or slug/name
      const num = parseInt(trimmedCenterNo, 10);
      let resolvedCenter = null;

      if (!isNaN(num)) {
        const { data, error: qErr } = await supabase
          .from("centers")
          .select("*")
          .eq("center_number", num)
          .maybeSingle();
        if (!qErr && data) resolvedCenter = data;
      }

      if (!resolvedCenter) {
        const { data } = await supabase
          .from("centers")
          .select("*")
          .or(`slug.eq.${trimmedCenterNo},name.ilike.${trimmedCenterNo}`)
          .limit(1)
          .maybeSingle();
        if (data) resolvedCenter = data;
      }

      if (!resolvedCenter) {
        setError(`Center No. "${trimmedCenterNo}" could not be found. Please contact your center administrator.`);
        setSubmitting(false);
        return;
      }

      if (resolvedCenter.status === "inactive") {
        setError("Your center is currently inactive. Please contact center administration.");
        setSubmitting(false);
        return;
      }

      // 2. Check Operating Hours
      const timeCheck = checkFacultyAccessTime(resolvedCenter);
      if (!timeCheck.allowed) {
        // Outside time limit: Show warning message and do not authenticate
        setTimeWarning({
          message: timeCheck.message,
          reason: timeCheck.reason,
          formattedStart: timeCheck.formattedStart,
          formattedEnd: timeCheck.formattedEnd,
          timezone: timeCheck.timezone,
          centerName: resolvedCenter.name,
        });
        setSubmitting(false);
        return;
      }

      // 3. Authenticate Teacher credentials
      const result = await loginFaculty({
        centerNo: resolvedCenter.center_number || trimmedCenterNo,
        userId: trimmedUserId,
        password: trimmedPassword,
        rememberMe,
      });

      if (result.error) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      toast(`Welcome, ${result.teacher?.name || result.teacher?.userId}!`);
      navigate("/faculty", { replace: true });
    } catch (err) {
      setError(err.message || "An unexpected error occurred during sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  // 1. ALREADY LOGGED IN FACULTY:
  if (isAlreadyLoggedIn) {
    if (checkingExisting) {
      return (
        <div className="faculty-auth-wrap">
          <div className="faculty-auth-card" style={{ textAlign: "center", padding: "40px 20px" }}>
            <span className="faculty-auth-badge" aria-hidden="true" style={{ margin: "0 auto 16px" }}>RB</span>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "8px" }}>Checking operating hours…</h2>
            <p className="muted" style={{ margin: 0 }}>Verifying your center access time.</p>
          </div>
        </div>
      );
    }

    if (!liveExistingTimeCheck.allowed) {
      return (
        <div className="faculty-auth-wrap">
          <div className="faculty-auth-topbar">
            <Link to="/" className="faculty-auth-back-btn" title="Back to portal selection">
              <Icon name="arrowLeft" size={16} />
              <span>Back to Portal</span>
            </Link>
          </div>
          <FacultyWaitingScreen
            teacher={existingSession.teacher}
            center={liveExistingCenter || existingSession.center}
            timeCheck={liveExistingTimeCheck}
            onRefresh={handleRefreshExistingTime}
            onSignOut={handleSignOutExisting}
          />
        </div>
      );
    }
  }

  // 2. NEW LOGIN FLOW: Single Form for Center No, Username, and Password
  return (
    <div className="faculty-auth-wrap">
      {/* Top back button */}
      <div className="faculty-auth-topbar">
        <Link to="/" className="faculty-auth-back-btn" title="Back to portal selection">
          <Icon name="arrowLeft" size={16} />
          <span>Back to Portal</span>
        </Link>
      </div>

      <div className="faculty-auth-card">
        {/* Brand Header */}
        <div className="faculty-auth-header">
          <span className="faculty-auth-badge" aria-hidden="true">RB</span>
          <span className="faculty-auth-eyebrow">Attendance Portal</span>
          <h1 className="faculty-auth-title">Faculty Sign In</h1>
          <p className="faculty-auth-subtitle">
            Enter your Center No and credentials to sign in
          </p>
        </div>

        {/* General Error Alert */}
        {error && (
          <div className="faculty-auth-error" role="alert">
            <Icon name={error.includes("opens at") || error.includes("closed for today") ? "clock" : "alert"} size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Warning Message Box if outside operating hours */}
        {timeWarning && (
          <div className="faculty-waiting-alert-box" role="alert" style={{ marginBottom: "20px" }}>
            <Icon name="clock" size={20} />
            <div className="faculty-waiting-alert-text">
              <strong>{timeWarning.message}</strong>
              <p>
                {timeWarning.reason === "before"
                  ? "Please wait until the configured operating hours begin. Login and attendance access will open at that time."
                  : "The attendance access window for today has concluded. Access will reopen during tomorrow's scheduled hours."}
              </p>
              <div
                style={{
                  marginTop: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(99, 85, 246, 0.2)",
                  border: "1px solid rgba(99, 85, 246, 0.4)",
                  borderRadius: "8px",
                  padding: "4px 10px",
                  color: "#a5b4fc",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                }}
              >
                <Icon name="clock" size={14} />
                <span>{timeWarning.formattedStart} – {timeWarning.formattedEnd}</span>
              </div>
            </div>
          </div>
        )}

        {/* Single Form: Center No + User ID + Password */}
        <form onSubmit={handleSignIn} className="faculty-auth-form" noValidate>
          <div className="field">
            <label htmlFor="faculty-center-no">Center No</label>
            <div className="control-wrap has-icon-left">
              <span className="control-icon-left" aria-hidden="true">
                <Icon name="building" size={16} />
              </span>
              <input
                id="faculty-center-no"
                type="text"
                inputMode="numeric"
                className={`control ${error && !centerNo.trim() ? "control--error" : ""}`}
                value={centerNo}
                onChange={(e) => {
                  setCenterNo(e.target.value);
                  if (error) setError("");
                  if (timeWarning) setTimeWarning(null);
                }}
                autoFocus
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="faculty-user-id">User ID / Username</label>
            <div className="control-wrap has-icon-left">
              <span className="control-icon-left" aria-hidden="true">
                <Icon name="userCheck" size={16} />
              </span>
              <input
                id="faculty-user-id"
                type="text"
                autoComplete="username"
                className={`control ${error && !userId.trim() ? "control--error" : ""}`}
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  if (error) setError("");
                }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="faculty-password">Password</label>
            <div className="control-wrap has-icon-left has-icon-right">
              <span className="control-icon-left" aria-hidden="true">
                <Icon name="lock" size={16} />
              </span>
              <input
                id="faculty-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className={`control ${error && !password.trim() ? "control--error" : ""}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
              />
              <button
                type="button"
                className="control-icon-right password-toggle"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <label className="faculty-auth-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Stay signed in for 2 weeks</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="faculty-auth-submit-btn"
          >
            {submitting ? (
              <span>Signing in…</span>
            ) : (
              <>
                <span>Sign In to Attendance</span>
                <Icon name="arrowRight" size={16} />
              </>
            )}
          </button>
        </form>

        <footer className="faculty-auth-footer">
          <span>Faculty credentials are assigned by your center administrator.</span>
        </footer>
      </div>
    </div>
  );
}
