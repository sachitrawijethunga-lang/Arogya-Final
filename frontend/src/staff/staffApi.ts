import { getConfig } from "../config";
import type {
  StaffUser,
  RegistrationSummary,
  RegistrationDetail,
  RecordStatus,
  StaffResult,
} from "./types";
import type { RegistrationData } from "../types";

async function req<T>(path: string, options: RequestInit = {}): Promise<StaffResult<T>> {
  const { apiBaseUrl } = getConfig();
  try {
    const res = await fetch(`${apiBaseUrl}/staff${path}`, {
      ...options,
      credentials: "include", // send/receive the session cookie
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
    }
    const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

export const staffApi = {
  login: (username: string, password: string) =>
    req<StaffUser>("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: true }>("/logout", { method: "POST" }),
  me: () => req<StaffUser>("/me"),
  list: (status?: RecordStatus | "all", q?: string) => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return req<RegistrationSummary[]>(`/registrations${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => req<RegistrationDetail>(`/registrations/${id}`),
  edit: (id: number, patient: RegistrationData) =>
    req<{ id: number; patient: RegistrationData }>(`/registrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ patient }),
    }),
  approve: (id: number) =>
    req<{ id: number; status: RecordStatus }>(`/registrations/${id}/approve`, { method: "POST", body: "{}" }),
  reject: (id: number, reason: string) =>
    req<{ id: number; status: RecordStatus }>(`/registrations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
