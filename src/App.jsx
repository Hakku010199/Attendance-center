import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout.jsx";
import { OnboardingRoute, ProtectedRoute, PublicRoute } from "./components/auth/RouteGuards.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Divisions from "./pages/Divisions.jsx";
import Students from "./pages/Students.jsx";
import Attendance from "./pages/Attendance.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";
import More from "./pages/More.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import { supabase } from "./lib/supabase.js";

const Portal = ({ children }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

// Intercepts password recovery redirects from any entry route (such as / or Site URL)
function RecoveryInterceptor() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/reset-password" || location.pathname === "/auth/callback") {
      return;
    }

    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isRecovery =
      search.includes("type=recovery") ||
      hash.includes("type=recovery") ||
      search.includes("error_code=otp_expired") ||
      hash.includes("error_code=otp_expired");

    if (isRecovery) {
      navigate(`/reset-password${search}${hash}`, { replace: true });
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate, location]);

  return null;
}

export default function App() {
  return (
    <>
      <RecoveryInterceptor />
      <Routes>
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<OnboardingRoute><Onboarding /></OnboardingRoute>} />

      {/* Canonical dashboard route */}
      <Route path="/portal" element={<Portal><Dashboard /></Portal>} />
      <Route path="/divisions" element={<Portal><Divisions /></Portal>} />
      <Route path="/students" element={<Portal><Students /></Portal>} />
      <Route path="/attendance" element={<Portal><Attendance /></Portal>} />
      <Route path="/daily-attendance" element={<Portal><Attendance /></Portal>} />
      <Route path="/reports" element={<Portal><Reports /></Portal>} />
      <Route path="/settings" element={<Portal><Settings /></Portal>} />
      <Route path="/more" element={<Portal><More /></Portal>} />

      {/* Legacy dashboard path still works */}
      <Route path="/" element={<Portal><Dashboard /></Portal>} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
    </>
  );
}

