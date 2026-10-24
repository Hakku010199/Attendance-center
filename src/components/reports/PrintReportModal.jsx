import { useState, useEffect, useRef } from "react";
import Modal from "../common/Modal.jsx";
import Icon from "../common/Icon.jsx";
import { supabase } from "../../lib/supabase.js";
import { getFacultySession } from "../../services/facultyAuthService.js";
import {
  getDivisionPrintReport,
  getStudentPrintReport,
  todayISO,
} from "../../services/attendanceService.js";
import {
  exportStudentReportExcel,
  exportDivisionReportExcel,
  exportStudentReportPDF,
  exportDivisionReportPDF,
} from "../../utils/reportExport.js";
import "../../styles/printReport.css";

const pad = (n) => String(n).padStart(2, "0");

const getDefaultFromDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
};

export default function PrintReportModal({ onClose, divisions = [], center }) {
  // Mode: "student" or "division"
  const [reportType, setReportType] = useState("student");

  // Filter selections
  const [divisionId, setDivisionId] = useState(divisions[0]?.id || "all");
  const [studentList, setStudentList] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Close student search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowStudentDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Custom Date Range: From Date & To Date
  const [fromDate, setFromDate] = useState(() => getDefaultFromDate());
  const [toDate, setToDate] = useState(() => todayISO());

  // Action / downloading states: null | "excel" | "pdf" | "print"
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load students when division changes (for single student report)
  useEffect(() => {
    let live = true;
    const centerId = center?.id || getFacultySession()?.center?.id;
    if (centerId) {
      setLoadingStudents(true);
      let q = supabase
        .from("students")
        .select("*")
        .eq("center_id", centerId)
        .eq("status", "active");

      if (divisionId && divisionId !== "all") {
        q = q.eq("division_id", divisionId);
      }

      q.then(({ data, error: qErr }) => {
        if (!live) return;
        if (qErr) {
          console.error("[PrintReportModal] error fetching students:", qErr);
        }
        const list = (data || [])
          .map((s) => ({
            id: s.id,
            name: s.name || "",
            roll_number: s.roll_number ?? s.rollNumber ?? s.student_id ?? s.studentId ?? "",
            student_id: s.student_id ?? s.studentId ?? "",
            mobile: s.mobile || s.phone || "",
            phone: s.phone || s.mobile || "",
            division_id: s.division_id,
          }))
          .sort((a, b) => {
            const numA = parseInt(a.roll_number, 10);
            const numB = parseInt(b.roll_number, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a.roll_number).localeCompare(String(b.roll_number));
          });

        setStudentList(list);
        if (selectedStudent) {
          const match = list.find((s) => s.id === selectedStudent.id);
          if (match) {
            setSelectedStudent(match);
            setStudentId(match.id);
          } else {
            setSelectedStudent(null);
            setStudentId("");
          }
        }
        setLoadingStudents(false);
      });
    }
    return () => {
      live = false;
    };
  }, [center?.id, divisionId]);

  // Filter students based on search query
  const filteredStudents = studentList.filter((s) => {
    const rawQ = studentSearch.trim();
    if (!rawQ) return true;
    const q = rawQ.toLowerCase();

    const rollStr = String(s.roll_number ?? s.student_id ?? "").toLowerCase();
    const matchRoll = rollStr.includes(q);

    const nameStr = String(s.name ?? "").toLowerCase();
    const matchName = nameStr.includes(q);

    const rawMob = String(s.mobile || s.phone || "");
    const cleanMob = rawMob.replace(/[^0-9]/g, "");
    const cleanQ = q.replace(/[^0-9]/g, "");
    const matchMobile =
      rawMob.toLowerCase().includes(q) ||
      (cleanQ.length > 0 && cleanMob.includes(cleanQ));

    return matchRoll || matchName || matchMobile;
  });

  const validateInputs = () => {
    setError("");
    setSuccessMsg("");

    if (!fromDate || !toDate) {
      setError("Please select both start date and end date.");
      return false;
    }
    if (fromDate > toDate) {
      setError("End date cannot be earlier than start date.");
      return false;
    }
    if (reportType === "student" && !studentId) {
      setError("Please select a student to export their attendance report.");
      return false;
    }
    return true;
  };

  const fetchReportData = async () => {
    if (reportType === "student") {
      const data = await getStudentPrintReport({
        studentId,
        fromDate,
        toDate,
        includeAllDates: true,
        reportFormat: "custom",
      });
      return {
        type: "student",
        data,
      };
    } else {
      const data = await getDivisionPrintReport({
        divisionId,
        fromDate,
        toDate,
      });
      return {
        type: "division",
        data,
      };
    }
  };

  /**
   * Immediately generates and downloads the Excel report
   */
  const handleDownloadExcel = async () => {
    if (!validateInputs()) return;

    setActionLoading("excel");
    try {
      const { type, data } = await fetchReportData();
      if (type === "student") {
        exportStudentReportExcel({
          center,
          student: data.student,
          divisionName: data.divisionName,
          fromDate,
          toDate,
          logs: data.logs,
          summary: data.summary,
        });
      } else {
        exportDivisionReportExcel({
          center,
          divisionName: data.divisionName,
          fromDate,
          toDate,
          dates: data.dates,
          students: data.students,
          dailyTotals: data.dailyTotals,
          overallPercentage: data.overallPercentage,
        });
      }
      setSuccessMsg("Excel report (.xlsx) downloaded successfully!");
    } catch (err) {
      console.error("[PrintReportModal] Excel export error:", err);
      setError(err?.message || "Failed to generate Excel report.");
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Immediately generates and downloads the PDF report
   */
  const handleDownloadPDF = async () => {
    if (!validateInputs()) return;

    setActionLoading("pdf");
    try {
      const { type, data } = await fetchReportData();
      if (type === "student") {
        exportStudentReportPDF({
          center,
          student: data.student,
          divisionName: data.divisionName,
          fromDate,
          toDate,
          logs: data.logs,
          summary: data.summary,
        });
      } else {
        exportDivisionReportPDF({
          center,
          divisionName: data.divisionName,
          fromDate,
          toDate,
          dates: data.dates,
          students: data.students,
          dailyTotals: data.dailyTotals,
          overallPercentage: data.overallPercentage,
        });
      }
      setSuccessMsg("PDF report (.pdf) downloaded successfully!");
    } catch (err) {
      console.error("[PrintReportModal] PDF export error:", err);
      setError(err?.message || "Failed to generate PDF report.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Modal
      title=""
      onClose={onClose}
      className="print-modal"
    >
      <div>
          {/* Report Selection Tabs */}
          <div className="print-modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={reportType === "student"}
              className={`print-tab-btn ${reportType === "student" ? "active" : ""}`}
              onClick={() => {
                setReportType("student");
                setError("");
                setSuccessMsg("");
              }}
            >
              <Icon name="students" size={16} />
              <span>Student</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reportType === "division"}
              className={`print-tab-btn ${reportType === "division" ? "active" : ""}`}
              onClick={() => {
                setReportType("division");
                setError("");
                setSuccessMsg("");
              }}
            >
              <Icon name="divisions" size={16} />
              <span>Division</span>
            </button>
          </div>

          {/* Validation Error Notice */}
          {error && (
            <div
              className="notice notice--error"
              role="alert"
              style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Download Success Notice */}
          {successMsg && (
            <div
              className="notice notice--success"
              role="status"
              style={{
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "rgba(34, 197, 94, 0.15)",
                borderColor: "#22c55e",
                color: "#86efac",
              }}
            >
              <Icon name="check" size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Filter Form Controls */}
          <div className="print-form-grid">
            {/* Division Selector */}
            <div className="field">
              <label htmlFor="print-div-select">Class / Division</label>
              <select
                id="print-div-select"
                className="control select"
                value={divisionId}
                onChange={(e) => {
                  setDivisionId(e.target.value);
                  setStudentSearch("");
                  setShowStudentDropdown(false);
                }}
              >
                {reportType === "division" ? (
                  <option value="all">All Divisions</option>
                ) : (
                  <option value="all">All Divisions</option>
                )}
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Student Selector (for single student report) */}
            {reportType === "student" && (
              <div className="field">
                <label htmlFor="print-student-input">Select Student</label>
                {selectedStudent ? (
                  <div className="print-selected-student-card">
                    <div className="print-selected-details">
                      <span className="print-selected-roll">
                        {selectedStudent.roll_number
                          ? `Roll ${selectedStudent.roll_number}`
                          : selectedStudent.student_id
                          ? `ID ${selectedStudent.student_id}`
                          : "—"}
                      </span>
                      <span className="print-selected-name">{selectedStudent.name}</span>
                      {(selectedStudent.mobile || selectedStudent.phone) && (
                        <span className="print-selected-meta">
                          Mob: {selectedStudent.mobile || selectedStudent.phone}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="print-change-btn"
                      onClick={() => {
                        setSelectedStudent(null);
                        setStudentId("");
                        setStudentSearch("");
                        setShowStudentDropdown(true);
                      }}
                      title="Select a different student"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="print-student-search-wrap" ref={dropdownRef}>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type="text"
                        id="print-student-input"
                        className="control"
                        style={{ paddingRight: studentSearch ? "36px" : "12px" }}
                        placeholder="Search student by Roll No, Name, or Mobile…"
                        value={studentSearch}
                        autoComplete="off"
                        onChange={(e) => {
                          setStudentSearch(e.target.value);
                          setShowStudentDropdown(true);
                        }}
                        onFocus={() => setShowStudentDropdown(true)}
                      />
                      {studentSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setStudentSearch("");
                            setShowStudentDropdown(true);
                          }}
                          style={{
                            position: "absolute",
                            right: "10px",
                            background: "transparent",
                            border: "none",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "14px",
                            padding: "4px",
                          }}
                          title="Clear search"
                          aria-label="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {showStudentDropdown && (
                      <div className="print-student-dropdown" role="listbox">
                        {loadingStudents ? (
                          <div className="print-student-opt" style={{ color: "#94a3b8" }}>
                            Loading students…
                          </div>
                        ) : filteredStudents.length === 0 ? (
                          <div className="print-student-opt" style={{ color: "#94a3b8" }}>
                            {studentList.length === 0
                              ? "No students found in this division"
                              : `No students matching "${studentSearch}"`}
                          </div>
                        ) : (
                          filteredStudents.slice(0, 100).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="print-student-opt"
                              onClick={() => {
                                setSelectedStudent(s);
                                setStudentId(s.id);
                                setStudentSearch("");
                                setShowStudentDropdown(false);
                                setError("");
                              }}
                            >
                              <span className="print-opt-roll">
                                {s.roll_number
                                  ? `Roll ${s.roll_number}`
                                  : s.student_id
                                  ? `ID ${s.student_id}`
                                  : "—"}
                              </span>
                              <span className="print-opt-name">{s.name}</span>
                              {(s.mobile || s.phone) && (
                                <span className="print-opt-mobile">
                                  {s.mobile || s.phone}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Custom Date Range: From Date & To Date */}
          <div className="print-form-grid" style={{ marginBottom: "16px" }}>
            <div className="field">
              <label htmlFor="print-from-date">Start Date</label>
              <input
                id="print-from-date"
                type="date"
                className="control"
                value={fromDate}
                max={todayISO()}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setError("");
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="print-to-date">End Date</label>
              <input
                id="print-to-date"
                type="date"
                className="control"
                value={toDate}
                max={todayISO()}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setError("");
                }}
              />
            </div>
          </div>

          {/* Footer Actions: Cancel, Excel, PDF horizontally aligned in the same line */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "10px",
              marginTop: "16px",
              paddingTop: "14px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                fontSize: "0.82rem",
                borderRadius: "6px",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn"
              disabled={actionLoading !== null}
              onClick={handleDownloadExcel}
              title="Download Excel (.xlsx)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "0.82rem",
                fontWeight: "600",
                cursor: actionLoading !== null ? "not-allowed" : "pointer",
                background: "#059669",
                color: "#ffffff",
                border: "1px solid #10b981",
                transition: "all 0.15s ease",
              }}
            >
              <Icon name="download" size={15} />
              <span>{actionLoading === "excel" ? "Excel…" : "Excel (.xlsx)"}</span>
            </button>

            <button
              type="button"
              className="btn btn--primary"
              disabled={actionLoading !== null}
              onClick={handleDownloadPDF}
              title="Download PDF (.pdf)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "0.82rem",
                fontWeight: "600",
                cursor: actionLoading !== null ? "not-allowed" : "pointer",
                background: "#dc2626",
                color: "#ffffff",
                border: "1px solid #ef4444",
                transition: "all 0.15s ease",
              }}
            >
              <Icon name="download" size={15} />
              <span>{actionLoading === "pdf" ? "PDF…" : "PDF (.pdf)"}</span>
            </button>
          </div>
        </div>
      </Modal>
  );
}
