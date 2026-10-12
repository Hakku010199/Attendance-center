import { useState, useRef } from "react";
import Icon from "../common/Icon.jsx";

export default function SwipeablePhone({
  phone,
  studentName,
  isCalled = false,
  loading = false,
  onMarkCalled,
}) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const hasMovedRef = useRef(false);
  const isHorizontalRef = useRef(null);
  const SWIPE_THRESHOLD = 45;
  const MAX_SWIPE = 96;

  // Touch handlers for mobile swipe left
  const handleTouchStart = (e) => {
    if (isCalled || loading) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentOffsetRef.current = 0;
    hasMovedRef.current = false;
    isHorizontalRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (isCalled || loading) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    // Detect direction on initial movement to prevent blocking vertical scrolling
    if (isHorizontalRef.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHorizontalRef.current = Math.abs(dx) >= Math.abs(dy);
    }

    // Only handle horizontal swipe to the LEFT (revealing action on the right)
    if (isHorizontalRef.current) {
      if (dx < 0) {
        if (e.cancelable) e.preventDefault();
        const clamped = Math.max(dx * 0.85, -MAX_SWIPE);
        currentOffsetRef.current = clamped;
        setOffset(clamped);
        if (Math.abs(clamped) > 8) hasMovedRef.current = true;
      } else {
        currentOffsetRef.current = 0;
        setOffset(0);
      }
    }
  };

  const handleTouchEnd = () => {
    if (isCalled || loading) {
      setIsDragging(false);
      setOffset(0);
      return;
    }
    setIsDragging(false);
    if (Math.abs(currentOffsetRef.current) >= SWIPE_THRESHOLD) {
      if (navigator.vibrate) {
        try {
          navigator.vibrate(25);
        } catch {}
      }
      if (onMarkCalled) {
        onMarkCalled();
      }
    }
    setOffset(0);
    currentOffsetRef.current = 0;
    // Suppress immediate link click if finger moved
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 150);
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

  const reachedThreshold = Math.abs(offset) >= SWIPE_THRESHOLD;

  return (
    <div
      className={`swipe-phone-container ${isCalled ? "is-called" : ""} ${
        loading ? "is-loading" : ""
      }`}
      title={
        isCalled
          ? `${studentName || "Student"} marked as called (click to undo)`
          : `Call ${studentName || "student"} • ${phone}`
      }
    >
      {/* Background action track: ONLY rendered when actively swiping left */}
      {!isCalled && isDragging && offset < -4 && (
        <div
          className={`swipe-phone-track swipe-phone-track--right ${
            reachedThreshold ? "track-active" : ""
          }`}
          aria-hidden="true"
        >
          <span className="swipe-phone-track-text">
            <Icon name="phone" size={13} />
            <span>Mark called</span>
          </span>
        </div>
      )}

      {/* Foreground sliding card: completely opaque background */}
      <div
        className={`swipe-phone-pill ${isDragging ? "is-dragging" : ""} ${
          isCalled ? "pill-called" : ""
        }`}
        style={{
          transform: isCalled ? "none" : `translateX(${offset}px)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <a
          href={isCalled ? undefined : `tel:${phone}`}
          className="phone-call-link"
          onClick={(e) => {
            if (isCalled) {
              e.preventDefault();
              e.stopPropagation();
              if (!loading && onMarkCalled) onMarkCalled();
              return;
            }
            handleLinkClick(e);
          }}
          title={isCalled ? "Marked as called (click to undo)" : `Call ${phone}`}
        >
          <span className="phone-call-icon">
            {loading ? (
              <span className="spinner-xs" aria-hidden="true" />
            ) : (
              <Icon name={isCalled ? "check" : "phone"} size={12} />
            )}
          </span>
          <span className="phone-call-text">{phone}</span>
        </a>

        {/* When not called: Show desktop arrow (hidden on mobile). When called: Only left verification icon is kept. */}
        {!isCalled && (
          <button
            type="button"
            className="desktop-arrow-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (!loading && onMarkCalled) onMarkCalled();
            }}
            disabled={loading}
            aria-label={`Mark ${studentName || "student"} as called`}
            title="Mark student as called"
          >
            {loading ? (
              <span className="spinner-xs" aria-hidden="true" />
            ) : (
              <span className="arrow-glyph" aria-hidden="true">→</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
