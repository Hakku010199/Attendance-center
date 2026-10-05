export default function StatusBadge({ variant, children }) {
  return <span className={`badge badge--${variant}`}>{children ?? variant}</span>;
}
