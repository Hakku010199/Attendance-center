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
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="uploader-icon-wrap">
            <Icon name="download" size={32} />
          </div>
          <div className="uploader-text">
            <strong>Drag and drop student Excel or CSV file</strong>
            <span>or click to browse from your computer</span>
          </div>
          <div className="uploader-badge">Supports .xlsx, .xls, .csv</div>
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
            <Button variant="ghost-danger" size="sm" onClick={resetFile} title="Choose different file">
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

