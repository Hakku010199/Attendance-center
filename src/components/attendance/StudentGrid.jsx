import { useMemo } from "react";
import StudentCard from "./StudentCard.jsx";
import LoadingIcon from "../common/LoadingIcon.jsx";

export default function StudentGrid({ students = [], absentMap = {}, onToggle, loading = false }) {
  // Sort students in natural numeric roll number order as it is
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const numA = parseInt(a.rollNumber, 10);
      const numB = parseInt(b.rollNumber, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.rollNumber || "").localeCompare(String(b.rollNumber || ""), undefined, { numeric: true });
    });
  }, [students]);

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

  if (sortedStudents.length === 0) {
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
        {sortedStudents.map((student) => (
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

