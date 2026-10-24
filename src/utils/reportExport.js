import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Format a YYYY-MM-DD date into compact display strings
 */
const fmtShortDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

const fmtFullDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const getWeekdayShort = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short" });
  } catch {
    return "";
  }
};

const sanitizeFileName = (name) => {
  return String(name || "Report").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
};

/* ==========================================================================
   1. SINGLE STUDENT — EXCEL EXPORT (.xlsx)
   ========================================================================== */
export const exportStudentReportExcel = ({
  center,
  student,
  divisionName,
  periodLabel,
  fromDate,
  toDate,
  logs = [],
  summary = {},
}) => {
  const centerName = center?.name || "Attendance Center";
  const centerMeta = [
    center?.address,
    center?.phone ? `Phone: ${center.phone}` : null,
    center?.email ? `Email: ${center.email}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const rangeText = periodLabel || `${fmtFullDate(fromDate)} – ${fmtFullDate(toDate)}`;

  const aoa = [
    [centerName],
    ...(centerMeta ? [[centerMeta]] : []),
    [],
    ["Single Student Attendance Report"],
    [],
    ["Student Name:", student?.name || "—", "", "Class / Division:", divisionName || "—"],
    ["Roll / Admission No:", student?.rollNumber || "—", "", "Date Range:", rangeText],
    ...(student?.mobile && student.mobile !== "—"
      ? [["Contact Number:", student.mobile, "", "", ""]]
      : []),
    [],
    ["Date", "Day", "Attendance"],
  ];

  logs.forEach((log) => {
    aoa.push([
      log.formattedDate || fmtFullDate(log.date),
      log.dayOfWeek || getWeekdayShort(log.date),
      log.attendance || "—",
    ]);
  });

  aoa.push([]);
  aoa.push(["Summary Statistics", "", ""]);
  aoa.push(["Total Present (P)", summary.presentDays ?? 0, ""]);
  aoa.push(["Total Absent (A)", summary.absentDays ?? 0, ""]);
  aoa.push(["Attendance Percentage", `${summary.percentage ?? 0}%`, ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = [
    { wch: 18 }, // Date
    { wch: 14 }, // Day
    { wch: 16 }, // Attendance
    { wch: 20 },
    { wch: 24 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Student Attendance");

  const safeStudent = sanitizeFileName(student?.name || "Student");
  const safeRange = sanitizeFileName(rangeText);
  XLSX.writeFile(wb, `${safeStudent}_Attendance_${safeRange}.xlsx`);
};

/* ==========================================================================
   2. DIVISION MONTHLY-STYLE — EXCEL EXPORT (.xlsx)
   ========================================================================== */
export const exportDivisionReportExcel = ({
  center,
  divisionName,
  periodLabel,
  fromDate,
  toDate,
  dates = [],
  students = [],
  dailyTotals = {},
  overallPercentage = 0,
}) => {
  const centerName = center?.name || "Attendance Center";
  const centerMeta = [
    center?.address,
    center?.phone ? `Phone: ${center.phone}` : null,
    center?.email ? `Email: ${center.email}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const rangeText = periodLabel || `${fmtFullDate(fromDate)} – ${fmtFullDate(toDate)}`;

  // Compact date headers: "20 Oct (Tue)"
  const dateColHeaders = dates.map((d) => `${fmtShortDate(d)} ${getWeekdayShort(d)}`);

  const headers = [
    "Roll No",
    "Student Name",
    ...dateColHeaders,
    "Total P",
    "Total A",
    "Rate (%)",
  ];

  const aoa = [
    [centerName],
    ...(centerMeta ? [[centerMeta]] : []),
    [],
    [`Division Attendance Report — ${divisionName || "All Divisions"}`],
    [`Period: ${rangeText}`],
    [`Total Students: ${students.length}`, "", `Average Attendance: ${overallPercentage}%`],
    [],
    headers,
  ];

  const headerRowIndex = aoa.length; // 1-based row index for freeze pane

  // Rows for each student
  students.forEach((s) => {
    aoa.push([
      s.rollNumber || "—",
      s.name || "—",
      ...dates.map((d) => s.history?.[d] || "—"),
      s.presentCount ?? 0,
      s.absentCount ?? 0,
      `${s.percentage ?? 0}%`,
    ]);
  });

  // Daily totals at bottom
  aoa.push([]);
  aoa.push([
    "",
    "Total Present (P)",
    ...dates.map((d) => dailyTotals[d]?.present ?? 0),
    students.reduce((acc, s) => acc + (s.presentCount ?? 0), 0),
    "",
    "",
  ]);
  aoa.push([
    "",
    "Total Absent (A)",
    ...dates.map((d) => dailyTotals[d]?.absent ?? 0),
    "",
    students.reduce((acc, s) => acc + (s.absentCount ?? 0), 0),
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 10 }, // Roll No
    { wch: 22 }, // Student Name
    ...dates.map(() => ({ wch: 13 })),
    { wch: 10 }, // Total P
    { wch: 10 }, // Total A
    { wch: 11 }, // Rate
  ];

  // Freeze header and student name columns
  ws["!views"] = [
    {
      state: "frozen",
      xSplit: 2,
      ySplit: headerRowIndex,
    },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Division Attendance");

  const safeDiv = sanitizeFileName(divisionName || "Division");
  const safeRange = sanitizeFileName(rangeText);
  XLSX.writeFile(wb, `${safeDiv}_Attendance_${safeRange}.xlsx`);
};

/* ==========================================================================
   3. SINGLE STUDENT — PDF EXPORT (.pdf)
   ========================================================================== */
export const exportStudentReportPDF = ({
  center,
  student,
  divisionName,
  periodLabel,
  fromDate,
  toDate,
  logs = [],
  summary = {},
}) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const centerName = center?.name || "RollBeeCall Attendance";
  const rangeText = periodLabel || `${fmtFullDate(fromDate)} – ${fmtFullDate(toDate)}`;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(centerName, 40, 45);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  const centerMeta = [
    center?.address,
    center?.phone ? `Phone: ${center.phone}` : null,
    center?.email ? `Email: ${center.email}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (centerMeta) {
    doc.text(centerMeta, 40, 60);
  }

  // Report Title Badge
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("Single Student Attendance Report", 40, 85);

  // Student details info box
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(40, 95, 515, 54, 4, 4, "FD");

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Student Name:", 52, 114);
  doc.text("Roll / Admission:", 52, 134);
  doc.text("Class / Division:", 300, 114);
  doc.text("Date Range:", 300, 134);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(student?.name || "—", 135, 114);
  doc.text(String(student?.rollNumber || "—"), 150, 134);
  doc.text(divisionName || "—", 395, 114);
  doc.text(rangeText, 375, 134);

  // Table Data
  const tableHead = [["Date", "Day", "Attendance Status"]];
  const tableBody = logs.map((log) => [
    log.formattedDate || fmtFullDate(log.date),
    log.dayOfWeek || getWeekdayShort(log.date),
    log.attendance || "—",
  ]);

  autoTable(doc, {
    startY: 165,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9.5,
      halign: "center",
      cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 5,
      halign: "center",
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 160 },
      1: { halign: "center", cellWidth: 140 },
      2: { halign: "center", cellWidth: 140 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const val = String(data.cell.raw).trim();
        if (val === "P") {
          data.cell.styles.textColor = [22, 101, 52]; // green-800
          data.cell.styles.fontStyle = "bold";
        } else if (val === "A") {
          data.cell.styles.textColor = [185, 28, 28]; // red-700
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = [148, 163, 184]; // slate-400
        }
      }
    },
  });

  // Summary Card at bottom
  const finalY = doc.lastAutoTable.finalY + 18;
  const pageHeight = doc.internal.pageSize.getHeight();

  // If near bottom of page, add new page
  if (finalY + 80 > pageHeight) {
    doc.addPage();
  }
  const summaryY = finalY + 80 > pageHeight ? 45 : finalY;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(40, summaryY, 515, 52, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("Attendance Summary", 55, summaryY + 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Total Present (P): ${summary.presentDays ?? 0}    |    Total Absent (A): ${
      summary.absentDays ?? 0
    }    |    Attendance Rate: ${summary.percentage ?? 0}%`,
    55,
    summaryY + 38
  );

  const safeStudent = sanitizeFileName(student?.name || "Student");
  const safeRange = sanitizeFileName(rangeText);
  doc.save(`${safeStudent}_Attendance_${safeRange}.pdf`);
};

/* ==========================================================================
   4. DIVISION MONTHLY-STYLE — PDF EXPORT (.pdf)
   ========================================================================== */
export const exportDivisionReportPDF = ({
  center,
  divisionName,
  periodLabel,
  fromDate,
  toDate,
  dates = [],
  students = [],
  dailyTotals = {},
  overallPercentage = 0,
}) => {
  // Use landscape orientation for division reports with multiple date columns
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const centerName = center?.name || "RollBeeCall Attendance";
  const rangeText = periodLabel || `${fmtFullDate(fromDate)} – ${fmtFullDate(toDate)}`;

  // Header Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 41, 59);
  doc.text(centerName, 35, 34);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  const centerMeta = [
    center?.address,
    center?.phone ? `Phone: ${center.phone}` : null,
    center?.email ? `Email: ${center.email}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (centerMeta) {
    doc.text(centerMeta, 35, 47);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Division Attendance Report: ${divisionName || "All Divisions"}    (Period: ${rangeText})`,
    35,
    64
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Students: ${students.length}   •   Days: ${dates.length}   •   Average Rate: ${overallPercentage}%`,
    35,
    77
  );

  // Compact Date Headings: "20 Oct" and weekday "Tue"
  const dateHeadings = dates.map((d) => `${fmtShortDate(d)}\n${getWeekdayShort(d)}`);

  const head = [["Roll", "Student Name", ...dateHeadings, "Total P", "Total A"]];

  const body = students.map((s) => [
    s.rollNumber || "—",
    s.name || "—",
    ...dates.map((d) => s.history?.[d] || "—"),
    s.presentCount ?? 0,
    s.absentCount ?? 0,
  ]);

  // Bottom daily totals rows
  const foot = [
    [
      "",
      "Total Present",
      ...dates.map((d) => dailyTotals[d]?.present ?? 0),
      students.reduce((acc, s) => acc + (s.presentCount ?? 0), 0),
      "",
    ],
    [
      "",
      "Total Absent",
      ...dates.map((d) => dailyTotals[d]?.absent ?? 0),
      "",
      students.reduce((acc, s) => acc + (s.absentCount ?? 0), 0),
    ],
  ];

  // Adjust table font size and padding dynamically based on date count
  const dateCount = dates.length;
  let dynamicFontSize = 8;
  let dynamicPadding = 3.5;
  if (dateCount > 25) {
    dynamicFontSize = 6.2;
    dynamicPadding = 1.8;
  } else if (dateCount > 15) {
    dynamicFontSize = 7.2;
    dynamicPadding = 2.4;
  }

  autoTable(doc, {
    startY: 86,
    margin: { left: 30, right: 30 },
    head,
    body,
    foot,
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    styles: {
      fontSize: dynamicFontSize,
      cellPadding: dynamicPadding,
      halign: "center",
      valign: "middle",
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: dateCount > 20 ? 32 : 40 },
      1: { halign: "left", fontStyle: "bold", cellWidth: dateCount > 20 ? 85 : 110 },
      // Summary columns Total P & Total A
      [dates.length + 2]: { halign: "center", fontStyle: "bold", textColor: [22, 101, 52] },
      [dates.length + 3]: { halign: "center", fontStyle: "bold", textColor: [185, 28, 28] },
    },
    didParseCell: (data) => {
      // Color-code attendance cells in body
      if (
        data.section === "body" &&
        data.column.index >= 2 &&
        data.column.index < dates.length + 2
      ) {
        const val = String(data.cell.raw).trim();
        if (val === "P") {
          data.cell.styles.textColor = [22, 101, 52]; // green
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244]; // light green bg
        } else if (val === "A") {
          data.cell.styles.textColor = [185, 28, 28]; // red
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [254, 242, 242]; // light red bg
        } else {
          data.cell.styles.textColor = [148, 163, 184];
        }
      }
    },
  });

  const safeDiv = sanitizeFileName(divisionName || "Division");
  const safeRange = sanitizeFileName(rangeText);
  doc.save(`${safeDiv}_Attendance_${safeRange}.pdf`);
};
