import { useMemo } from "react";
import Icon from "../common/Icon.jsx";
import { CANONICAL_FIELDS, CONFIDENCE_THRESHOLD } from "../../lib/excelParser.js";

const TARGET_OPTIONS = CANONICAL_FIELDS.map((f) => ({
  value: f.value,
  label: f.label,
}));

export default function ColumnMapping({
  mapping = [],
  onChangeMapping,
  isAiPowered,
  provider,
  warnings = [],
}) {
  const handleFieldChange = (excelColumn, newField) => {
    const updated = mapping.map((m) => {
      if (m.excelColumn === excelColumn) {
        return {
          ...m,
          targetField: newField,
          confidence: newField === "ignore" ? 0 : 1.0, // Manual correction gets 100% confidence
          needsReview: false,
          isManual: true,
        };
      }
      return m;
    });
    onChangeMapping(updated);
  };

  // Detect duplicate target fields mapped across columns
  const duplicateCounts = useMemo(() => {
    const counts = {};
    for (const m of mapping) {
      if (m.targetField && m.targetField !== "ignore") {
        counts[m.targetField] = (counts[m.targetField] || 0) + 1;
      }
    }
    return counts;
  }, [mapping]);

  const hasDuplicateTargets = Object.values(duplicateCounts).some((c) => c > 1);

  // Status counters
  const mappedCount = mapping.filter((m) => m.targetField && m.targetField !== "ignore").length;
  const ignoredCount = mapping.filter((m) => !m.targetField || m.targetField === "ignore").length;
  const hasRollNumber = mapping.some((m) => m.targetField === "roll_number");
  const hasName = mapping.some((m) => m.targetField === "name");

  return (
    <div className="mapping-review-wrap">
      {/* Header Info Banner */}
      <div className="mapping-header-banner">
        <div className="mapping-stats">
          <span className="mapping-pill">
            <strong>{mapping.length}</strong> Columns Total
          </span>
          <span className="mapping-pill mapping-pill--success">
            <strong>{mappedCount}</strong> Mapped
          </span>
          <span className="mapping-pill mapping-pill--muted">
            <strong>{ignoredCount}</strong> Ignored
          </span>
        </div>

        <div className="mapping-badges">
          <span className={`status-pill ${hasRollNumber ? "status-pill--success" : "status-pill--warning"}`}>
            {hasRollNumber ? "✓ Roll Number Mapped" : "⚠ Roll Number Missing"}
          </span>
          <span className={`status-pill ${hasName ? "status-pill--success" : "status-pill--warning"}`}>
            {hasName ? "✓ Name Mapped" : "⚠ Name Missing"}
          </span>
          {isAiPowered ? (
            <span className="ai-badge">
              <Icon name="check" size={13} /> Gemini AI Analyzed
            </span>
          ) : (
            <span className="ai-badge ai-badge--heuristic">Smart Pattern Detection</span>
          )}
        </div>
      </div>

      {/* Warnings & Alerts */}
      {hasDuplicateTargets && (
        <div className="mapping-alert mapping-alert--warning" role="alert">
          <strong>Duplicate Target Field Warning:</strong> A field is mapped to multiple Excel columns. Please
          adjust so each field is mapped to only one column.
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div className="mapping-alert mapping-alert--info">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {/* Column Mapping Review Table */}
      <div className="table-wrap">
        <table className="table mapping-table">
          <thead>
            <tr>
              <th style={{ width: "32%" }}>Excel Column</th>
              <th style={{ width: "32%" }}>Detected Field</th>
              <th style={{ width: "18%" }}>Confidence</th>
              <th className="th-right" style={{ width: "18%" }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((item) => {
              const isIgnored = item.targetField === "ignore" || !item.targetField;
              const isDuplicate = duplicateCounts[item.targetField] > 1;
              const confidencePct = Math.round((item.confidence || 0) * 100);
              const needsReview = item.needsReview || (!isIgnored && item.confidence < CONFIDENCE_THRESHOLD);

              return (
                <tr
                  key={item.excelColumn}
                  className={`${isIgnored ? "mapping-row--ignored" : ""} ${isDuplicate ? "mapping-row--duplicate" : ""}`}
                >
                  <td data-label="Excel Column">
                    <strong className="mapping-col-name">{item.excelColumn}</strong>
                    {item.reasoning && (
                      <small className="muted" style={{ display: "block", fontSize: "0.75rem", marginTop: 2 }}>
                        {item.reasoning}
                      </small>
                    )}
                  </td>

                  <td data-label="Detected Field">
                    <select
                      className={`select mapping-select ${isDuplicate ? "control--error" : ""}`}
                      value={item.targetField || "ignore"}
                      onChange={(e) => handleFieldChange(item.excelColumn, e.target.value)}
                      aria-label={`Target field for ${item.excelColumn}`}
                    >
                      {TARGET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {isDuplicate && (
                      <small className="field-error" style={{ display: "block", marginTop: 3 }}>
                        Mapped multiple times
                      </small>
                    )}
                  </td>

                  <td data-label="Confidence">
                    {isIgnored ? (
                      <span className="muted">—</span>
                    ) : (
                      <div className="confidence-cell">
                        <span className={`confidence-val ${needsReview ? "confidence-val--low" : "confidence-val--high"}`}>
                          {item.isManual ? "Manual (100%)" : `${confidencePct}%`}
                        </span>
                        {needsReview && (
                          <span className="badge badge--warning" title="Confidence under 80% — please review">
                            Needs review
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td data-label="Action" className="th-right">
                    {isIgnored ? (
                      <span className="badge badge--inactive">Ignored</span>
                    ) : needsReview ? (
                      <span className="badge badge--warning">Review</span>
                    ) : (
                      <span className="badge badge--active">
                        <Icon name="check" size={12} /> Mapped
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

