import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import StatCard from "../components/common/StatCard.jsx";
import Async from "../components/common/Async.jsx";
import Select from "../components/common/Select.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Icon from "../components/common/Icon.jsx";
import useLoad from "../hooks/useLoad.js";
import useDivisions from "../hooks/useDivisions.js";
import { usePortal } from "../components/layout/AppLayout.jsx";
import {
  getAttendance,
  setAbsent,
  submitAttendance,
  fetchDivisionStudentCounts,
  todayISO,
} from "../services/attendanceService.js";
import { ATTENDANCE_UPDATED } from "../utils/events.js";
import { useToast } from "../components/common/Toast.jsx";

// Import custom attendance dashboard components
import AttendanceFilters from "../components/attendance/AttendanceFilters.jsx";
import AttendanceSummary from "../components/attendance/AttendanceSummary.jsx";
import StudentGrid from "../components/attendance/StudentGrid.jsx";
import AbsenteesPanel from "../components/attendance/AbsenteesPanel.jsx";
import "../styles/attendance.css";

const fmtDate = (iso) => {
  try {
    return new Date(`${iso}T00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export default function Attendance() {
  const location = useLocation();
  const isDailyWise = location.pathname === "/daily-attendance";

  const { center, attendanceRefreshKey, divisionsKey } = usePortal();
  const toast = useToast();
  const { divisions } = useDivisions();

  // Storage helper for persistence across page refreshes
  const centerId = center?.id;
  const storageKey = centerId ? `attendance-absences:${centerId}` : null;
  const dateStorageKey = centerId ? `attendance-selected-date:${centerId}` : null;
  const divStorageKey = centerId ? `attendance-selected-division:${centerId}` : null;

  const [date, setDate] = useState(() => {
    if (centerId) {
      try {
        const saved = localStorage.getItem(`attendance-selected-date:${centerId}`);
        if (saved) return saved;
      } catch {}
    }
    return todayISO();
  });

  const [divisionId, setDivisionId] = useState(() => {
    if (centerId) {
      try {
        const saved = localStorage.getItem(`attendance-selected-division:${centerId}`);
        if (saved) return saved;
      } catch {}
    }
    return "";
  });

  const handleDateChange = (newDate) => {
    setDate(newDate);
    if (dateStorageKey) {
      try {
        localStorage.setItem(dateStorageKey, newDate);
      } catch {}
    }
  };

  const handleDivisionChange = (newDivId) => {
    setDivisionId(newDivId);
    if (divStorageKey) {
      try {
        localStorage.setItem(divStorageKey, newDivId);
      } catch {}
    }
  };

  const [studentCounts, setStudentCounts] = useState({});

  // Attendance Dashboard State (for /attendance)
  const [roster, setRoster] = useState([]);
  const [absentMap, setAbsentMap] = useState(() => {
    if (centerId && date && divisionId) {
      try {
        const raw = localStorage.getItem(`attendance-absences:${centerId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const val = parsed[`${date}|${divisionId}`];
          if (val) return val;
        }
      } catch {}
    }
    return {};
  });
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState(null);

  // Table view state (for /daily-attendance)
  const [tableAbsent, setTableAbsentIds] = useState(() => {
    if (centerId && date && divisionId) {
      try {
        const raw = localStorage.getItem(`attendance-absences:${centerId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const val = parsed[`${date}|${divisionId}`];
          if (val) return Object.keys(val);
        }
      } catch {}
    }
    return [];
  });

  const active = divisions.filter((d) => d.status === "active");

  // Load student counts per division
  useEffect(() => {
    let live = true;
    fetchDivisionStudentCounts().then((counts) => {
      if (live) setStudentCounts(counts || {});
    });
    return () => {
      live = false;
    };
  }, [divisionsKey, attendanceRefreshKey]);

  // Set and validate active division with persistence
  useEffect(() => {
    if (active.length === 0) return;

    if (!divisionId) {
      const saved = divStorageKey ? localStorage.getItem(divStorageKey) : null;
      if (saved && active.some((d) => d.id === saved)) {
        setDivisionId(saved);
      } else {
        setDivisionId(active[0].id);
        if (divStorageKey) {
          try {
            localStorage.setItem(divStorageKey, active[0].id);
          } catch {}
        }
      }
    } else if (!active.some((d) => d.id === divisionId)) {
      setDivisionId(active[0].id);
      if (divStorageKey) {
        try {
          localStorage.setItem(divStorageKey, active[0].id);
        } catch {}
      }
    }
  }, [active, divisionId, divStorageKey]);

  const getCachedAbsences = useCallback(
    (targetDate, targetDiv) => {
      if (!storageKey || !targetDate || !targetDiv) return null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const val = parsed[`${targetDate}|${targetDiv}`];
        return val !== undefined ? val : null;
      } catch {
        return null;
      }
    },
    [storageKey]
  );

  const saveCachedAbsences = useCallback(
    (targetDate, targetDiv, newAbsentMap) => {
      if (!storageKey || !targetDate || !targetDiv) return;
      try {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[`${targetDate}|${targetDiv}`] = newAbsentMap;
        localStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {
        // ignore local storage errors
      }
    },
    [storageKey]
  );

  // Fetch roster and existing attendance records for the selected date & division
  const loadAttendanceData = useCallback(async () => {
    if (!divisionId) {
      setRoster([]);
      setAbsentMap({});
      return;
    }
    setLoadingStudents(true);
    setSubmitNotice(null);

    // 1. Immediately restore local cached absences if available so toggles never flicker or reset
    const localCached = getCachedAbsences(date, divisionId);
    if (localCached !== null) {
      setAbsentMap(localCached);
    }

    try {
      const { students, absentIds, hasSubmitted } = await getAttendance(date, divisionId);
      setRoster(students || []);

      // 2. If the user hasn't marked or visited this date/division locally yet (localCached === null):
      if (localCached === null) {
        if (hasSubmitted) {
          const dbMap = {};
          for (const id of (absentIds || [])) dbMap[id] = true;
          setAbsentMap(dbMap);
          saveCachedAbsences(date, divisionId, dbMap);
        } else {
          setAbsentMap({});
          saveCachedAbsences(date, divisionId, {});
        }
      } else {
        // Local cache has the user's toggles! Keep them!
        setAbsentMap(localCached);
      }
    } catch (err) {
      console.error("[attendance] error loading attendance:", err);
      if (localCached !== null) {
        setAbsentMap(localCached);
      }
      toast("Unable to load live attendance records.", "error");
    } finally {
      setLoadingStudents(false);
    }
  }, [date, divisionId, getCachedAbsences, saveCachedAbsences, toast]);

  useEffect(() => {
    if (!isDailyWise) {
      loadAttendanceData();
    }
  }, [isDailyWise, loadAttendanceData]);

  // Listen to external attendance updates
  useEffect(() => {
    const onUpdate = () => {
      if (!isDailyWise) loadAttendanceData();
    };
    window.addEventListener(ATTENDANCE_UPDATED, onUpdate);
    return () => window.removeEventListener(ATTENDANCE_UPDATED, onUpdate);
  }, [isDailyWise, loadAttendanceData]);

  // Handlers for Square Toggle Grid
  const handleToggle = (studentId) => {
    const updated = { ...absentMap };
    if (updated[studentId]) {
      delete updated[studentId];
    } else {
      updated[studentId] = true;
    }
    setAbsentMap(updated);
    saveCachedAbsences(date, divisionId, updated);
    setSubmitNotice(null);
  };

  const handleMarkAllPresent = () => {
    const updated = {};
    setAbsentMap(updated);
    saveCachedAbsences(date, divisionId, updated);
    setSubmitNotice(null);
  };

  const handleMarkAllAbsent = () => {
    const updated = {};
    for (const s of roster) {
      updated[s.id] = true;
    }
    setAbsentMap(updated);
    saveCachedAbsences(date, divisionId, updated);
    setSubmitNotice(null);
  };

  const handleReMarkPresent = (studentId) => {
    handleToggle(studentId);
  };

  const handleSubmit = async () => {
    if (roster.length === 0) {
      setSubmitNotice({ type: "error", message: "No students in this division to submit." });
      return;
    }
    setSubmitting(true);
    setSubmitNotice(null);

    const res = await submitAttendance({
      date,
      divisionId,
      roster,
      absentMap,
    });

    setSubmitting(false);

    if (res?.error) {
      setSubmitNotice({ type: "error", message: res.error });
      toast(res.error, "error");
    } else {
      saveCachedAbsences(date, divisionId, absentMap);
      const absentCount = Object.keys(absentMap).length;
      const presentCount = roster.length - absentCount;
      const msg = `Attendance submitted successfully for ${roster.length} students (${presentCount} Present, ${absentCount} Absent).`;
      setSubmitNotice({ type: "success", message: msg });
      toast(msg, "info");
    }
  };

  // Calculations for Attendance Dashboard
  const totalCount = roster.length;
  const absentStudents = roster.filter((s) => Boolean(absentMap[s.id]));
  const absentCount = absentStudents.length;
  const presentCount = Math.max(totalCount - absentCount, 0);

  // --- Daily Wise Attendance Table Audit View (for /daily-attendance route) ---
  const tableList = useLoad(
    () => (divisionId ? getAttendance(date, divisionId) : Promise.resolve({ students: [], absentIds: [] })),
    [date, divisionId, attendanceRefreshKey, divisionsKey]
  );

  useEffect(() => {
    if (tableList.data) setTableAbsentIds(tableList.data.absentIds);
  }, [tableList.data]);

  const handleTableMark = async (id, isAbsent) => {
    setTableAbsentIds((cur) => {
      const next = isAbsent ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
      const nextMap = {};
      for (const absId of next) nextMap[absId] = true;
      saveCachedAbsences(date, divisionId, nextMap);
      return next;
    });
    const r = await setAbsent(date, divisionId, id, isAbsent);
    if (r?.error) {
      toast(r.error, "error");
      if (tableList.data) setTableAbsentIds(tableList.data.absentIds);
    }
  };

  const tableStudents = tableList.data?.students ?? [];
  const tableAbsentCount = tableStudents.filter((s) => tableAbsent.includes(s.id)).length;
  const tablePresentCount = tableStudents.length - tableAbsentCount;

  // Render Table View if on /daily-attendance
  if (isDailyWise) {
    return (
      <>
        <div className="toolbar toolbar--att">
          <div className="field">
            <label htmlFor="att-date">Date</label>
            <input
              id="att-date"
              className="control"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
          <Select
            id="att-div"
            label="Division"
            placeholder="All Divisions"
            options={active.map((d) => ({ value: d.id, label: d.name }))}
            value={divisionId}
            onChange={(e) => handleDivisionChange(e.target.value)}
          />
        </div>
        <div className="stat-grid stat-grid--daily">
          <StatCard label="Total Students" value={tableStudents.length} icon="students" />
          <StatCard label="Present" value={tablePresentCount} icon="attendance" tone="green" />
          <StatCard label="Absent" value={tableAbsentCount} icon="attendance" tone="red" />
          <StatCard
            label="Attendance %"
            value={`${tableStudents.length ? Math.round((tablePresentCount / tableStudents.length) * 100) : 0}%`}
            icon="reports"
          />
        </div>
        <Async state={tableList}>
          {() => (
            <section className="card card--flush">
              {tableStudents.length === 0 ? (
                <EmptyState
                  title="No records"
                  text={divisionId ? "No active students in this division for this date." : "Pick a division to view its daily records."}
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Roll No.</th>
                        <th>Student Name</th>
                        <th>Status</th>
                        <th>Mobile</th>
                        <th className="th-right">Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableStudents.map((s) => {
                        const isAbs = tableAbsent.includes(s.id);
                        return (
                          <tr key={s.id}>
                            <td data-label="Roll No">{s.rollNumber}</td>
                            <td data-label="Name">
                              <strong>{s.name}</strong>
                            </td>
                            <td data-label="Status">
                              {isAbs ? <span className="badge-absent">Absent</span> : <span className="badge-present">Present</span>}
                            </td>
                            <td data-label="Mobile">
                              {s.mobile ? (
                                <a
                                  href={`tel:${s.mobile}`}
                                  className="phone-call-link"
                                  title={`Call ${s.name} (${s.mobile})`}
                                >
                                  <span className="phone-call-icon"><Icon name="phone" size={12} /></span>
                                  <span className="phone-call-text">{s.mobile}</span>
                                </a>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td className="cell-actions">
                              <div className="seg" role="group" aria-label={`Attendance for ${s.name}`}>
                                <button
                                  type="button"
                                  className={`seg-btn seg-btn--present ${!isAbs ? "on" : ""}`}
                                  aria-pressed={!isAbs}
                                  onClick={() => handleTableMark(s.id, false)}
                                >
                                  Present
                                </button>
                                <button
                                  type="button"
                                  className={`seg-btn seg-btn--absent ${isAbs ? "on" : ""}`}
                                  aria-pressed={isAbs}
                                  onClick={() => handleTableMark(s.id, true)}
                                >
                                  Absent
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </Async>
      </>
    );
  }

  // --- Render Attendance Dashboard UI (for /attendance route) ---
  return (
    <div className="attendance-container">
      {/* Date & Division Filters */}
      <AttendanceFilters
        date={date}
        onDateChange={handleDateChange}
        divisionId={divisionId}
        onDivisionChange={handleDivisionChange}
        divisions={active}
        studentCounts={studentCounts}
        maxDate={todayISO()}
        loading={loadingStudents}
      />

      {/* 3 Summary Cards */}
      <AttendanceSummary
        total={totalCount}
        present={presentCount}
        absent={absentCount}
      />

      {/* Student Button Grid (Square Toggle Cards) */}
      <StudentGrid
        students={roster}
        absentMap={absentMap}
        onToggle={handleToggle}
        loading={loadingStudents}
      />

      {/* Action Bar (All Present | Submit | All Absent) */}
      <div className="attendance-action-bar">
        <button
          type="button"
          className="btn-action btn-action--present"
          onClick={handleMarkAllPresent}
          disabled={loadingStudents || submitting || roster.length === 0}
        >
          All Present
        </button>

        <button
          type="button"
          className="btn-action btn-action--submit"
          onClick={handleSubmit}
          disabled={loadingStudents || submitting || roster.length === 0}
        >
          {submitting ? "Submitting…" : "Submit Attendance"}
        </button>

        <button
          type="button"
          className="btn-action btn-action--absent"
          onClick={handleMarkAllAbsent}
          disabled={loadingStudents || submitting || roster.length === 0}
        >
          All Absent
        </button>
      </div>

      {/* Submission Feedback Notices */}
      {submitNotice && (
        <div
          className={`notice ${submitNotice.type === "success" ? "notice--success" : "notice--error"}`}
          role="status"
        >
          {submitNotice.message}
        </div>
      )}

      {/* Absentees List Panel (appears when any student is marked absent) */}
      <AbsenteesPanel
        absentees={absentStudents}
        onReMarkPresent={handleReMarkPresent}
      />
    </div>
  );
}
