import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { isCenterInactive, CENTER_INACTIVE_MSG } from "../../services/authService.js";

export function LoadingScreen() {
  return (
    <div className="auth-wrap" aria-busy="true">
      <div className="auth-card auth-card--narrow">
        <div className="auth-brand"><span className="auth-logo">CP</span></div>
        <h2>Loading your portal…</h2>
        <p className="muted">Checking your session and center.</p>
        <div className="spinner" aria-hidden="true" />
      </div>
    </div>
  );
}

// Public pages: redirect authenticated users to their correct destination.
export function PublicRoute({ children }) {
  const { loading, isAuthenticated, center, membership } = useAuth();
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
  if (loading || centerLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: from || "/portal" }} />;
  if (center && isCenterInactive(center)) {
    if (signOut) signOut();
    return <Navigate to="/login" replace state={{ error: CENTER_INACTIVE_MSG }} />;
  }
  if (!membership || center?.onboarding_completed !== true) return <Navigate to="/onboarding" replace />;
  return children;
}

// Authenticated pages that do NOT require a completed center (onboarding itself).
export function OnboardingRoute({ children }) {
  const { loading, isAuthenticated, centerLoading, center, membership, signOut } = useAuth();
  if (loading || centerLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (center && isCenterInactive(center)) {
    if (signOut) signOut();
    return <Navigate to="/login" replace state={{ error: CENTER_INACTIVE_MSG }} />;
  }
  if (membership && center?.onboarding_completed === true) return <Navigate to="/portal" replace />;
  return children;
}
