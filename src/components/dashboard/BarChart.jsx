// Simple CSS bar chart. data: [{ label, value }] where value is a percentage.
export default function BarChart({ data }) {
  return (
    <div className="chart" role="img" aria-label={data.map((d) => `${d.label} ${d.value}%`).join(", ")}>
      {data.map((d) => (
        <div className="chart-col" key={d.label}>
          <span className="chart-value">{d.value}%</span>
          <div className="chart-track"><i style={{ height: `${d.value}%` }} /></div>
          <span className="chart-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
