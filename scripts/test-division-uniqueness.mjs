import assert from "node:assert/strict";

// Simulated in-memory database with PostgreSQL UNIQUE (center_id, name) and RLS behavior
class MockDatabase {
  constructor() {
    this.divisions = [];
    this.students = [];
    this.memberships = {
      "user-a": { user_id: "user-a", center_id: "center-a", role: "owner" },
      "user-b": { user_id: "user-b", center_id: "center-b", role: "owner" },
    };
    this.currentUser = null;
  }

  setUser(userId) {
    this.currentUser = userId ? { id: userId } : null;
  }

  getCurrentMembership(uid) {
    const mem = this.memberships[uid];
    return { membership: mem || null, error: null };
  }

  query(table) {
    const db = this;
    let filters = [];
    let selectFields = "*";
    let orderClause = null;

    const builder = {
      select(fields) {
        selectFields = fields;
        return builder;
      },
      eq(col, val) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      neq(col, val) {
        filters.push((row) => row[col] !== val);
        return builder;
      },
      order(col, opts) {
        orderClause = { col, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit(n) {
        return builder;
      },
      async then(resolve, reject) {
        try {
          let rows = [...(db[table] || [])];
          for (const f of filters) {
            rows = rows.filter(f);
          }
          resolve({ data: rows, error: null });
        } catch (e) {
          resolve({ data: null, error: e });
        }
      },
      async insert(record) {
        // Enforce composite uniqueness: UNIQUE (center_id, name)
        if (table === "divisions") {
          const duplicate = db.divisions.find(
            (d) => d.center_id === record.center_id && d.name.toLowerCase() === record.name.toLowerCase()
          );
          if (duplicate) {
            return {
              data: null,
              error: {
                code: "23505",
                message: 'duplicate key value violates unique constraint "divisions_center_id_name_key"',
              },
            };
          }
        }
        const newRecord = {
          id: `div-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...record,
        };
        db[table].push(newRecord);
        return { data: [newRecord], error: null };
      },
      update(updates) {
        return {
          eq(col1, val1) {
            return {
              eq(col2, val2) {
                return {
                  select() {
                    const matched = db[table].filter((r) => r[col1] === val1 && r[col2] === val2);
                    if (matched.length === 0) {
                      return Promise.resolve({ data: [], error: null });
                    }
                    if (table === "divisions" && updates.name) {
                      const duplicate = db.divisions.find(
                        (d) =>
                          d.id !== val1 &&
                          d.center_id === val2 &&
                          d.name.toLowerCase() === updates.name.toLowerCase()
                      );
                      if (duplicate) {
                        return Promise.resolve({
                          data: null,
                          error: {
                            code: "23505",
                            message: 'duplicate key value violates unique constraint "divisions_center_id_name_key"',
                          },
                        });
                      }
                    }
                    matched.forEach((r) => Object.assign(r, updates));
                    return Promise.resolve({ data: matched, error: null });
                  },
                };
              },
            };
          },
        };
      },
      delete() {
        return {
          eq(col1, val1) {
            return {
              eq(col2, val2) {
                return {
                  select() {
                    const initialLen = db[table].length;
                    const toDelete = db[table].filter((r) => r[col1] === val1 && r[col2] === val2);
                    db[table] = db[table].filter((r) => !(r[col1] === val1 && r[col2] === val2));
                    return Promise.resolve({ data: toDelete, error: null });
                  },
                };
              },
            };
          },
        };
      },
    };
    return builder;
  }
}

// Instantiate mock
const mockDb = new MockDatabase();

// Mock Supabase client mirroring the real implementation
const mockSupabase = {
  auth: {
    getUser: async () => ({ data: { user: mockDb.currentUser }, error: null }),
  },
  from: (table) => mockDb.query(table),
};

// Mirror functions from divisionService.js
const requireCenterId = async () => {
  const { data: auth } = await mockSupabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error } = mockDb.getCurrentMembership(uid);
  if (error) throw new Error(error);
  if (!membership) throw new Error("No center found for this account. Please complete onboarding first.");
  return membership.center_id;
};

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

const listDivisions = async () => {
  const center_id = await requireCenterId();
  const { data: divisions, error } = await mockSupabase
    .from("divisions")
    .select("id, center_id, name, status, created_at, updated_at")
    .eq("center_id", center_id)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load divisions. Please try again.");
  return divisions ?? [];
};

const saveDivision = async (v, id) => {
  try {
    const center_id = await requireCenterId();
    const errors = {};
    const trimmedName = v?.name?.trim();
    if (!trimmedName) errors.name = "Division name is required.";
    if (Object.keys(errors).length) return { errors };

    // Duplicate check: scoped strictly to the current user's center_id.
    let checkQuery = mockSupabase
      .from("divisions")
      .select("id, name")
      .eq("center_id", center_id);
    if (id) {
      checkQuery = checkQuery.neq("id", id);
    }
    const { data: existing, error: fErr } = await checkQuery;
    if (fErr) return { error: "Unable to save division. Please try again." };

    if ((existing ?? []).some((d) => same(d.name, trimmedName))) {
      return { errors: { name: "A division with this name already exists." } };
    }

    if (id) {
      const { data: updated, error } = await mockSupabase
        .from("divisions")
        .update({ name: trimmedName, status: v.status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("center_id", center_id)
        .select();
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (error.code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
          return { errors: { name: "A division with this name already exists." } };
        }
        return { error: "Unable to save division. Please try again." };
      }
      if (!updated || updated.length === 0) {
        return { error: "Division not found or access denied." };
      }
    } else {
      const { error } = await mockSupabase
        .from("divisions")
        .insert({ center_id, name: trimmedName, status: v.status ?? "active" });
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (error.code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
          return { errors: { name: "A division with this name already exists." } };
        }
        return { error: "Unable to create division. Please try again." };
      }
    }
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to save division. Please try again." };
  }
};

const deleteDivision = async (id) => {
  try {
    const center_id = await requireCenterId();
    const { data: deleted, error } = await mockSupabase
      .from("divisions")
      .delete()
      .eq("id", id)
      .eq("center_id", center_id)
      .select();
    if (error) return { error: "Unable to delete division. Please try again." };
    if (!deleted || deleted.length === 0) {
      return { error: "Division not found or access denied." };
    }
    return { data: true };
  } catch (e) {
    return { error: e?.message || "Unable to delete division. Please try again." };
  }
};

// ==========================================
// TEST SUITE
// ==========================================
async function runTests() {
  console.log("Starting Division Uniqueness & Multi-Tenant Isolation Tests...\n");

  // 1. Center A creates "Science" -> success.
  console.log('Test 1: Center A creates "Science"');
  mockDb.setUser("user-a");
  const res1 = await saveDivision({ name: "Science", status: "active" });
  assert.equal(res1.data, true, "Center A should successfully create 'Science'");
  assert.equal(res1.errors, undefined);
  console.log('  ✓ Center A successfully created "Science"\n');

  // 2. Center A tries "Science" again -> rejected.
  console.log('Test 2: Center A tries "Science" again');
  mockDb.setUser("user-a");
  const res2 = await saveDivision({ name: "Science", status: "active" });
  assert.deepEqual(
    res2.errors,
    { name: "A division with this name already exists." },
    "Center A should be rejected when creating duplicate 'Science'"
  );
  console.log('  ✓ Center A duplicate "Science" correctly rejected with field error\n');

  // Case-insensitive check: Center A tries "science " with whitespace / lowercase
  console.log('Test 2b: Center A tries "  science  " (case-insensitive & trimmed duplicate)');
  mockDb.setUser("user-a");
  const res2b = await saveDivision({ name: "  science  ", status: "active" });
  assert.deepEqual(
    res2b.errors,
    { name: "A division with this name already exists." },
    "Center A should be rejected for case-insensitive duplicate"
  );
  console.log('  ✓ Center A case-insensitive duplicate correctly rejected\n');

  // 3. Center B creates "Science" -> success.
  console.log('Test 3: Center B creates "Science" (same name as Center A)');
  mockDb.setUser("user-b");
  const res3 = await saveDivision({ name: "Science", status: "active" });
  assert.equal(res3.data, true, "Center B should successfully create 'Science'");
  assert.equal(res3.errors, undefined);
  console.log('  ✓ Center B successfully created "Science" across different center\n');

  // 4. Center B tries "Science" again -> rejected.
  console.log('Test 4: Center B tries "Science" again');
  mockDb.setUser("user-b");
  const res4 = await saveDivision({ name: "Science", status: "active" });
  assert.deepEqual(
    res4.errors,
    { name: "A division with this name already exists." },
    "Center B should be rejected when creating duplicate 'Science'"
  );
  console.log('  ✓ Center B duplicate "Science" within its own center correctly rejected\n');

  // 5. Center A must never be able to see or modify Center B's divisions.
  console.log("Test 5: Center A must never be able to see or modify Center B's divisions");
  mockDb.setUser("user-b");
  const centerBDivisions = await listDivisions();
  assert.equal(centerBDivisions.length, 1);
  const centerBDivId = centerBDivisions[0].id;

  // Switch to Center A
  mockDb.setUser("user-a");
  const centerADivisions = await listDivisions();
  assert.equal(centerADivisions.length, 1);
  assert.equal(centerADivisions[0].name, "Science");
  assert.notEqual(centerADivisions[0].id, centerBDivId);
  console.log("  ✓ Center A lists only its own divisions (Center B's divisions invisible)");

  // Center A tries to edit Center B's division
  const editAttempt = await saveDivision({ name: "Hacked Science", status: "active" }, centerBDivId);
  assert.equal(editAttempt.error, "Division not found or access denied.");
  console.log("  ✓ Center A cannot modify Center B's division");

  // Center A tries to delete Center B's division
  const deleteAttempt = await deleteDivision(centerBDivId);
  assert.equal(deleteAttempt.error, "Division not found or access denied.");
  console.log("  ✓ Center A cannot delete Center B's division");

  // Center B's division still intact
  mockDb.setUser("user-b");
  const checkCenterB = await listDivisions();
  assert.equal(checkCenterB.length, 1);
  assert.equal(checkCenterB[0].name, "Science");
  console.log("  ✓ Center B's division remains untouched\n");

  // Security test: Center A passing arbitrary center_id in payload
  mockDb.setUser("user-a");
  const spoofAttempt = await saveDivision({ center_id: "center-b", name: "Art", status: "active" });
  assert.equal(spoofAttempt.data, true);
  // Verify it was created under center-a, NOT center-b
  const divArt = mockDb.divisions.find((d) => d.name === "Art");
  assert.equal(divArt.center_id, "center-a");
  console.log("  ✓ Arbitrary center_id in payload is safely ignored; center derived from authenticated context\n");

  console.log("All 5 test cases PASSED successfully!");
}

runTests();

