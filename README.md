# Center Portal (React + Vite, frontend only)

    npm install
    npm run dev
    npm run build

Routes: `/` Dashboard, `/divisions`, `/students`, `/attendance`, `/reports`, `/settings`, `/onboarding`.

## Ready for Supabase later
- `src/data/mockData.js`  mock store (mirrors future tables: centers, divisions, students, attendance_records).
- `src/services/*`        the ONLY place that reads/writes data and enforces rules. Replace the bodies with
                          Supabase queries; keep the return shapes ({ data } | { errors } | { error }).
- `getCurrentCenter()`    in centerService returns the current center. Later it must come from the authenticated
                          session (center_members), never from the URL or a hardcoded id. With RLS, every query is
                          scoped to that center on the server.
- Pages/components never import mock data directly (except date helper); they call services through `useLoad`.
No auth, registration or backend yet. Data resets on reload.
