import { useState, useRef, useEffect } from "react";
import Icon from "../common/Icon.jsx";

export default function SwipeablePhone({
  phone,
  studentName,
  isCalled,
  onToggleCalled,
}) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const hasMovedRef = useRef(false);
  const isHorizontalRef = useRef(null);
  const SWIPE_THRESHOLD = 45;
  const MAX_SWIPE = 85;

  // Touch handlers
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentOffsetRef.current = 0;
    hasMovedRef.current = false;
    isHorizontalRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    // Detect direction on initial movement
    if (isHorizontalRef.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHorizontalRef.current = Math.abs(dx) >= Math.abs(dy);
    }

    // Only handle horizontal swipe to the right
    if (isHorizontalRef.current) {
      if (dx > 0) {
        if (e.cancelable) e.preventDefault();
        const clamped = Math.min(dx * 0.85, MAX_SWIPE);
        currentOffsetRef.current = clamped;
        setOffset(clamped);
        if (clamped > 8) hasMovedRef.current = true;
      } else {
        currentOffsetRef.current = 0;
        setOffset(0);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (currentOffsetRef.current >= SWIPE_THRESHOLD) {
      if (navigator.vibrate) {
        try {
          navigator.vibrate(25);
        } catch {}
      }
      onToggleCalled();
    }
    setOffset(0);
    currentOffsetRef.current = 0;
    // Keep hasMovedRef true briefly to suppress immediate click on tel link
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 150);
  };

  // Mouse handlers for desktop drag
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Left click only
    startXRef.current = e.clientX;
    currentOffsetRef.current = 0;
    hasMovedRef.current = false;
    setIsDragging(true);

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startXRef.current;
      if (dx > 0) {
        const clamped = Math.min(dx * 0.85, MAX_SWIPE);
        currentOffsetRef.current = clamped;
        setOffset(clamped);
        if (clamped > 6) hasMovedRef.current = true;
      } else {
        currentOffsetRef.current = 0;
        setOffset(0);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setIsDragging(false);
      if (currentOffsetRef.current >= SWIPE_THRESHOLD) {
        onToggleCalled();
      }
      setOffset(0);
      currentOffsetRef.current = 0;
      setTimeout(() => {
        hasMovedRef.current = false;
      }, 150);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleLinkClick = (e) => {
    if (hasMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  if (!phone) {
    return <span className="muted">—</span>;
  }

  const reachedThreshold = offset >= SWIPE_THRESHOLD;

  return (
    <div
      className={`swipe-phone-container ${isCalled ? "is-called" : ""}`}
      title={
        isCalled
          ? `Called • Click or swipe right to toggle status`
          : `Call ${studentName || "student"} • Swipe right to mark as called`
      }
    >
      {/* Background action track revealed during swipe */}
      <div
        className={`swipe-phone-track ${reachedThreshold ? "track-active" : ""}`}
        aria-hidden="true"
      >
        <span className="swipe-phone-track-text">
          <Icon name="check" size={13} />
          <span>{isCalled ? "Unmark" : "Called"}</span>
        </span>
      </div>

      {/* Foreground sliding card */}
      <div
        className={`swipe-phone-pill ${isDragging ? "is-dragging" : ""} ${
          isCalled ? "pill-called" : ""
        }`}
        style={{
          transform: `translateX(${offset}px)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <a
          href={`tel:${phone}`}
          className="phone-call-link"
          onClick={handleLinkClick}
        >
          <span className="phone-call-icon">
            <Icon name={isCalled ? "check" : "phone"} size={12} />
          </span>
          <span className="phone-call-text">{phone}</span>
        </a>

        {/* Status Chip / Toggle trigger */}
        {isCalled ? (
          <button
            type="button"
            className="called-chip"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCalled();
            }}
            title="Marked as Called (click to undo)"
          >
            <span>Called</span>
            <Icon name="check" size={11} />
          </button>
        ) : (
          <span
            className="swipe-hint"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCalled();
            }}
            title="Click or swipe right to mark as called"
          >
            →
          </span>
        )}
      </div>
    </div>
  );
}

