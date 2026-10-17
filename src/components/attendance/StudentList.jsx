import LoadingIcon from "../common/LoadingIcon.jsx";

export default function StudentList({ students = [], absentMap = {}, onToggle, loading = false }) {
  if (loading) {
    return (
      <div className="student-list-wrapper">
        <div className="student-grid-loading">
          <LoadingIcon size={70} />
          <p className="muted">Loading students…</p>
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="student-list-wrapper">
        <div className="student-grid-empty">
          <p className="muted">No students in this division.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student-list-wrapper">
      <div className="student-list-grid">
        {students.map((student) => {
          const isAbsent = Boolean(absentMap[student.id]);
          const roll = student.rollNumber ?? student.studentId ?? "—";
          return (
            <div
              key={student.id}
              className={`student-list-item ${isAbsent ? "student-list-item--absent" : "student-list-item--present"}`}
              onClick={() => onToggle(student.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(student.id);
                }
              }}
              aria-pressed={!isAbsent}
              title={`${student.name} (Roll ${roll}) — Click to mark ${isAbsent ? "Present" : "Absent"}`}
            >
              <button
                type="button"
                className={`student-list-roll-btn ${isAbsent ? "student-list-roll-btn--absent" : "student-list-roll-btn--present"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(student.id);
                }}
                aria-label={`Roll number ${roll}, click to toggle attendance`}
              >
                {roll}
              </button>

              <button
                type="button"
                className="student-list-name-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(student.id);
                }}
                aria-label={`Student ${student.name}, click to toggle attendance`}
              >
                <span className="student-list-name-text">{student.name}</span>
              </button>

              {isAbsent && (
                <div className="student-list-status">
                  <span className="status-pill status-pill--absent">
                    <span className="status-dot" aria-hidden="true" />
                    Absent
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

