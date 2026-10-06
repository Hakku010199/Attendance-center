// Supabase Edge Function: map-columns
// Analyzes Excel column headers and sample rows to map them to canonical student fields.
// The GEMINI_API_KEY is read securely from Deno.env and never exposed to the client.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { headers = [], sampleRows = [] } = await req.json();

    if (!Array.isArray(headers) || headers.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid headers array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    // If Gemini API key is not configured, fallback to rule-based analysis
    if (!apiKey) {
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

      return new Response(
        JSON.stringify({
          mapping: fallbackMapping,
          ignoredColumns: fallbackMapping.filter((m) => m.targetField === "ignore").map((m) => m.excelColumn),
          provider: "heuristic",
          note: "GEMINI_API_KEY not configured in Supabase secrets; using heuristic detection",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Gemini 3.8 Flash via official Google Generative Language API
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            mapping: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  excelColumn: { type: "STRING" },
                  targetField: {
                    type: "STRING",
                    enum: CANONICAL_TARGET_FIELDS,
                  },
                  confidence: { type: "NUMBER" },
                  reasoning: { type: "STRING" },
                },
                required: ["excelColumn", "targetField", "confidence"],
              },
            },
            ignoredColumns: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
          },
          required: ["mapping"],
        },
      },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText);

    return new Response(
      JSON.stringify({ ...parsed, provider: "gemini" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Failed to analyze columns" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

