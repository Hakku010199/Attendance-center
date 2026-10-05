// Mock store. Shapes mirror the future tables: centers, divisions, students, attendance_records.
// Every row would carry a center_id in Supabase; here the single mock center is implied.
export const mockCenter = { name: "ABC Academy", email: "info@abcacademy.com", phone: "+91 98765 43210", address: "12 Main Road, Kozhikode, Kerala" };
export const mockUser = { name: "John Doe", email: "john@example.com", role: "Center Owner" };

export const todayISO = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const NAMES = ["John Smith", "Sarah Thomas", "Priya Nair", "Arjun Menon", "Fatima Khan", "Rahul Das", "Anita Joseph", "Kiran Raj", "Meera Pillai", "David George"];
let n = 0;
const makeStudents = (divisionId, count) => Array.from({ length: count }, (_, i) => {
  n += 1;
  return { id: `s${n}`, studentId: `STU${String(n).padStart(3, "0")}`, name: `${NAMES[(n - 1) % 10]}${n > 10 ? " " + String.fromCharCode(64 + Math.ceil(n / 10)) : ""}`, rollNumber: i + 1, divisionId, status: "active" };
});

export const db = {
  divisions: [
    { id: "d1", name: "Division A", status: "active", createdAt: "2026-10-05" },
    { id: "d2", name: "Division B", status: "active", createdAt: "2026-10-05" },
    { id: "d3", name: "Division C", status: "inactive", createdAt: "2026-09-20" },
  ],
  students: [...makeStudents("d1", 24), ...makeStudents("d2", 22), ...makeStudents("d3", 14)],
  absent: { [`${todayISO()}|d1`]: ["s3", "s9"], [`${todayISO()}|d2`]: ["s28"] }, // "date|divisionId" -> absent student ids
  weekly: [{ label: "Mon", value: 92 }, { label: "Tue", value: 94 }, { label: "Wed", value: 90 }, { label: "Thu", value: 96 }, { label: "Fri", value: 93 }],
  performance: [{ label: "Division A", value: 94 }, { label: "Division B", value: 91 }, { label: "Division C", value: 89 }],
  activity: [
    { text: "John Smith marked attendance", time: "10 minutes ago" },
    { text: "Division A attendance completed", time: "25 minutes ago" },
    { text: "Student Sarah added", time: "1 hour ago" },
    { text: "Division B updated", time: "2 hours ago" },
  ],
};
