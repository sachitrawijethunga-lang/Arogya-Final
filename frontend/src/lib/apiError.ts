import { text } from "../translations";
import type { Language } from "../translations";
import type { ApiError } from "../types";

// Maps a structured API failure to a friendly, localized message.
// Patients must never see raw backend/stack text.
export function mapApiError(err: ApiError, language: Language): string {
  const e = text[language].errors;
  if (err.kind === "timeout") return e.timeout;
  if (err.kind === "network") return e.network;
  if (err.status && err.status >= 400 && err.status < 500) return e.rejected;
  return e.server;
}
