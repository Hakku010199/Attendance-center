export default function SummaryCard({ label, value, variant = "neutral" }) {
  return (
    <div className={`summary-card summary-card--${variant}`}>
      <span className="summary-card-label">{label}</span>
      <span className="summary-card-value">{value}</span>
    </div>
  );
}

