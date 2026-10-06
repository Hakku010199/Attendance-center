import { supabase } from "../lib/supabase.js";
import { ALLOWED_TARGET_FIELDS, CANONICAL_FIELDS, norm } from "../lib/excelParser.js";
import { getCurrentMembership } from "./centerService.js";
import { notifyDivisionsUpdated, notifyAttendanceUpdated } from "../utils/events.js";

export const CONFIDENCE_THRESHOLD = 0.8;

// Field pattern matchers for deterministic heuristic analysis & validation
const FIELD_PATTERNS = [
  {
    field: "roll_number",
    high: [
      "rollnumber",
      "rollno",
      "roll",
      "admissionno",
      "admissionnumber",
      "admno",
      "admnno",
      "studentid",
      "srno",
      "slno",
      "idno",
      "regno",
      "registrationno",
    ],
    medium: ["admission", "id", "sr", "sl", "admn"],
  },
  {
    field: "name",
    high: [
      "studentfullname",
      "studentname",
      "candidatename",
      "fullname",
      "pupilname",
      "nameofstudent",
      "name",
    ],
    medium: ["candidate", "student", "pupil"],
  },
  {
    field: "division",
    high: [
      "division",
      "class",
      "std",
      "standard",
      "grade",
      "section",
      "sec",
      "classdivision",
      "classdiv",
    ],
    medium: ["div"],
  },
  {
    field: "phone",
    high: [
      "mobileno",
      "mobilenumber",
      "mobile",
      "phoneno",
      "phonenumber",
      "contactno",
      "contactnumber",
      "phone",
      "contact",
      "cellphone",
      "cell",
      "whatsapp",
    ],
    medium: ["tel", "telephone"],
  },
  {
    field: "email",
    high: ["email", "emailid", "emailaddress", "mailid", "mail"],
    medium: ["electronicmail"],
  },
  {
    field: "gender",
    high: ["gender", "sex"],
    medium: [],
  },
  {
    field: "date_of_birth",
    high: ["dateofbirth", "dob", "birthdate", "birthdate"],
    medium: ["birth"],
  },
  {
    field: "address",
    high: ["address", "residentialaddress", "communicationaddress", "residence"],
    medium: ["addr", "location"],
  },
];

const IGNORE_PATTERNS = [
  "parent",
  "father",
  "mother",
  "guardian",
  "remarks",
  "remark",
  "fee",
  "fees",
  "photo",
  "aadhar",
  "aadhaar",
  "religion",
  "caste",
  "blood",
  "bloodgroup",
  "transport",
  "bus",
  "van",
  "signature",
  "category",
];

/**
 * Deterministic rule-based column analyzer.
 * Used as standalone analyzer or fallback when Gemini is offline/unconfigured.
 */
export const heuristicAnalyzeColumns = (headers, sampleRows = []) => {
  const mapping = [];
  const ignoredColumns = [];
  const usedFields = new Set();

  for (const rawHeader of headers) {
    const n = norm(rawHeader);

    // Explicit ignore check
    const isExplicitIgnore = IGNORE_PATTERNS.some((pat) => n.includes(pat));
    if (isExplicitIgnore) {
      mapping.push({
        excelColumn: rawHeader,
        targetField: "ignore",
        confidence: 0.95,
        reasoning: "Ignored secondary or non-student column",
      });
      ignoredColumns.push(rawHeader);
      continue;
    }

    let bestMatch = null;
    let highestConfidence = 0;

    for (const { field, high, medium } of FIELD_PATTERNS) {
      if (usedFields.has(field)) continue;

      if (high.some((k) => n === k)) {
        bestMatch = field;
        highestConfidence = 0.98;
        break;
      } else if (high.some((k) => n.includes(k) || k.includes(n))) {
        if (highestConfidence < 0.91) {
          bestMatch = field;
          highestConfidence = 0.91;
        }
      } else if (medium.some((k) => n === k || n.includes(k))) {
        if (highestConfidence < 0.82) {
          bestMatch = field;
          highestConfidence = 0.82;
        }
      }
    }

    // Inspect sample cell values to reinforce confidence
    if (bestMatch && sampleRows.length > 0) {
      const sampleValues = sampleRows.map((r) => String(r[rawHeader] ?? "").trim()).filter(Boolean);
      if (bestMatch === "phone") {
        const looksLikePhone = sampleValues.some((v) => /^\+?[0-9\s-]{7,15}$/.test(v));
        if (looksLikePhone) highestConfidence = Math.max(highestConfidence, 0.95);
      } else if (bestMatch === "email") {
        const looksLikeEmail = sampleValues.some((v) => /^\S+@\S+\.\S+$/.test(v));
        if (looksLikeEmail) highestConfidence = Math.max(highestConfidence, 0.98);
      } else if (bestMatch === "roll_number") {
        const looksLikeId = sampleValues.some((v) => /^[a-zA-Z0-9_-]{1,15}$/.test(v));
        if (looksLikeId) highestConfidence = Math.max(highestConfidence, 0.96);
      }
    }

    if (bestMatch && highestConfidence >= 0.8) {
      mapping.push({
        excelColumn: rawHeader,
        targetField: bestMatch,
        confidence: highestConfidence,
        reasoning: `Matched canonical field "${bestMatch}"`,
      });
      usedFields.add(bestMatch);
    } else {
      mapping.push({
        excelColumn: rawHeader,
        targetField: "ignore",
        confidence: 0.5,
        reasoning: "No clear canonical student field match",
      });
      ignoredColumns.push(rawHeader);
    }
  }

  return { mapping, ignoredColumns, provider: "heuristic" };
};

/**
 * Validates and normalizes raw AI / heuristic output.
 * STRICT ENFORCEMENT:
 * - Never trusts AI blindly
 * - Disallows invalid target fields
 * - Prevents multiple Excel columns from mapping to the same target field (keeps highest confidence)
 * - Flags confidence < 0.80 as "Needs review"
 * - Ensures all Excel columns are represented
 */
export const validateAndNormalizeMapping = (rawResult, originalHeaders = []) => {
  const warnings = [];
  const normalizedMapping = [];
  const ignoredColumns = new Set(rawResult?.ignoredColumns || []);

  const inputMapping = Array.isArray(rawResult?.mapping) ? rawResult.mapping : [];
  const processedColumns = new Set();

  // Step 1: Clean and validate each returned mapping
  for (const entry of inputMapping) {
    const col = entry?.excelColumn;
    if (!col || !originalHeaders.includes(col)) continue;
    if (processedColumns.has(col)) continue;
    processedColumns.add(col);

    let target = String(entry.targetField || "ignore").toLowerCase().trim();
    let confidence = typeof entry.confidence === "number" ? Math.max(0, Math.min(1, entry.confidence)) : 0.7;

    if (!ALLOWED_TARGET_FIELDS.has(target)) {
      warnings.push(`AI returned invalid field "${target}" for column "${col}". Set to Ignore.`);
      target = "ignore";
      confidence = 0;
    }

    const needsReview = target !== "ignore" && confidence < CONFIDENCE_THRESHOLD;

    normalizedMapping.push({
      excelColumn: col,
      targetField: target,
      confidence: Number(confidence.toFixed(2)),
      needsReview,
      reasoning: entry.reasoning || (target === "ignore" ? "Ignored column" : `Detected ${target}`),
    });
  }

  // Step 2: Ensure any missing headers from originalHeaders are added
  for (const h of originalHeaders) {
    if (!processedColumns.has(h)) {
      normalizedMapping.push({
        excelColumn: h,
        targetField: "ignore",
        confidence: 0,
        needsReview: false,
        reasoning: "Not mapped by AI; defaulted to Ignore",
      });
      ignoredColumns.add(h);
    }
  }

  // Step 3: Enforce single-mapping uniqueness for target fields (excluding "ignore")
  const fieldOwner = new Map(); // targetField -> mapping entry
  for (const m of normalizedMapping) {
    if (!m.targetField || m.targetField === "ignore") continue;

    if (!fieldOwner.has(m.targetField)) {
      fieldOwner.set(m.targetField, m);
    } else {
      const existing = fieldOwner.get(m.targetField);
      // Conflicting duplicate mapping
      if (m.confidence > existing.confidence) {
        warnings.push(
          `Conflict: Both "${existing.excelColumn}" and "${m.excelColumn}" mapped to "${m.targetField}". Kept "${m.excelColumn}" (${Math.round(m.confidence * 100)}%), set "${existing.excelColumn}" to Ignore.`
        );
        existing.targetField = "ignore";
        existing.needsReview = true;
        fieldOwner.set(m.targetField, m);
      } else {
        warnings.push(
          `Conflict: Both "${existing.excelColumn}" and "${m.excelColumn}" mapped to "${m.targetField}". Kept "${existing.excelColumn}" (${Math.round(existing.confidence * 100)}%), set "${m.excelColumn}" to Ignore.`
        );
        m.targetField = "ignore";
        m.needsReview = true;
      }
    }
  }

  // Step 4: Check for critical fields (roll_number and name)
  const mappedFields = new Set(normalizedMapping.map((m) => m.targetField));
  const missingCritical = [];
  if (!mappedFields.has("roll_number")) missingCritical.push("Roll Number");
  if (!mappedFields.has("name")) missingCritical.push("Name");

  return {
    mapping: normalizedMapping,
    ignoredColumns: normalizedMapping.filter((m) => m.targetField === "ignore").map((m) => m.excelColumn),
    warnings,
    missingCritical,
    hasCriticalFields: missingCritical.length === 0,
  };
};

/**
 * Calls the secure server-side endpoint for Gemini AI column mapping.
 * Never exposes GEMINI_API_KEY to browser JS.
 * Sends only: { headers, sampleRows } (up to 10 rows).
 */
export const requestAiColumnMapping = async (headers, sampleRows) => {
  const payload = {
    headers: headers || [],
    sampleRows: (sampleRows || []).slice(0, 10),
  };

  // 1. Try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke("map-columns", {
      body: payload,
    });
    if (!error && data?.mapping) {
      const validated = validateAndNormalizeMapping(data, headers);
      return {
        ...validated,
        provider: data.provider || "gemini-edge",
        isAiPowered: true,
      };
    }
  } catch {
    // Continue to serverless endpoint
  }

  // 2. Try serverless backend endpoint (/api/map-columns)
  try {
    const res = await fetch("/api/map-columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.mapping) {
        const validated = validateAndNormalizeMapping(data, headers);
        return {
          ...validated,
          provider: data.provider || "gemini-api",
          isAiPowered: data.provider !== "heuristic",
        };
      }
    }
  } catch {
    // Continue to heuristic fallback
  }

  // 3. Graceful heuristic fallback if server/AI endpoint is not configured yet
  const heuristic = heuristicAnalyzeColumns(headers, sampleRows);
  const validated = validateAndNormalizeMapping(heuristic, headers);
  return {
    ...validated,
    provider: "heuristic",
    isAiPowered: false,
    warnings: [
      ...validated.warnings,
      "AI service endpoint not reachable. Used smart pattern recognition for column mapping.",
    ],
  };
};

/**
 * Imports transformed student records and their divisions into Supabase.
 * - Enforces center scoping via current user membership.
 * - Automatically creates missing divisions in the current center.
 * - Maps students to divisions and validates roll number uniqueness per division.
 * - Emits cross-module sync events so the dashboard and students list refresh instantly.
 */
export const executeStudentImport = async ({
  transformedRows = [],
  defaultDivisionId = "",
  onProgress,
}) => {
  // 1. Authenticate & obtain current user's center_id
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error("Your session has expired. Please log in again.");
  const { membership, error: memErr } = await getCurrentMembership(uid);
  if (memErr || !membership?.center_id) {
    throw new Error(memErr || "No active center found for your account.");
  }
  const center_id = membership.center_id;

  if (onProgress) onProgress({ percent: 10, message: "Checking divisions..." });

  // 2. Fetch existing divisions for this center
  const { data: existingDivisions, error: divErr } = await supabase
    .from("divisions")
    .select("id, name, status")
    .eq("center_id", center_id);

  if (divErr) {
    throw new Error("Unable to check existing divisions. " + (divErr.message || ""));
  }

  // Create case-insensitive map of division name -> division id
  const divisionMap = new Map();
  (existingDivisions || []).forEach((d) => {
    if (d?.name) {
      divisionMap.set(d.name.toLowerCase().trim(), d.id);
    }
  });

  // Collect all unique division names from the input rows
  const newDivisionNames = new Set();
  for (const row of transformedRows) {
    const divName = String(row.division || "").trim();
    if (divName && !divisionMap.has(divName.toLowerCase())) {
      newDivisionNames.add(divName);
    }
  }

  const createdDivisions = [];
  // Auto-create any missing divisions for this center
  for (const divName of newDivisionNames) {
    const { data: created, error: createErr } = await supabase
      .from("divisions")
      .insert({
        center_id,
        name: divName,
        status: "active",
      })
      .select("id, name")
      .single();

    if (!createErr && created) {
      divisionMap.set(created.name.toLowerCase().trim(), created.id);
      createdDivisions.push(created.name);
    }
  }

  // If no division was provided in row and defaultDivisionId was not set,
  // ensure we have at least one fallback division (e.g. existing first or "General")
  let fallbackDivId = defaultDivisionId;
  if (!fallbackDivId && divisionMap.size > 0) {
    fallbackDivId = divisionMap.values().next().value;
  }
  if (!fallbackDivId) {
    // Create a "General" division
    const { data: genDiv } = await supabase
      .from("divisions")
      .insert({ center_id, name: "General", status: "active" })
      .select("id, name")
      .single();
    if (genDiv) {
      divisionMap.set("general", genDiv.id);
      createdDivisions.push("General");
      fallbackDivId = genDiv.id;
    }
  }

  if (onProgress) onProgress({ percent: 30, message: "Validating student records..." });

  // 3. Fetch existing students to check duplicate student_id and roll numbers per division
  const { data: existingStudents, error: stuErr } = await supabase
    .from("students")
    .select("id, student_id, roll_number, division_id")
    .eq("center_id", center_id);

  if (stuErr) {
    throw new Error("Unable to check existing students. " + (stuErr.message || ""));
  }

  const usedStudentIds = new Set(
    (existingStudents || []).map((s) => String(s.student_id || "").toLowerCase().trim()).filter(Boolean)
  );

  // Map of division_id -> Set of roll numbers
  const usedRollsByDiv = new Map();
  (existingStudents || []).forEach((s) => {
    if (s.division_id && s.roll_number !== null && s.roll_number !== undefined) {
      if (!usedRollsByDiv.has(s.division_id)) usedRollsByDiv.set(s.division_id, new Set());
      usedRollsByDiv.get(s.division_id).add(Number(s.roll_number));
    }
  });

  const studentsToInsert = [];
  const issues = [];
  let duplicateRollNumbers = 0;
  let invalidRecords = 0;
  let skippedRows = 0;

  for (let idx = 0; idx < transformedRows.length; idx++) {
    const row = transformedRows[idx];
    const rowNo = row._rowId || idx + 1;
    const name = String(row.name || "").trim();

    // Check if entire row is empty
    if (!name && !row.roll_number && !row.phone && !row.division) {
      skippedRows++;
      continue;
    }

    if (!name) {
      invalidRecords++;
      issues.push({
        rowNumber: rowNo,
        rollNumber: row.roll_number || "—",
        name: "—",
        reason: "Missing student name",
      });
      continue;
    }

    // Determine division
    const rawDiv = String(row.division || "").trim();
    const divId = (rawDiv && divisionMap.get(rawDiv.toLowerCase())) || fallbackDivId;

    if (!divId) {
      invalidRecords++;
      issues.push({
        rowNumber: rowNo,
        rollNumber: row.roll_number || "—",
        name,
        reason: "Could not assign division",
      });
      continue;
    }

    if (!usedRollsByDiv.has(divId)) usedRollsByDiv.set(divId, new Set());
    const divRollSet = usedRollsByDiv.get(divId);

    // Determine roll number
    let rollNum;
    const rawRoll = String(row.roll_number || "").trim();
    if (/^\d+$/.test(rawRoll)) {
      rollNum = parseInt(rawRoll, 10);
    } else if (rawRoll && /\d+/.test(rawRoll)) {
      const match = rawRoll.match(/\d+/);
      rollNum = match ? parseInt(match[0], 10) : null;
    }

    if (rollNum === null || rollNum === undefined || isNaN(rollNum)) {
      let maxRoll = 0;
      for (const r of divRollSet) {
        if (r > maxRoll) maxRoll = r;
      }
      rollNum = maxRoll + 1;
    }

    // Check duplicate roll number in this division
    if (divRollSet.has(rollNum)) {
      duplicateRollNumbers++;
      issues.push({
        rowNumber: rowNo,
        rollNumber: rollNum,
        name,
        reason: `Roll number ${rollNum} already used in this division`,
      });
      continue;
    }
    divRollSet.add(rollNum);

    // Determine unique student_id
    let studentId = rawRoll ? `STU${String(rollNum).padStart(3, "0")}` : "";
    if (!studentId || usedStudentIds.has(studentId.toLowerCase())) {
      let counter = 1;
      let candidate = `STU${String(rollNum).padStart(3, "0")}`;
      while (usedStudentIds.has(candidate.toLowerCase())) {
        candidate = `STU${String(rollNum).padStart(3, "0")}-${counter++}`;
      }
      studentId = candidate;
    }
    usedStudentIds.add(studentId.toLowerCase());

    const mobile = String(row.phone || row.mobile || "").trim();

    studentsToInsert.push({
      center_id,
      student_id: studentId,
      name,
      roll_number: rollNum,
      division_id: divId,
      status: "active",
      ...(mobile ? { mobile } : {}),
      _rawMobile: mobile,
      _rowNo: rowNo,
    });
  }

  if (onProgress) onProgress({ percent: 60, message: `Importing ${studentsToInsert.length} students...` });

  const isColumnMissing = (err, col) => {
    if (!err) return false;
    const msg = String(err.message || "").toLowerCase();
    const c = String(col).toLowerCase();
    return (
      msg.includes(c) &&
      (msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("could not find") ||
        err.code === "PGRST204" ||
        err.code === "42703")
    );
  };

  // 4. Insert students in chunks
  let successfullyImported = 0;
  let activePhoneCol = "mobile";
  const CHUNK_SIZE = 50;

  for (let i = 0; i < studentsToInsert.length; i += CHUNK_SIZE) {
    const chunkWithMeta = studentsToInsert.slice(i, i + CHUNK_SIZE);
    let chunk = chunkWithMeta.map(({ _rowNo, _rawMobile, ...student }) => {
      if (!activePhoneCol) {
        const { mobile, phone, ...noPhone } = student;
        return noPhone;
      }
      return student;
    });

    let { error: insertErr } = await supabase.from("students").insert(chunk);

    // If 'mobile' column is missing from schema cache, fallback to 'phone' or strip
    if (insertErr && (isColumnMissing(insertErr, "mobile") || isColumnMissing(insertErr, "phone"))) {
      if (activePhoneCol === "mobile") {
        // Try with 'phone' column name
        const chunkPhone = chunkWithMeta.map(({ _rowNo, _rawMobile, mobile, ...rest }) => ({
          ...rest,
          ...(_rawMobile ? { phone: _rawMobile } : {}),
        }));
        const retryPhone = await supabase.from("students").insert(chunkPhone);
        if (!retryPhone.error) {
          insertErr = null;
          activePhoneCol = "phone";
        } else if (isColumnMissing(retryPhone.error, "phone") || isColumnMissing(retryPhone.error, "mobile")) {
          // Neither column exists in database schema: strip phone/mobile completely
          const chunkNoPhone = chunkWithMeta.map(({ _rowNo, _rawMobile, mobile, phone, ...rest }) => rest);
          const retryNoPhone = await supabase.from("students").insert(chunkNoPhone);
          insertErr = retryNoPhone.error;
          activePhoneCol = null;
        } else {
          insertErr = retryPhone.error;
        }
      } else {
        // Strip phone completely
        const chunkNoPhone = chunkWithMeta.map(({ _rowNo, _rawMobile, mobile, phone, ...rest }) => rest);
        const retryNoPhone = await supabase.from("students").insert(chunkNoPhone);
        insertErr = retryNoPhone.error;
        activePhoneCol = null;
      }
    }

    if (insertErr) {
      // Chunk failed as a batch — fallback to row-by-row to rescue valid rows
      for (const item of chunkWithMeta) {
        let { _rowNo, _rawMobile, ...singleStudent } = item;
        if (!activePhoneCol) {
          const { mobile, phone, ...noPhone } = singleStudent;
          singleStudent = noPhone;
        }

        let { error: singleErr } = await supabase.from("students").insert(singleStudent);
        if (singleErr && (isColumnMissing(singleErr, "mobile") || isColumnMissing(singleErr, "phone"))) {
          const { mobile, phone, ...rest } = singleStudent;
          const retrySingle = await supabase.from("students").insert(rest);
          singleErr = retrySingle.error;
          activePhoneCol = null;
        }

        if (singleErr) {
          invalidRecords++;
          issues.push({
            rowNumber: _rowNo,
            rollNumber: singleStudent.roll_number,
            name: singleStudent.name,
            reason: singleErr.message || "Failed to save student",
          });
        } else {
          successfullyImported++;
        }
      }
    } else {
      successfullyImported += chunk.length;
    }

    if (onProgress) {
      const currentPct = 60 + Math.round(((i + chunk.length) / Math.max(1, studentsToInsert.length)) * 35);
      onProgress({
        percent: Math.min(95, currentPct),
        message: `Saved ${successfullyImported} of ${studentsToInsert.length} students...`,
      });
    }
  }

  // 5. Trigger notifications for cross-module sync
  notifyDivisionsUpdated();
  notifyAttendanceUpdated();

  if (onProgress) onProgress({ percent: 100, message: "Import complete!" });

  return {
    totalRowsRead: transformedRows.length,
    successfullyImported,
    duplicateRollNumbers,
    invalidRecords,
    skippedRows,
    createdDivisions,
    issues,
  };
};

