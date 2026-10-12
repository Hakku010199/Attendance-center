import Icon from "./Icon.jsx";
export default function StatCard({
  label,
  value,
  note,
  icon,
  tone = "indigo",
  onClick,
  active = false,
  className = "",
}) {
  const isClickable = typeof onClick === "function";
  return (
    <div
      className={`stat-card stat-card--${tone} ${isClickable ? "stat-card--clickable" : ""} ${active ? "stat-card--active" : ""} ${className}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-pressed={isClickable ? active : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
    >
      <div className={`stat-icon stat-icon--${tone}`}><Icon name={icon} /></div>
      <div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{note && <small className={`stat-note stat-note--${tone}`}>{note}</small>}</div>
    </div>
  );
}
