export default function AbsenteesPanel({ absentees = [], onReMarkPresent }) {
  if (absentees.length === 0) return null;

  return (
    <div className="absentees-panel">
      <div className="absentees-header">
        <span className="absentees-title">
          Absent Students
        </span>
        <small className="muted">Click any student chip to mark them back to Present</small>
      </div>
      <div className="absentees-list">
        {absentees.map((s) => {
          const roll = s.rollNumber ?? s.studentId ?? "—";
          return (
            <button
              key={s.id}
              type="button"
              className="absentee-chip"
              onClick={() => onReMarkPresent(s.id)}
              title={`Click to mark ${s.name} as Present`}
            >
              <span className="absentee-roll">{roll}</span>
              <span className="absentee-name">{s.name}</span>
              <span className="absentee-action" aria-hidden="true">✕</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

