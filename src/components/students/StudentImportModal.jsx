import { useState } from "react";
import Modal from "../common/Modal.jsx";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";
import ExcelUploader from "./ExcelUploader.jsx";
import ColumnMapping from "./ColumnMapping.jsx";
import ImportPreview from "./ImportPreview.jsx";
import {
  requestAiColumnMapping,
  executeStudentImport,
} from "../../services/studentImportService.js";
import { transformRows } from "../../lib/excelParser.js";

const STEPS = [
  { id: 1, label: "1. Upload File" },
  { id: 2, label: "2. Map Columns" },
  { id: 3, label: "3. Preview Data" },
];

export default function StudentImportModal({ divisions = [], onClose, onImportComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [fileData, setFileData] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiMetadata, setAiMetadata] = useState({ provider: null, isAiPowered: false, warnings: [] });
  const [transformedRows, setTransformedRows] = useState([]);
  const [defaultDivisionId, setDefaultDivisionId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [error, setError] = useState("");

  // Step 1: File chosen and parsed by ExcelUploader
  const handleFileParsed = (data) => {
    setFileData(data);
    setError("");
  };

  // Move from Step 1 to Step 2: Run AI Analysis
  const handleStartMapping = async () => {
    if (!fileData || !fileData.headers || fileData.headers.length === 0) {
      setError("Please select a valid Excel file with column headers.");
      return;
    }

    setCurrentStep(2);
    setIsAiAnalyzing(true);
    setError("");

    try {
      // Analyze headers and sample rows (up to 10 rows maximum)
      const result = await requestAiColumnMapping(fileData.headers, fileData.sampleRows);
      setMapping(result.mapping || []);
      setAiMetadata({
        provider: result.provider,
        isAiPowered: result.isAiPowered,
        warnings: result.warnings || [],
      });
    } catch (err) {
      setError(err?.message || "Failed to analyze columns. You can map them manually below.");
      // Fallback empty mapping
      setMapping(
        (fileData.headers || []).map((h) => ({
          excelColumn: h,
          targetField: "ignore",
          confidence: 0,
          needsReview: true,
        }))
      );
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // Move from Step 2 to Step 3: Generate preview
  const handleProceedToPreview = () => {
    if (!mapping || mapping.length === 0) {
      setError("Please configure column mappings before previewing.");
      return;
    }

    const transformed = transformRows(fileData.rawRows, fileData.headers, mapping);
    setTransformedRows(transformed);
    setCurrentStep(3);
  };

  // Step 3 Confirmation: Import to database
  const handleConfirmImport = async () => {
    if (!fileData?.rawRows?.length) {
      setError("No student data available to import.");
      return;
    }
    setIsImporting(true);
    setError("");
    setImportProgress({ percent: 5, message: "Preparing import..." });

    try {
      // Transform all data rows with the confirmed mapping
      const allTransformed = transformRows(fileData.rawRows, fileData.headers, mapping);

      const result = await executeStudentImport({
        transformedRows: allTransformed,
        defaultDivisionId,
        onProgress: (p) => setImportProgress(p),
      });

      setImportSummary(result);
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (err) {
      setError(err?.message || "Failed to import students. Please check your data and try again.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      title="Smart Student Import (AI-Assisted)"
      onClose={onClose}
      className="student-import-modal"
    >
      <div className="import-wizard">
        {/* Step Indicator Header (hidden once finished) */}
        {!importSummary && (
          <div className="import-steps">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`import-step-item ${currentStep === s.id ? "import-step-item--active" : ""} ${currentStep > s.id ? "import-step-item--done" : ""}`}
              >
                <span className="import-step-num">{currentStep > s.id ? "✓" : s.id}</span>
                <span className="import-step-text">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="form-error" role="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* IMPORT SUMMARY (COMPLETION SCREEN) */}
        {importSummary ? (
          <div className="import-step-body">
            <div className="empty" style={{ padding: "20px 16px 12px" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "var(--green, #22c55e)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.7rem",
                  margin: "0 auto 10px",
                }}
              >
                ✓
              </div>
              <strong style={{ fontSize: "1.15rem", display: "block" }}>Import Completed Successfully!</strong>
              <p className="muted" style={{ margin: "4px 0 16px" }}>
                Students and divisions have been synchronized to your center database and dashboard.
              </p>
            </div>

            <div className="stat-grid stat-grid--3" style={{ marginBottom: 16 }}>
              <div className="stat">
                <small>Total Read</small>
                <b>{importSummary.totalRowsRead}</b>
              </div>
              <div className="stat">
                <small>Imported</small>
                <b style={{ color: "var(--green, #22c55e)" }}>{importSummary.successfullyImported}</b>
              </div>
              <div className="stat">
                <small>Divisions Created</small>
                <b>{importSummary.createdDivisions?.length || 0}</b>
              </div>
              <div className="stat">
                <small>Duplicates Skipped</small>
                <b>{importSummary.duplicateRollNumbers}</b>
              </div>
              <div className="stat">
                <small>Invalid Records</small>
                <b>{importSummary.invalidRecords}</b>
              </div>
              <div className="stat">
                <small>Blank Rows</small>
                <b>{importSummary.skippedRows}</b>
              </div>
            </div>

            {importSummary.createdDivisions?.length > 0 && (
              <div className="mapping-alert mapping-alert--info" style={{ marginBottom: 16 }}>
                <strong>New Divisions Created:</strong> {importSummary.createdDivisions.join(", ")}
              </div>
            )}

            {importSummary.issues?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: "0.9rem", marginBottom: 8, color: "var(--muted)" }}>
                  Import Exceptions / Skipped Records ({importSummary.issues.length})
                </h4>
                <div className="table-wrap" style={{ maxHeight: 180, overflowY: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Roll</th>
                        <th>Name</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importSummary.issues.map((it, i) => (
                        <tr key={i}>
                          <td data-label="Row">{it.rowNumber}</td>
                          <td data-label="Roll">{it.rollNumber}</td>
                          <td data-label="Name">{it.name || "—"}</td>
                          <td data-label="Reason" style={{ color: "var(--amber, #f59e0b)" }}>
                            {it.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <Button variant="primary" onClick={onClose}>
                Done &amp; View Students
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* STEP 1: Upload */}
            {currentStep === 1 && (
              <div className="import-step-body">
                <p className="muted" style={{ marginBottom: 16 }}>
                  Upload any student spreadsheet (.xlsx, .xls, .csv). Different centers use different
                  formats — Gemini AI will automatically detect and match column headers.
                </p>
                <ExcelUploader onFileParsed={handleFileParsed} parseError={error} />

                <div className="modal-actions" style={{ marginTop: 24 }}>
                  <Button variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!fileData || !fileData.headers?.length}
                    onClick={handleStartMapping}
                  >
                    Analyze Columns with AI <Icon name="chevron" size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: AI Column Mapping & Review */}
            {currentStep === 2 && (
              <div className="import-step-body">
                {isAiAnalyzing ? (
                  <div className="empty" style={{ padding: "48px 16px" }}>
                    <div className="spinner" />
                    <strong style={{ display: "block", marginTop: 14 }}>Analyzing Excel Columns with Gemini...</strong>
                    <p className="muted">Evaluating column headers and sample data to identify student fields.</p>
                  </div>
                ) : (
                  <>
                    <p className="muted" style={{ marginBottom: 16 }}>
                      Review the detected field mappings below. You can manually adjust any dropdown to correct
                      the mapping. Unmapped or extra columns will be ignored.
                    </p>
                    <ColumnMapping
                      mapping={mapping}
                      onChangeMapping={setMapping}
                      isAiPowered={aiMetadata.isAiPowered}
                      provider={aiMetadata.provider}
                      warnings={aiMetadata.warnings}
                    />

                    <div className="modal-actions" style={{ marginTop: 24 }}>
                      <Button variant="secondary" onClick={() => setCurrentStep(1)}>
                        Back to Upload
                      </Button>
                      <Button variant="primary" onClick={handleProceedToPreview}>
                        Preview Transformed Data <Icon name="chevron" size={14} />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* STEP 3: Preview Data & Import Confirmation */}
            {currentStep === 3 && (
              <div className="import-step-body">
                <ImportPreview
                  transformedRows={transformedRows}
                  mapping={mapping}
                  totalRowCount={fileData?.totalRowCount || 0}
                  divisions={divisions}
                  defaultDivisionId={defaultDivisionId}
                  onChangeDefaultDivision={setDefaultDivisionId}
                  onRemap={() => setCurrentStep(2)}
                  onConfirmImport={handleConfirmImport}
                  isImporting={isImporting}
                  importProgress={importProgress}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

