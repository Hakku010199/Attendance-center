import * as XLSX from "xlsx";

export const CANONICAL_FIELDS = [
  { value: "roll_number", label: "Roll Number", required: true, description: "Student roll or admission number" },
  { value: "name", label: "Name", required: true, description: "Student full name" },
  { value: "division", label: "Division", required: false, description: "Class / grade / division / section" },
  { value: "phone", label: "Phone", required: false, description: "Mobile or contact number" },
  { value: "email", label: "Email", required: false, description: "Email address" },
  { value: "gender", label: "Gender", required: false, description: "Gender (M/F/Other)" },
  { value: "date_of_birth", label: "Date of Birth", required: false, description: "Date of birth" },
  { value: "address", label: "Address", required: false, description: "Residential address" },
  { value: "ignore", label: "Ignore", required: false, description: "Skip this column" },
];

export const ALLOWED_TARGET_FIELDS = new Set(CANONICAL_FIELDS.map((f) => f.value));
export const CONFIDENCE_THRESHOLD = 0.8;

/**
 * Normalizes text for comparison.
 */
export const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Formats byte size into human readable string.
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

/**
 * Validates file extension and mime type.
 */
export const isSupportedFile = (file) => {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");
};

/**
 * Detects the index of the header row in a 2D sheet array.
 * Looks through the first 10 rows for the row with the most text columns.
 */
export const findHeaderRowIndex = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let bestIndex = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || [];
    // Count non-empty text cells
    const textCells = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
    if (textCells.length > maxScore) {
      maxScore = textCells.length;
      bestIndex = i;
    }
  }
  return bestIndex;
};

/**
 * Reads a file buffer and returns the SheetJS workbook.
 */
export const readWorkbook = async (file) => {
  if (!isSupportedFile(file)) {
    throw new Error("Unsupported file format. Please upload a .xlsx, .xls, or .csv file.");
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    raw: false,
    dateNF: "yyyy-mm-dd",
  });
  return workbook;
};

/**
 * Extracts sheet data including headers and up to maxSampleRows sample rows.
 * Does NOT send full file to AI — only headers and up to 10 sample rows.
 */
export const extractSheetData = (workbook, sheetName, maxSampleRows = 10) => {
  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Sheet "${name}" not found in workbook.`);

  // Convert sheet to array of rows
  const rawMatrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!rawMatrix || rawMatrix.length === 0) {
    return {
      sheetName: name,
      headers: [],
      sampleRows: [],
      totalRowCount: 0,
      headerRowIndex: 0,
      rawRows: [],
    };
  }

  const headerRowIdx = findHeaderRowIndex(rawMatrix);
  const rawHeaderRow = rawMatrix[headerRowIdx] || [];

  // Deduplicate and clean headers
  const seenHeaders = new Map();
  const headers = [];

  rawHeaderRow.forEach((h, colIdx) => {
    let clean = String(h ?? "").trim();
    if (!clean) clean = `Column_${colIdx + 1}`;
    if (seenHeaders.has(clean)) {
      const count = seenHeaders.get(clean) + 1;
      seenHeaders.set(clean, count);
      clean = `${clean}_${count}`;
    } else {
      seenHeaders.set(clean, 1);
    }
    headers.push(clean);
  });

  // Extract all data rows after the header
  const dataRowsRaw = rawMatrix.slice(headerRowIdx + 1);
  const validDataRows = dataRowsRaw.filter((row) =>
    (row || []).some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
  );

  // Take sample rows (up to maxSampleRows) formatted as objects
  const sampleRows = validDataRows.slice(0, maxSampleRows).map((row) => {
    const rowObj = {};
    headers.forEach((h, i) => {
      rowObj[h] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";
    });
    return rowObj;
  });

  return {
    sheetName: name,
    headers,
    sampleRows,
    totalRowCount: validDataRows.length,
    headerRowIndex: headerRowIdx,
    rawRows: validDataRows,
  };
};

/**
 * Transforms sample rows or all rows using the column mapping.
 * mapping: Array<{ excelColumn: string, targetField: string }>
 */
export const transformRows = (rows, headers, mapping) => {
  const mapLookup = new Map();
  for (const m of mapping || []) {
    if (m.targetField && m.targetField !== "ignore") {
      mapLookup.set(m.excelColumn, m.targetField);
    }
  }

  return (rows || []).map((row, idx) => {
    const transformed = {
      _rowId: idx + 1,
      roll_number: "",
      name: "",
      division: "",
      phone: "",
      email: "",
      gender: "",
      date_of_birth: "",
      address: "",
      _extra: {},
    };

    headers.forEach((h, colIdx) => {
      const val = Array.isArray(row) ? row[colIdx] : row[h];
      const cleanVal = val !== undefined && val !== null ? String(val).trim() : "";
      const target = mapLookup.get(h);

      if (target && target in transformed && target !== "_rowId" && target !== "_extra") {
        // If not already filled, set it
        if (!transformed[target]) {
          transformed[target] = cleanVal;
        }
      } else {
        transformed._extra[h] = cleanVal;
      }
    });

    return transformed;
  });
};
