import { useState, useRef } from "react";
import Icon from "../common/Icon.jsx";
import Button from "../common/Button.jsx";
import Select from "../common/Select.jsx";
import { formatFileSize, isSupportedFile, readWorkbook, extractSheetData } from "../../lib/excelParser.js";

export default function ExcelUploader({ onFileParsed, isParsing, parseError }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [error, setError] = useState(parseError || "");
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    setError("");
    if (!file) return;

    if (!isSupportedFile(file)) {
      setError("Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.");
      setSelectedFile(null);
      setWorkbook(null);
      return;
    }

    try {
      setSelectedFile(file);
      const wb = await readWorkbook(file);
      setWorkbook(wb);
      const sheets = wb.SheetNames || [];
      setSheetNames(sheets);
      const defaultSheet = sheets[0] || "";
      setSelectedSheet(defaultSheet);

      // Extract sheet data immediately for the default sheet
      const extracted = extractSheetData(wb, defaultSheet, 10);
      onFileParsed({
        file,
        workbook: wb,
        sheetNames: sheets,
        selectedSheet: defaultSheet,
        headers: extracted.headers,
        sampleRows: extracted.sampleRows,
        totalRowCount: extracted.totalRowCount,
        rawRows: extracted.rawRows,
      });
    } catch (err) {
      setError(err?.message || "Failed to read the Excel file. Please try another file.");
      setSelectedFile(null);
      setWorkbook(null);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSheetChange = (e) => {
    const sheet = e.target.value;
    setSelectedSheet(sheet);
    if (workbook) {
      try {
        const extracted = extractSheetData(workbook, sheet, 10);
        onFileParsed({
          file: selectedFile,
          workbook,
          sheetNames,
          selectedSheet: sheet,
          headers: extracted.headers,
          sampleRows: extracted.sampleRows,
          totalRowCount: extracted.totalRowCount,
          rawRows: extracted.rawRows,
        });
      } catch (err) {
        setError(err?.message || "Failed to parse selected sheet.");
      }
    }
  };

  const resetFile = () => {
    setSelectedFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="uploader-container">
      {!selectedFile ? (
        <div
          className={`uploader-dropzone ${dragActive ? "uploader-dropzone--active" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{ position: "relative" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="student-file-uploader-input"
            aria-label="Choose student Excel or CSV file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/comma-separated-values,application/csv,application/octet-stream"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              zIndex: 10,
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onChange={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.target.files?.[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />
          <div className="uploader-icon-wrap" style={{ pointerEvents: "none" }}>
            <Icon name="download" size={32} />
          </div>
          <div className="uploader-text" style={{ pointerEvents: "none" }}>
            <strong>Choose student Excel or CSV file</strong>
            <span>Tap to browse from your device or drag &amp; drop</span>
          </div>
          <div style={{ marginTop: 12, pointerEvents: "none" }}>
            <span className="btn btn--secondary btn--sm" style={{ pointerEvents: "none" }}>
              <Icon name="search" size={14} /> Browse Device
            </span>
          </div>
          <div className="uploader-badge" style={{ pointerEvents: "none" }}>Supports .xlsx, .xls, .csv</div>
        </div>
      ) : (
        <div className="uploader-selected-card">
          <div className="uploader-file-info">
            <div className="uploader-file-icon">
              <Icon name="download" size={24} />
            </div>
            <div className="uploader-file-meta">
              <strong className="uploader-file-name">{selectedFile.name}</strong>
              <small className="muted">{formatFileSize(selectedFile.size)}</small>
            </div>
            <Button
              type="button"
              variant="ghost-danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                resetFile();
              }}
              title="Choose different file"
            >
              Remove
            </Button>
          </div>

          {sheetNames.length > 1 && (
            <div className="uploader-sheet-select" style={{ marginTop: 14 }}>
              <Select
                id="excel-sheet-select"
                label="Select Sheet to Import"
                value={selectedSheet}
                options={sheetNames.map((s) => ({ value: s, label: s }))}
                onChange={handleSheetChange}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="form-error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
    </div>
  );
}

