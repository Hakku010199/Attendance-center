import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { LoadingScreen } from "../auth/RouteGuards.jsx";
import { ATTENDANCE_UPDATED, DIVISIONS_UPDATED } from "../../utils/events.js";

const PortalContext = createContext(null);
// Center + user come from Supabase session (center_members). Never chosen by the user.
export const usePortal = () => useContext(PortalContext);

// Office-style shell: sidebar + <main> content, with cross-module sync.
// attendanceRefreshKey / divisionsKey bump on window events so Daily + History
// + division dropdowns refetch without a page reload.
export default function AppLayout({ children }) {
  const { user, center, membership, signOut, refreshCenter } = useAuth();
  const [open, setOpen] = useState(false);
  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [divisionsKey, setDivisionsKey] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

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

  if (!center || !user) return <LoadingScreen />;

  const portalUser = {
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Owner",
    email: user.email,
    role: membership?.role === "owner" ? "Center Owner" : membership?.role || "Member",
  };

  return (
    <PortalContext.Provider value={{ center, user: portalUser, authUser: user, membership, signOut, reload: refreshCenter, attendanceRefreshKey, divisionsKey }}>
      <div className="app">
        <Sidebar center={center} user={portalUser} open={open} onClose={() => setOpen(false)} onSignOut={signOut} />
        <div className="main">
          <Header center={center} user={portalUser} onMenu={() => setOpen(true)} onSignOut={signOut} />
          <main className="content">{children}</main>
        </div>
      </div>
    </PortalContext.Provider>
  );
}


