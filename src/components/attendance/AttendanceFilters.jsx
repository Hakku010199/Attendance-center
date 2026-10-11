export default function AttendanceFilters({
  date,
  onDateChange,
  divisionId,
  onDivisionChange,
  divisions = [],
  studentCounts = {},
  maxDate,
  loading = false,
}) {
  return (
    <div className="attendance-filters">
      <div className="filter-group filter-group--date">
        <label htmlFor="att-filter-date" className="filter-label">Date</label>
        <input
          id="att-filter-date"
          type="date"
          className="control date-input"
          value={date}
          max={maxDate}
          onChange={(e) => onDateChange(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="filter-group filter-group--division">
        <label htmlFor="att-filter-division" className="filter-label">Division</label>
        <select
          id="att-filter-division"
          className="control select"
          value={divisionId}
          onChange={(e) => onDivisionChange(e.target.value)}
          disabled={loading || (divisions.length === 0 && !divisionId)}
        >
          {divisionId && !divisions.some((d) => d.id === divisionId) && (
            <option value={divisionId}>
              {divisions.length === 0 ? "Loading divisions…" : "Selected Division"}
            </option>
          )}
          {divisions.length === 0 && !divisionId && (
            <option value="">No divisions available</option>
          )}
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

