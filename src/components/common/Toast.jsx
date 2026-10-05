import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, tone = "success") => {
    const id = Date.now(); setToast({ id, message, tone }); setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && <div className={`toast toast--${toast.tone}`} role="status">{toast.message}</div>}
    </ToastContext.Provider>
  );
}
