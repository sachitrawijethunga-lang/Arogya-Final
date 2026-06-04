import { useState } from "react";
import { staffApi } from "./staffApi";
import type { RegistrationDetail } from "./types";
import type { RegistrationData } from "../types";

const EDITABLE: Array<[keyof RegistrationData, string]> = [
  ["fullName", "Full name"], ["nic", "NIC"], ["phn", "PHN"],
  ["dateOfBirth", "Date of birth (yyyy-mm-dd)"], ["mobile", "Mobile"], ["householdAddress", "Address"],
];

export function EditScreen({ record, onCancel, onSaved }: {
  record: RegistrationDetail; onCancel: () => void; onSaved: () => void;
}) {
  const [patient, setPatient] = useState<RegistrationData>({ ...record.patient });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof RegistrationData, v: string) {
    setPatient((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setBusy(true); setError(null);
    const res = await staffApi.edit(record.id, patient);
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error);
  }

  return (
    <div className="min-h-screen bg-[#F6F9F7]">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <button onClick={onCancel} className="text-[14px] text-[#0A5C43] underline">← Cancel</button>
      </header>
      <div className="max-w-[640px] mx-auto p-6">
        <h1 className="text-[20px] font-bold text-[#0A5C43] mb-5">Edit patient</h1>
        <div className="bg-white rounded-[12px] border border-gray-200 p-5">
          <div className="mb-4">
            <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">Gender</label>
            <select value={patient.gender ?? ""} onChange={(e) => set("gender", e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-gray-300">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          {EDITABLE.map(([k, label]) => (
            <div key={k} className="mb-4">
              <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">{label}</label>
              <input value={String(patient[k] ?? "")} onChange={(e) => set(k, e.target.value)}
                className="w-full px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />
            </div>
          ))}
          {error && <p className="text-[13px] text-[#D32F2F] mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={busy}
              className="flex-1 py-3 bg-[#0A5C43] hover:bg-[#074734] disabled:opacity-50 text-white rounded-[10px] font-bold">
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button onClick={onCancel} disabled={busy}
              className="flex-1 py-3 bg-white border border-gray-300 text-[#4F675C] rounded-[10px] font-bold">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
