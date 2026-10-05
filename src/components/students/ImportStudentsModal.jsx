import { useState } from "react";
import * as XLSX from "xlsx";
import Modal from "../common/Modal.jsx";
import Button from "../common/Button.jsx";
import Select from "../common/Select.jsx";
import { saveStudent } from "../../services/studentService.js";

// Office pattern: Excel bulk import. Fuzzy header match
// (SR NO->roll, ADMN NO->student id, NAME->name), per-row validation,
// sequential create, and an import summary with issue details.
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const findHeaderRow = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] ?? []).map(norm);
    const hasName = cells.some((c) => c.includes("name") && !c.includes("filename"));
    const hasRoll = cells.some((c) => c.includes("srno") || c.includes("roll") || c.includes("slno"));
    if (hasName && hasRoll) return i;
  }
  return 0;
};

const colIndex = (header, keys) => {
  const cells = header.map(norm);
  for (const k of keys) {
    const i = cells.findIndex((c) => c.includes(k));
    if (i >= 0) return i;
  }
  return -1;
};

export default function ImportStudentsModal({ divisions, defaultDivisionId, onClose, onImportComplete }) {
  const [divisionId, setDivisionId] = useState(defaultDivisionId && defaultDivisionId !== "all" ? defaultDivisionId : "");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (file) => {
    setError("");
    if (!divisionId) {
      setError("Select a division first.");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const hi = findHeaderRow(rows);
      const header = rows[hi] ?? [];
      const rollIdx = colIndex(header, ["srno", "roll", "slno"]);
      const idIdx = colIndex(header, ["admnno", "admission", "studentid", "idno"]);
      const nameIdx = colIndex(header, ["studentname", "name"]);
      if (rollIdx < 0 || nameIdx < 0) {
        setError("Could not find Name and Roll columns. Expected headers like SR NO, NAME.");
        setBusy(false);
        return;
      }
      const seen = new Set();
      let imported = 0;
      let duplicates = 0;
      let invalid = 0;
      let skipped = 0;
      const issues = [];
      for (let r = hi + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const roll = String(row[rollIdx] ?? "").trim();
        const sid = idIdx >= 0 ? String(row[idIdx] ?? "").trim() : "";
        const name = String(row[nameIdx] ?? "").trim();
        const rowNo = r + 1;
        if (!roll && !name && !sid) {
          skipped += 1;
          continue;
        }
        if (!name || !/^\d+$/.test(roll)) {
          invalid += 1;
          issues.push({ rowNumber: rowNo, rollNumber: roll || "—", reason: !name ? "Missing name" : "Invalid roll number" });
          continue;
        }
        const key = `${divisionId}|${Number(roll)}`;
        if (seen.has(key)) {
          duplicates += 1;
          issues.push({ rowNumber: rowNo, rollNumber: roll, reason: "Duplicate roll in file" });
          continue;
        }
        seen.add(key);
        const res = await saveStudent(
          { studentId: sid || `STU${roll.padStart(3, "0")}`, name, rollNumber: roll, divisionId, status: "active" },
          null
        );
        if (res?.errors || res?.error) {
          const msg = res?.errors?.rollNumber || res?.errors?.studentId || res?.error || "Rejected";
          if (/already used/i.test(String(msg))) duplicates += 1;
          else invalid += 1;
          issues.push({ rowNumber: rowNo, rollNumber: roll, reason: msg });
        } else {
          imported += 1;
        }
      }
      onImportComplete({
        divisionId,
        totalRowsRead: rows.length - hi - 1,
        successfullyImported: imported,
        duplicateRollNumbers: duplicates,
        invalidRecords: invalid,
        skippedRows: skipped,
        issues,
      });
    } catch {
      setError("Unable to read this file. Use a valid .xlsx or .xls export.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Import Students from Excel" onClose={onClose}>
      <Select id="imp-div" label="Division" placeholder="Select division" options={divisions.map((d) => ({ value: d.id, label: d.name }))} value={divisionId} onChange={(e) => setDivisionId(e.target.value)} />
      <div className="field">
        <label htmlFor="imp-file">Excel file (.xlsx / .xls)</label>
        <input
          id="imp-file"
          className="control"
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFileName(f.name);
              run(f);
            }
          }}
        />
        {fileName && <p className="muted">{fileName}</p>}
      </div>
      <p className="muted">Columns auto-detected: SR NO → roll, ADMN NO → student ID, NAME → name.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <span className="muted">{busy ? "Importing…" : ""}</span>
      </div>
    </Modal>
  );
}
