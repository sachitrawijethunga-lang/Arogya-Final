import { getConfig } from "../config";
import type {
  ApiResult,
  ClinicValidationResponse,
  RegistrationRequest,
  RegistrationResponse,
} from "../types";

const TIMEOUT_MS = 10000;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const { apiBaseUrl } = getConfig();
  const url = `${apiBaseUrl}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: body || `HTTP ${response.status}`, status: response.status, kind: "http" };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "timeout", kind: "timeout" };
    }
    return { ok: false, error: String(err), kind: "network" };
  }
}

export function validateClinic(
  clinicId: string
): Promise<ApiResult<ClinicValidationResponse>> {
  return request<ClinicValidationResponse>("/clinics/validate", {
    method: "POST",
    body: JSON.stringify({ clinicId }),
  });
}

export function submitRegistration(
  body: RegistrationRequest
): Promise<ApiResult<RegistrationResponse>> {
  return request<RegistrationResponse>("/registration", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
