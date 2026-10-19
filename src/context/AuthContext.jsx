import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { getCurrentUserCenter } from "../services/centerService.js";
import { logoutUser, isCenterInactive, CENTER_INACTIVE_MSG } from "../services/authService.js";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

// Centralized auth state. Supabase session is the source of truth.
// Listens to SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / USER_UPDATED.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [center, setCenter] = useState(null);
  const [membership, setMembership] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [centerLoading, setCenterLoading] = useState(false);
  const [centerError, setCenterError] = useState("");

  const centerRef = useRef(center);
  centerRef.current = center;

  const loadCenter = useCallback(async (userId) => {
    if (!userId) {
      setCenter(null);
      setMembership(null);
      return { center: null, membership: null };
    }
    // Only set centerLoading to true on initial fetch before center is available.
    // Background revalidations must not trigger full-screen loading screens or tear down UI.
    if (!centerRef.current) {
      setCenterLoading(true);
    }
    setCenterError("");
    try {
      const result = await getCurrentUserCenter(userId);
      if (result.error) {
        setCenterError(result.error);
        // If center is already in memory, preserve it so transient mobile resume glitches
        // do not wipe out authenticated state and trigger redirects to onboarding/dashboard.
        if (!centerRef.current) {
          setCenter(null);
          setMembership(null);
        }
      } else if (result.center && isCenterInactive(result.center)) {
        setCenter(result.center);
        setMembership(result.membership);
        setCenterError(CENTER_INACTIVE_MSG);
      } else {
        setCenter(result.center);
        setMembership(result.membership);
      }
      return result;
    } finally {
      setCenterLoading(false);
    }
  }, []);

  const refreshCenter = useCallback(async () => {
    if (!user) return { center: null, membership: null };
    return loadCenter(user.id);
  }, [user, loadCenter]);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!live) return;
      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
      if (data?.session?.user) await loadCenter(data.session.user.id);
      if (live) setAuthLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!live) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (nextSession?.user) await loadCenter(nextSession.user.id);
      } else if (event === "TOKEN_REFRESHED") {
        // TOKEN_REFRESHED occurs when returning from mobile background (e.g. native file picker).
        // Only load center if it is not already loaded in memory.
        if (nextSession?.user && !centerRef.current) {
          await loadCenter(nextSession.user.id);
        }
      } else if (event === "SIGNED_OUT") {
        setCenter(null);
        setMembership(null);
        setCenterError("");
      }
    });
    return () => {
      live = false;
      sub?.subscription?.unsubscribe();
    };
  }, [loadCenter]);

  const signOut = useCallback(async () => {
    const r = await logoutUser();
    setCenter(null);
    setMembership(null);
    setUser(null);
    setSession(null);
    return r;
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      center,
      membership,
      loading: authLoading,
      authLoading,
      centerLoading,
      centerError,
      isAuthenticated: Boolean(user),
      onboardingCompleted: center?.onboarding_completed === true,
      hasCenter: Boolean(membership),
      refreshCenter,
      reload: refreshCenter,
      signOut,
    }),
    [user, session, center, membership, authLoading, centerLoading, centerError, refreshCenter, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
