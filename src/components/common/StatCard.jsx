import Icon from "./Icon.jsx";
export default function StatCard({ label, value, note, icon, tone = "indigo" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-icon--${tone}`}><Icon name={icon} /></div>
      <div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{note && <small className={`stat-note stat-note--${tone}`}>{note}</small>}</div>
    </div>
  );
}
