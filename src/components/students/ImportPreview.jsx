import { CANONICAL_FIELDS } from "../../lib/excelParser.js";
import Button from "../common/Button.jsx";
import Icon from "../common/Icon.jsx";

export default function ImportPreview({
  transformedRows = [],
  mapping = [],
  totalRowCount = 0,
  divisions = [],
  defaultDivisionId = "",
  onChangeDefaultDivision,
  onRemap,
  onConfirmImport,
  isImporting = false,
  importProgress,
}) {
  // Determine which canonical fields are mapped to at least one column
  const activeFields = CANONICAL_FIELDS.filter(
    (field) => field.value !== "ignore" && mapping.some((m) => m.targetField === field.value)
  );

  const previewSlice = transformedRows.slice(0, 10);

  // Collect distinct division names detected from the file
  const detectedDivisions = Array.from(
    new Set(transformedRows.map((r) => String(r.division || "").trim()).filter(Boolean))
  );

  const hasDivisionColumn = mapping.some((m) => m.targetField === "division");

  return (
    <div className="import-preview-wrap">
      {/* Informative Preview Banner */}
      <div className="preview-banner">
        <div className="preview-banner-icon">ℹ</div>
        <div className="preview-banner-text">
          <strong>Preview Mode — Safe Verification</strong>
          <p>
            Showing first {previewSlice.length} of {totalRowCount} transformed student rows.{" "}
            Review the columns below to verify that student names, roll numbers, and divisions are correctly aligned.
          </p>
        </div>
      </div>

      {/* Metadata summary chips */}
      <div className="preview-meta-bar">
        <div className="preview-chip">
          <small>Total File Records</small>
          <b>{totalRowCount} students</b>
        </div>
        <div className="preview-chip">
          <small>Active Mapped Fields</small>
          <b>{activeFields.length} fields</b>
        </div>
        <div className="preview-chip">
          <small>Detected Divisions</small>
          <b>{detectedDivisions.length > 0 ? `${detectedDivisions.length} classes` : "None"}</b>
        </div>
        <div className="preview-chip">
          <small>Ignored Columns</small>
          <b>{mapping.filter((m) => m.targetField === "ignore").length} skipped</b>
        </div>
      </div>

      {/* Division Handling Notice & Optional Fallback Selector */}
      {detectedDivisions.length > 0 ? (
        <div className="mapping-alert mapping-alert--info" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.1rem" }}>🏫</span>
          <div>
            <strong>Divisions detected in file:</strong>{" "}
            <span style={{ color: "#fff" }}>{detectedDivisions.slice(0, 8).join(", ")}{detectedDivisions.length > 8 ? ` + ${detectedDivisions.length - 8} more` : ""}</span>.
            <div className="muted" style={{ fontSize: "0.82rem", marginTop: 2 }}>
              Any division not already in your center will be automatically created upon import.
            </div>
          </div>
        </div>
      ) : (
        <div className="mapping-alert mapping-alert--warning" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <strong>No division column detected in this file.</strong>
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Students will be assigned to a default division.
            </p>
          </div>
          {divisions.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="preview-def-div" style={{ fontSize: "0.84rem", color: "var(--muted)" }}>
                Assign to:
              </label>
              <select
                id="preview-def-div"
                className="control control--sm"
                value={defaultDivisionId}
                onChange={(e) => onChangeDefaultDivision && onChangeDefaultDivision(e.target.value)}
                style={{ width: "auto", minWidth: 160 }}
              >
                <option value="">Auto-create as &quot;General&quot;</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Preview Table */}
      {previewSlice.length === 0 ? (
        <div className="empty">
          <strong>No preview data available</strong>
          <p>Please check your file and column mappings.</p>
        </div>
      ) : activeFields.length === 0 ? (
        <div className="empty">
          <strong>No columns are mapped</strong>
          <p>Please go back and map at least one column to a student field.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="table preview-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                {activeFields.map((f) => (
                  <th key={f.value}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewSlice.map((row, idx) => (
                <tr key={idx}>
                  <td className="muted" style={{ fontSize: "0.8rem" }}>
                    {idx + 1}
                  </td>
                  {activeFields.map((f) => {
                    const val = row[f.value];
                    return (
                      <td key={f.value} data-label={f.label}>
                        {val ? (
                          f.value === "name" ? (
                            <strong>{val}</strong>
                          ) : f.value === "division" ? (
                            <span className="status-pill status-pill--active" style={{ fontSize: "0.78rem" }}>
                              {val}
                            </span>
                          ) : (
                            val
                          )
                        ) : (
                          <span className="muted" style={{ fontStyle: "italic" }}>
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Decision Bar: If preview is NOT OK (Re-preview) vs If preview IS OK (Import) */}
      <div className="preview-decision-card" style={{ marginTop: 8 }}>
        <div className="preview-decision-header">
          <strong>Is this preview accurate?</strong>
          <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
            If any fields look misaligned, click <b>Re-map / Re-preview</b> to adjust columns. Otherwise, click <b>Import to Database</b> to proceed.
          </p>
        </div>

        {isImporting && importProgress && (
          <div className="import-progress-bar-wrap" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 6 }}>
              <span>{importProgress.message || "Importing students..."}</span>
              <b>{importProgress.percent || 0}%</b>
            </div>
            <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${importProgress.percent || 0}%`,
                  height: "100%",
                  background: "var(--accent, #6355f6)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <Button
            variant="secondary"
            onClick={onRemap}
            disabled={isImporting}
            title="Go back to adjust mappings and generate a new preview"
          >
            <Icon name="edit" size={14} /> Re-map &amp; Re-preview
          </Button>

          <Button
            variant="primary"
            onClick={onConfirmImport}
            disabled={isImporting || previewSlice.length === 0 || activeFields.length === 0}
          >
            {isImporting ? (
              <>
                <span className="spinner spinner--sm" /> Importing...
              </>
            ) : (
              <>
                <Icon name="check" size={14} /> Looks Good — Import {totalRowCount} Students
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

