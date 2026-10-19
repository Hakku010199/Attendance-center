import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function Modal({
  title,
  onClose,
  className = "",
  closeOnBackdrop = false,
  children,
}) {
  const { theme } = useTheme();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCloseRef.current?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.body.classList.remove("modal-open");
    };
  }, []);

  const modalElement = (
    <div
      className={`backdrop ${theme === "light" ? "theme-light" : "theme-dark"}`}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onCloseRef.current?.();
        }
      }}
    >
      <div
        className={`modal ${theme === "light" ? "modal--light" : "modal--dark"} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => onCloseRef.current?.()} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalElement, document.body);
  }
  return modalElement;
}

// Backwards-compatible simple confirm (message + optional error).
export function ConfirmDialog({ title, message, error, busy, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-text">{message}</p>
      {error && <div className="notice" role="alert">{error}</div>}
      <div className="modal-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="danger" disabled={busy} onClick={onConfirm}>{busy ? "Deleting..." : "Delete"}</Button></div>
    </Modal>
  );
}

// Office pattern: dangerous deletes require typing an exact phrase.
export function ConfirmModal({ title, message, confirmLabel = "Delete", requireText, busy, onConfirm, onCancel }) {
  const [text, setText] = useState("");
  const ok = !requireText || text.trim() === requireText;
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-text">{message}</p>
      {requireText && <p className="muted">Type <code>{requireText}</code> to confirm.</p>}
      {requireText && (
        <div className="field"><label htmlFor="confirm-text">Confirmation</label><input id="confirm-text" className="control" value={text} onChange={(e) => setText(e.target.value)} placeholder={requireText} autoComplete="off" /></div>
      )}
      <div className="modal-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="danger" disabled={!ok || busy} onClick={onConfirm}>{busy ? "Deleting..." : confirmLabel}</Button></div>
    </Modal>
  );
}
