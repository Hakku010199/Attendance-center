import StudentCard from "./StudentCard.jsx";
import LoadingIcon from "../common/LoadingIcon.jsx";

export default function StudentGrid({ students = [], absentMap = {}, onToggle, loading = false }) {
  if (loading) {
    return (
      <div className="student-grid-wrapper">
        <div className="student-grid-loading">
          <LoadingIcon size={70} />
          <p className="muted">Loading students…</p>
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="student-grid-wrapper">
        <div className="student-grid-empty">
          <p className="muted">No students in this division.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student-grid-wrapper">
      <div className="student-grid">
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            isAbsent={Boolean(absentMap[student.id])}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

