import { useEffect, useState, useCallback } from "react";
import { staffApi } from "./staffApi";
import type { RegistrationDetail } from "./types";
import type { RegistrationData } from "../types";
import { EditScreen } from "./EditScreen";

const FIELD_LABELS: Array<[keyof RegistrationData, string]> = [
  ["fullName", "Full name"], ["nic", "NIC"], ["phn", "PHN"], ["gender", "Gender"],
  ["dateOfBirth", "Date of birth"], ["mobile", "Mobile"], ["householdAddress", "Address"],
  ["maritalStatus", "Marital status"], ["occupation", "Occupation"], ["education", "Education"],
];

export function DetailScreen({ id, onBack, onLogout }: { id: number; onBack: () => void; onLogout: () => void }) {
  const [record, setRecord] = useState<RegistrationDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await staffApi.get(id);
    if (res.ok) setRecord(res.data);
    else if (res.status === 401) onLogout();
    else setError(res.error);
  }, [id, onLogout]);

  useEffect(() => { load(); }, [load]);

  if (editing && record) {
    return <EditScreen record={record} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />;
  }
  if (error) return <div className="p-6 text-[#D32F2F]">{error} <button onClick={onBack} className="underline">Back</button></div>;
  if (!record) return <div className="p-6 text-[#4F675C]">Loading…</div>;

  const pending = record.status === "pending";

  async function approve() {
    setBusy(true); setError(null);
    const res = await staffApi.approve(id);
    setBusy(false);
    if (res.ok) load(); else setError(res.error);
  }
  async function reject() {
    const reason = window.prompt("Reason for rejection?");
    if (!reason || !reason.trim()) return;
    setBusy(true); setError(null);
    const res = await staffApi.reject(id, reason.trim());
    setBusy(false);
    if (res.ok) load(); else setError(res.error);
  }

  return (
    <div className="min-h-screen bg-[#F6F9F7]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="text-[14px] text-[#0A5C43] underline">← Back to queue</button>
        <span className="text-[12px] uppercase tracking-wide text-[#4F675C]">{record.status}</span>
      </header>
      <div className="max-w-[760px] mx-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-bold text-[#0A5C43]">{record.patient.fullName || "(no name)"}</h1>
          {record.triage === "high-risk" && <span className="text-[13px] font-bold text-[#D32F2F]">HIGH RISK</span>}
        </div>
        <p className="text-[13px] text-[#758D81] mb-5">{record.arogyaId}</p>

        <div className="bg-white rounded-[12px] border border-gray-200 p-5 mb-5">
          <h2 className="text-[14px] font-bold text-[#4F675C] mb-3">Patient details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
            {FIELD_LABELS.map(([k, label]) => (
              <div key={k}>
                <dt className="text-[12px] text-[#758D81]">{label}</dt>
                <dd className="text-[#1B4332]">{String(record.patient[k] ?? "—") || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-[12px] border border-gray-200 p-5 mb-5">
          <h2 className="text-[14px] font-bold text-[#4F675C] mb-3">Screening</h2>
          <p className="text-[14px] text-[#1B4332]">Flagged symptoms: {record.screeningFlags.filter(Boolean).length} / {record.screeningFlags.length}</p>
          <p className="text-[14px] text-[#1B4332]">Triage: {record.triage}</p>
        </div>

        {record.audit.length > 0 && (
          <div className="bg-white rounded-[12px] border border-gray-200 p-5 mb-5">
            <h2 className="text-[14px] font-bold text-[#4F675C] mb-3">History</h2>
            <ul className="text-[13px] text-[#4F675C] space-y-1">
              {record.audit.map((a, i) => (
                <li key={i}>{new Date(a.at).toLocaleString()} — <b>{a.action}</b> by {a.byName}{a.reason ? ` (${a.reason})` : ""}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-[13px] text-[#D32F2F] mb-3">{error}</p>}

        {pending && (
          <div className="flex gap-3">
            <button onClick={approve} disabled={busy}
              className="flex-1 py-3 bg-[#0A5C43] hover:bg-[#074734] disabled:opacity-50 text-white rounded-[10px] font-bold">Approve</button>
            <button onClick={() => setEditing(true)} disabled={busy}
              className="flex-1 py-3 bg-white border border-[#0A5C43] text-[#0A5C43] rounded-[10px] font-bold">Edit</button>
            <button onClick={reject} disabled={busy}
              className="flex-1 py-3 bg-white border border-[#D32F2F] text-[#D32F2F] rounded-[10px] font-bold">Reject</button>
          </div>
        )}
        {record.status === "rejected" && record.rejectReason && (
          <p className="text-[14px] text-[#D32F2F]">Rejected: {record.rejectReason}</p>
        )}
      </div>
    </div>
  );
}
