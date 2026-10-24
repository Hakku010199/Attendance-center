// Cross-module sync events (Office pattern).
// Attendance writes dispatch attendance-updated; division writes dispatch divisions-updated.
// Shell + sections listen and refetch — no prop drilling, no page reload.
export const ATTENDANCE_UPDATED = "attendance-updated";
export const DIVISIONS_UPDATED = "divisions-updated";
export const TEACHERS_UPDATED = "teachers-updated";

export const notifyAttendanceUpdated = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ATTENDANCE_UPDATED));
};

export const notifyDivisionsUpdated = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DIVISIONS_UPDATED));
};

export const notifyTeachersUpdated = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TEACHERS_UPDATED));
};
