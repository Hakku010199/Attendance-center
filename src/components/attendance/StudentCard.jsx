export default function StudentCard({ student, isAbsent, onToggle }) {
  const roll = student.rollNumber ?? student.studentId ?? "—";
  return (
    <button
      type="button"
      className={`student-card ${isAbsent ? "student-card--absent" : "student-card--present"}`}
      onClick={() => onToggle(student.id)}
      title={`${student.name} (Roll #${roll}) — Click to mark ${isAbsent ? "Present" : "Absent"}`}
      aria-pressed={!isAbsent}
    >
      <span className="student-card-roll">{roll}</span>
      <span className="student-card-name">{student.name}</span>
      <span className="student-card-badge">{isAbsent ? "Absent" : "Present"}</span>
    </button>
  );
}

