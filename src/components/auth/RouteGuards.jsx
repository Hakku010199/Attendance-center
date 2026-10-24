import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { isCenterInactive, CENTER_INACTIVE_MSG } from "../../services/authService.js";
import { getFacultySession } from "../../services/facultyAuthService.js";
import { checkFacultyAccessTime } from "../../utils/timeSettings.js";
import LoadingIcon from "../common/LoadingIcon.jsx";

export function LoadingScreen() {
  return (
    <div className="auth-wrap" aria-busy="true">
      <div className="auth-card auth-card--narrow">
        <div className="auth-brand"><span className="auth-logo">RBC</span></div>
        <h2>Loading your portal…</h2>
        <p className="muted">Checking your session and center.</p>
        <LoadingIcon size={100} />
      </div>
    </div>
  );
}

// Public pages: redirect authenticated users to their correct destination.
export function PublicRoute({ children }) {
  const { loading, isAuthenticated, center, membership } = useAuth();

  // If a recovery link landed on a public route, hold here until the interceptor or ResetPassword processes it
  if (typeof window !== "undefined") {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (hash.includes("type=recovery") || search.includes("type=recovery")) {
      return <LoadingScreen />;
    }
  }

  if (loading) return <LoadingScreen />;
  if (isAuthenticated) {
    if (center && isCenterInactive(center)) return children;
    if (!membership) return <Navigate to="/onboarding" replace />;
    if (center?.onboarding_completed === true) return <Navigate to="/portal" replace />;
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

// Authenticated pages that require a completed center.
export function ProtectedRoute({ children, from }) {
  const { loading, isAuthenticated, centerLoading, center, membership, signOut } = useAuth();
  if (loading || (centerLoading && !center)) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: from || "/portal", returnTo: from || "/portal" }} />;
  if (center && isCenterInactive(center)) {
    if (signOut) signOut();
    return <Navigate to="/login" replace state={{ error: CENTER_INACTIVE_MSG }} />;
  }
  if (!membership || center?.onboarding_completed !== true) return <Navigate to="/onboarding" replace />;
  return children;
}

// Dedicated Faculty Route: protects /faculty and directs unauthenticated users to faculty login
export function FacultyRoute({ children }) {
  const { loading, isAuthenticated, centerLoading, center, membership, signOut } = useAuth();
  const facultySession = getFacultySession();

  // If faculty is logged in via User ID and Password
  if (facultySession?.teacher && facultySession?.center) {
    return children;
  }

  // If center admin is logged in
  if (loading || (centerLoading && !center)) return <LoadingScreen />;
  if (isAuthenticated && membership && center?.onboarding_completed === true) {
    if (isCenterInactive(center)) {
      if (signOut) signOut();
      return <Navigate to="/faculty/login" replace state={{ error: CENTER_INACTIVE_MSG }} />;
    }
    return children;
  }

  // Direct unauthenticated faculty users to the dedicated Faculty Login
  return <Navigate to="/faculty/login" replace />;
}

// Authenticated pages that do NOT require a completed center (onboarding itself).
export function OnboardingRoute({ children }) {
  const { loading, isAuthenticated, centerLoading, center, membership, signOut } = useAuth();
  if (loading || (centerLoading && !center)) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (center && isCenterInactive(center)) {
    if (signOut) signOut();
    return <Navigate to="/login" replace state={{ error: CENTER_INACTIVE_MSG }} />;
  }
  if (membership && center?.onboarding_completed === true) return <Navigate to="/portal" replace />;
  return children;
}
