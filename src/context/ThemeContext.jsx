import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem("portal-theme") || "dark";
    } catch {
      return "dark";
    }
  });

  const setTheme = (nextTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem("portal-theme", nextTheme);
    } catch {}
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.add("theme-light");
      root.classList.remove("theme-dark");
      document.body.classList.add("theme-light");
      document.body.classList.remove("theme-dark");
    } else {
      root.setAttribute("data-theme", "dark");
      root.classList.add("theme-dark");
      root.classList.remove("theme-light");
      document.body.classList.add("theme-dark");
      document.body.classList.remove("theme-light");
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

