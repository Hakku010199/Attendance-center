// Shared Resend client for server-side API routes ONLY.
// This file must NEVER be imported by React/Vite browser code.
import { Resend } from "resend";
import { getResendFrom } from "./emailConfig.js";

let cached = null;

export const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) {
    const err = new Error("RESEND_API_KEY is not configured on the server.");
    err.code = "RESEND_NOT_CONFIGURED";
    throw err;
  }
  if (!cached) cached = new Resend(apiKey);
  return { resend: cached, from: getResendFrom() };
};
