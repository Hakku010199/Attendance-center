import assert from "node:assert/strict";
import {
  heuristicAnalyzeColumns,
  validateAndNormalizeMapping,
} from "../src/services/studentImportService.js";
import { transformRows } from "../src/lib/excelParser.js";

async function runTests() {
  console.log("Starting Smart Student Import & AI Column Mapping Tests...\n");

  // ==========================================
  // Test Case 1: Example A (Roll Number | Name | Division)
  // ==========================================
  console.log("Test 1: Example A (Roll Number | Name | Division)");
  const headersA = ["Roll Number", "Name", "Division"];
  const sampleRowsA = [
    { "Roll Number": "101", Name: "Aarav Sharma", Division: "10A" },
    { "Roll Number": "102", Name: "Diya Patel", Division: "10A" },
  ];

  const resultA = heuristicAnalyzeColumns(headersA, sampleRowsA);
  const validatedA = validateAndNormalizeMapping(resultA, headersA);

  assert.equal(validatedA.hasCriticalFields, true, "Example A must have critical fields");
  const mapA = Object.fromEntries(validatedA.mapping.map((m) => [m.excelColumn, m.targetField]));
  assert.equal(mapA["Roll Number"], "roll_number", "Roll Number -> roll_number");
  assert.equal(mapA["Name"], "name", "Name -> name");
  assert.equal(mapA["Division"], "division", "Division -> division");
  console.log("  ✓ Example A correctly mapped:", mapA, "\n");

  // ==========================================
  // Test Case 2: Example B (Admission No | Student Full Name | Class | Mobile)
  // ==========================================
  console.log("Test 2: Example B (Admission No | Student Full Name | Class | Mobile)");
  const headersB = ["Admission No", "Student Full Name", "Class", "Mobile"];
  const sampleRowsB = [
    { "Admission No": "ADM-2024-001", "Student Full Name": "Rahul Verma", Class: "8B", Mobile: "9876543210" },
    { "Admission No": "ADM-2024-002", "Student Full Name": "Pooja Hegde", Class: "8B", Mobile: "9876543211" },
  ];

  const resultB = heuristicAnalyzeColumns(headersB, sampleRowsB);
  const validatedB = validateAndNormalizeMapping(resultB, headersB);

  assert.equal(validatedB.hasCriticalFields, true);
  const mapB = Object.fromEntries(validatedB.mapping.map((m) => [m.excelColumn, m.targetField]));
  assert.equal(mapB["Admission No"], "roll_number", "Admission No -> roll_number");
  assert.equal(mapB["Student Full Name"], "name", "Student Full Name -> name");
  assert.equal(mapB["Class"], "division", "Class -> division");
  assert.equal(mapB["Mobile"], "phone", "Mobile -> phone");
  console.log("  ✓ Example B correctly mapped:", mapB, "\n");

  // ==========================================
  // Test Case 3: Example C (Student ID | Candidate Name | Std | Contact No | Parent Name)
  // ==========================================
  console.log("Test 3: Example C (Student ID | Candidate Name | Std | Contact No | Parent Name)");
  const headersC = ["Student ID", "Candidate Name", "Std", "Contact No", "Parent Name"];
  const sampleRowsC = [
    {
      "Student ID": "STU991",
      "Candidate Name": "Zoya Akhtar",
      Std: "7C",
      "Contact No": "+91 91234 56789",
      "Parent Name": "Javed Akhtar",
    },
  ];

  const resultC = heuristicAnalyzeColumns(headersC, sampleRowsC);
  const validatedC = validateAndNormalizeMapping(resultC, headersC);

  assert.equal(validatedC.hasCriticalFields, true);
  const mapC = Object.fromEntries(validatedC.mapping.map((m) => [m.excelColumn, m.targetField]));
  assert.equal(mapC["Student ID"], "roll_number", "Student ID -> roll_number");
  assert.equal(mapC["Candidate Name"], "name", "Candidate Name -> name");
  assert.equal(mapC["Std"], "division", "Std -> division");
  assert.equal(mapC["Contact No"], "phone", "Contact No -> phone");
  assert.equal(mapC["Parent Name"], "ignore", "Parent Name -> ignore");
  assert.ok(validatedC.ignoredColumns.includes("Parent Name"), "Parent Name must be in ignoredColumns list");
  console.log("  ✓ Example C correctly mapped:", mapC, "\n");

  // ==========================================
  // Test Case 4: Validation Rule - Duplicate target field prevention
  // ==========================================
  console.log("Test 4: Validation Rule - Duplicate target field resolution");
  const rawWithDuplicate = {
    mapping: [
      { excelColumn: "Adm No", targetField: "roll_number", confidence: 0.95 },
      { excelColumn: "Old Roll", targetField: "roll_number", confidence: 0.82 },
      { excelColumn: "Full Name", targetField: "name", confidence: 0.99 },
    ],
  };
  const headersDup = ["Adm No", "Old Roll", "Full Name"];
  const validatedDup = validateAndNormalizeMapping(rawWithDuplicate, headersDup);

  const mapDup = Object.fromEntries(validatedDup.mapping.map((m) => [m.excelColumn, m.targetField]));
  assert.equal(mapDup["Adm No"], "roll_number", "Higher confidence should be kept as roll_number");
  assert.equal(mapDup["Old Roll"], "ignore", "Lower confidence duplicate should be set to ignore");
  assert.ok(validatedDup.warnings.length > 0, "Warning should be emitted for duplicate target field");
  console.log("  ✓ Duplicate field conflict resolved safely:", mapDup, "\n");

  // ==========================================
  // Test Case 5: Validation Rule - Low confidence (< 0.80) flagged for review
  // ==========================================
  console.log("Test 5: Validation Rule - Confidence < 0.80 marked as Needs Review");
  const rawLowConf = {
    mapping: [
      { excelColumn: "Roll", targetField: "roll_number", confidence: 0.99 },
      { excelColumn: "Name", targetField: "name", confidence: 0.95 },
      { excelColumn: "Maybe Division", targetField: "division", confidence: 0.65 },
    ],
  };
  const headersLow = ["Roll", "Name", "Maybe Division"];
  const validatedLow = validateAndNormalizeMapping(rawLowConf, headersLow);

  const maybeDiv = validatedLow.mapping.find((m) => m.excelColumn === "Maybe Division");
  assert.equal(maybeDiv.needsReview, true, "Confidence < 0.80 must have needsReview: true");
  console.log("  ✓ Confidence < 0.80 correctly flagged as needsReview: true\n");

  // ==========================================
  // Test Case 6: Validation Rule - Disallow invalid target fields
  // ==========================================
  console.log("Test 6: Validation Rule - Reject invalid/hallucinated target fields");
  const rawInvalid = {
    mapping: [
      { excelColumn: "Roll", targetField: "roll_number", confidence: 0.99 },
      { excelColumn: "Name", targetField: "name", confidence: 0.95 },
      { excelColumn: "Fake", targetField: "hacked_column_id", confidence: 0.99 },
    ],
  };
  const headersInvalid = ["Roll", "Name", "Fake"];
  const validatedInvalid = validateAndNormalizeMapping(rawInvalid, headersInvalid);

  const fakeCol = validatedInvalid.mapping.find((m) => m.excelColumn === "Fake");
  assert.equal(fakeCol.targetField, "ignore", "Invalid field must be forced to ignore");
  console.log("  ✓ Hallucinated target field safely converted to 'ignore'\n");

  // ==========================================
  // Test Case 7: Data Transformation Preview
  // ==========================================
  console.log("Test 7: Data Transformation Preview (In-memory, non-destructive)");
  const rowsToTransform = [
    { "Admission No": "STU001", "Student Full Name": "Rahul", Class: "8A", Mobile: "9876543210" },
    { "Admission No": "STU002", "Student Full Name": "Ahmed", Class: "8A", Mobile: "9876543211" },
  ];
  const transformed = transformRows(rowsToTransform, headersB, validatedB.mapping);

  assert.equal(transformed.length, 2);
  assert.equal(transformed[0].roll_number, "STU001");
  assert.equal(transformed[0].name, "Rahul");
  assert.equal(transformed[0].division, "8A");
  assert.equal(transformed[0].phone, "9876543210");
  assert.equal(transformed[1].roll_number, "STU002");
  assert.equal(transformed[1].name, "Ahmed");
  console.log("  ✓ Transformed preview rows match expectation:", transformed, "\n");

  console.log("All 7 Smart Student Import tests PASSED successfully!");
}

runTests();

