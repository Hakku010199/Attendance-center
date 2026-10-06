// Serverless Function: POST /api/map-columns
// Securely calls Gemini 3.8 Flash using server-side GEMINI_API_KEY.
// Never exposes the API key to the client.

import { GoogleGenAI, Type } from "@google/genai";

const CANONICAL_TARGET_FIELDS = [
  "roll_number",
  "name",
  "division",
  "phone",
  "email",
  "gender",
  "date_of_birth",
  "address",
  "ignore",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { headers = [], sampleRows = [] } = req.body || {};

  if (!Array.isArray(headers) || headers.length === 0) {
    return res.status(400).json({ error: "Missing or invalid headers array" });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // If GEMINI_API_KEY is not set on the server, return heuristic detection
    const fallbackMapping = headers.map((h) => {
      const lower = String(h).toLowerCase().trim();
      let target = "ignore";
      let confidence = 0.5;

      if (lower.includes("roll") || lower.includes("admission") || lower.includes("admn") || lower.includes("sr no") || lower.includes("id")) {
        target = "roll_number";
        confidence = 0.95;
      } else if (lower.includes("name") && !lower.includes("parent") && !lower.includes("father") && !lower.includes("mother")) {
        target = "name";
        confidence = 0.98;
      } else if (lower.includes("class") || lower.includes("division") || lower.includes("std") || lower.includes("sec") || lower.includes("grade")) {
        target = "division";
        confidence = 0.92;
      } else if (lower.includes("mobile") || lower.includes("phone") || lower.includes("contact")) {
        target = "phone";
        confidence = 0.95;
      } else if (lower.includes("email") || lower.includes("mail")) {
        target = "email";
        confidence = 0.95;
      } else if (lower.includes("gender") || lower.includes("sex")) {
        target = "gender";
        confidence = 0.9;
      } else if (lower.includes("dob") || lower.includes("birth")) {
        target = "date_of_birth";
        confidence = 0.92;
      } else if (lower.includes("address") || lower.includes("residence")) {
        target = "address";
        confidence = 0.9;
      }

      return { excelColumn: h, targetField: target, confidence };
    });

    return res.status(200).json({
      mapping: fallbackMapping,
      ignoredColumns: fallbackMapping.filter((m) => m.targetField === "ignore").map((m) => m.excelColumn),
      provider: "heuristic",
      note: "GEMINI_API_KEY not configured on server; using heuristic detection",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are a school student database import assistant.
Your job is to examine Excel columns from school center records and match them to our canonical student fields.

Canonical fields:
- roll_number: Student roll number, admission number, registration number, student ID.
- name: Student's full name, candidate name, first/last name.
- division: Class, grade, division, section, standard (e.g. "8A", "Grade 5", "Std 10").
- phone: Student or primary contact mobile number, phone number.
- email: Student or parent email address.
- gender: Gender or sex (M/F/Male/Female/etc).
- date_of_birth: Date of birth / DOB.
- address: Residential address, location.
- ignore: Extra, non-student, or secondary fields like Parent Name, Father Name, Mother Name, Blood Group, Remarks, Fees, Bus, Aadhar, etc.

Rules:
1. Extra columns (like Parent Name, Remarks, etc.) must be mapped to "ignore".
2. Only map a column if the data clearly represents that canonical field.
3. Provide a confidence score between 0.00 and 1.00 for each column.
4. Output strict JSON according to the schema provided.`;

    const userPrompt = `Analyze these Excel column headers and sample data rows:
Headers: ${JSON.stringify(headers)}
Sample Rows (up to 10 rows):
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}

Provide the mapping for EVERY header.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mapping: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  excelColumn: { type: Type.STRING },
                  targetField: {
                    type: Type.STRING,
                    enum: CANONICAL_TARGET_FIELDS,
                  },
                  confidence: { type: Type.NUMBER },
                  reasoning: { type: Type.STRING },
                },
                required: ["excelColumn", "targetField", "confidence"],
              },
            },
            ignoredColumns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["mapping"],
        },
      },
    });

    const parsed = JSON.parse(response.text);
    return res.status(200).json({ ...parsed, provider: "gemini" });
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to analyze columns with Gemini" });
  }
}

