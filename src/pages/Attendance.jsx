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
import {
  getStudentCallStatus,
  markStudentAsCalled,
  unmarkStudentAsCalled,
} from "../services/callService.js";

// Import custom attendance dashboard components
import AttendanceFilters from "../components/attendance/AttendanceFilters.jsx";
import AttendanceSummary from "../components/attendance/AttendanceSummary.jsx";
import StudentGrid from "../components/attendance/StudentGrid.jsx";
import StudentList from "../components/attendance/StudentList.jsx";
import AbsenteesPanel from "../components/attendance/AbsenteesPanel.jsx";
import SwipeablePhone from "../components/attendance/SwipeablePhone.jsx";
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
    if (location.state?.divisionId) return location.state.divisionId;
    if (centerId) {
      try {
        const saved = localStorage.getItem(`attendance-selected-division:${centerId}`);
        if (saved) return saved;
      } catch {}
    }
    return "";
  });

  // Toggle view mode: "grid" (buttons) vs "list" (name - roll number)
  const [viewMode, setViewMode] = useState(() => {
    if (centerId) {
      try {
        const saved = localStorage.getItem(`attendance-view-mode:${centerId}`);
        if (saved === "list" || saved === "grid") return saved;
      } catch {}
    }
    return "grid";
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (centerId) {
      try {
        localStorage.setItem(`attendance-view-mode:${centerId}`, mode);
      } catch {}
    }
  };

  useEffect(() => {
    if (location.state?.divisionId) {
      setDivisionId(location.state.divisionId);
      if (divStorageKey) {
        try {
          localStorage.setItem(divStorageKey, location.state.divisionId);
        } catch {}
      }
    }
  }, [location.state, divStorageKey]);

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
  const [hasSubmitted, setHasSubmitted] = useState(false);
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

  // Persistent Called status tracking for Daily Wise Attendance (persisted in Supabase)
  const [calledMap, setCalledMap] = useState(() => {
    if (centerId && date) {
      try {
        const raw = localStorage.getItem(`attendance-called:${centerId}:${date}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return {};
  });
  const [callLoadingMap, setCallLoadingMap] = useState({});
  const [dailyFilter, setDailyFilter] = useState("all"); // "all" | "present" | "absent"

  // Load persistent call tracking records from Supabase
  useEffect(() => {
    let isLive = true;
    if (centerId && date) {
      getStudentCallStatus({ centerId, date }).then(({ data, error }) => {
        if (isLive && data) {
          setCalledMap(data);
        }
      });
    }
    return () => {
      isLive = false;
    };
  }, [centerId, date, attendanceRefreshKey]);

  // Shared function invoked by both mobile swipe and desktop arrow click
  const handleMarkStudentCalled = async (studentId) => {
    if (!centerId || !date || !studentId) return;
    if (callLoadingMap[studentId]) return;

    const isAlreadyCalled = Boolean(calledMap[studentId]);

    // Prevent concurrent duplicate requests for this student
    setCallLoadingMap((prev) => ({ ...prev, [studentId]: true }));

    if (isAlreadyCalled) {
      // Unmark called status
      const res = await unmarkStudentAsCalled({ studentId, centerId, date });
      setCallLoadingMap((prev) => ({ ...prev, [studentId]: false }));
      if (res?.error) {
        toast(res.error, "error");
      } else {
        setCalledMap((prev) => {
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
      }
    } else {
      // Mark as called
      const res = await markStudentAsCalled({ studentId, centerId, date });
      setCallLoadingMap((prev) => ({ ...prev, [studentId]: false }));
      if (res?.error) {
        toast(res.error, "error");
      } else {
        setCalledMap((prev) => ({
          ...prev,
          [studentId]: res.data || true,
        }));
      }
    }
  };

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
      const { students, absentIds, hasSubmitted: dbHasSubmitted } = await getAttendance(date, divisionId);
      setRoster(students || []);
      setHasSubmitted(Boolean(dbHasSubmitted));

      // 2. If already submitted in database, sync DB state as source of truth:
      if (dbHasSubmitted) {
        const dbMap = {};
        for (const id of (absentIds || [])) dbMap[id] = true;
        setAbsentMap(dbMap);
        saveCachedAbsences(date, divisionId, dbMap);
      } else if (localCached !== null) {
        // Unsubmitted but previously toggled locally: restore toggles
        setAbsentMap(localCached);
      } else {
        // Unsubmitted fresh: default all present (empty absentMap)
        setAbsentMap({});
        saveCachedAbsences(date, divisionId, {});
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
      const wasResubmit = hasSubmitted;
      setHasSubmitted(true);
      saveCachedAbsences(date, divisionId, absentMap);
      const absentCount = Object.keys(absentMap).length;
      const presentCount = roster.length - absentCount;
      const actionText = wasResubmit ? "resubmitted" : "submitted";
      const msg = `Attendance ${actionText} successfully for ${roster.length} students (${presentCount} Present, ${absentCount} Absent).`;
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
    const displayedTableStudents = tableStudents.filter((s) => {
      const isAbs = tableAbsent.includes(s.id);
      if (dailyFilter === "absent") return isAbs;
      if (dailyFilter === "present") return !isAbs;
      return true;
    });

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
          <StatCard
            label="Total Students"
            value={tableStudents.length}
            icon="students"
            active={dailyFilter === "all"}
            onClick={() => setDailyFilter("all")}
          />
          <StatCard
            label="Present"
            value={tablePresentCount}
            icon="attendance"
            tone="green"
            active={dailyFilter === "present"}
            onClick={() => setDailyFilter((prev) => (prev === "present" ? "all" : "present"))}
          />
          <StatCard
            label="Absent"
            value={tableAbsentCount}
            icon="attendance"
            tone="red"
            active={dailyFilter === "absent"}
            onClick={() => setDailyFilter((prev) => (prev === "absent" ? "all" : "absent"))}
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
              ) : displayedTableStudents.length === 0 ? (
                <EmptyState
                  title={dailyFilter === "absent" ? "No Absentees" : "No Present Students"}
                  text={
                    dailyFilter === "absent"
                      ? "All students are marked Present for this date."
                      : "All students are marked Absent for this date."
                  }
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
                      {displayedTableStudents.map((s) => {
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
                              <SwipeablePhone
                                phone={s.mobile}
                                studentName={s.name}
                                isCalled={Boolean(calledMap[s.id])}
                                loading={Boolean(callLoadingMap[s.id])}
                                onMarkCalled={() => handleMarkStudentCalled(s.id)}
                              />
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

      {/* View Header with Title & 2-Icon View Mode Toggle */}
      <div className="attendance-view-header">
        <div className="attendance-view-info">
          <span className="attendance-view-title">Students</span>
        </div>
        <div className="view-mode-toggle" role="group" aria-label="Toggle student attendance view mode">
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => handleViewModeChange("grid")}
            title="Roll Number Buttons View"
            aria-label="Roll Number Buttons View"
            aria-pressed={viewMode === "grid"}
          >
            <Icon name="grid" size={16} />
            <span className="view-mode-label">Buttons</span>
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => handleViewModeChange("list")}
            title="Name - Roll Number List View"
            aria-label="Name - Roll Number List View"
            aria-pressed={viewMode === "list"}
          >
            <Icon name="list" size={16} />
            <span className="view-mode-label">Name - Roll</span>
          </button>
        </div>
      </div>

      {/* Dynamic Student View: Grid of Roll Buttons OR List of Name - Roll Number */}
      {viewMode === "grid" ? (
        <StudentGrid
          students={roster}
          absentMap={absentMap}
          onToggle={handleToggle}
          loading={loadingStudents}
        />
      ) : (
        <StudentList
          students={roster}
          absentMap={absentMap}
          onToggle={handleToggle}
          loading={loadingStudents}
        />
      )}

      {/* Action Bar (All Present | Submit/Resubmit | All Absent) */}
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
          {submitting
            ? (hasSubmitted ? "Resubmitting…" : "Submitting…")
            : (hasSubmitted ? "Resubmit Attendance" : "Submit Attendance")}
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
