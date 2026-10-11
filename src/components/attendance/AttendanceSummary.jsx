import SummaryCard from "./SummaryCard.jsx";

export default function AttendanceSummary({ total = 0, present = 0, absent = 0 }) {
  return (
    <div className="attendance-summary">
      <SummaryCard label="TOTAL" value={total} variant="neutral" />
      <SummaryCard label="PRESENT" value={present} variant="present" />
      <SummaryCard label="ABSENT" value={absent} variant="absent" />
    </div>
  );
}

