import { useEffect, useState, useCallback } from "react";
import { staffApi } from "./staffApi";
import { filterSummaries } from "./queueFilter";
import type { StaffUser, RegistrationSummary, RecordStatus } from "./types";
import { DetailScreen } from "./DetailScreen";

const TABS: Array<{ key: RecordStatus | "all"; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export function QueueScreen({ user, onLogout }: { user: StaffUser; onLogout: () => void }) {
  const [tab, setTab] = useState<RecordStatus | "all">("pending");
  const [rows, setRows] = useState<RegistrationSummary[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await staffApi.list(tab);
    setLoading(false);
    if (res.ok) setRows(res.data);
    else if (res.status === 401) onLogout();
  }, [tab, onLogout]);

  useEffect(() => { load(); }, [load]);

  if (selectedId !== null) {
    return (
      <DetailScreen
        id={selectedId}
        onBack={() => { setSelectedId(null); load(); }}
        onLogout={onLogout}
      />
    );
  }

  const visible = filterSummaries(rows, query);

  return (
    <div className="min-h-screen bg-[#F6F9F7]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-[#0A5C43]">Arogya — {user.clinicName ?? user.clinicId}</h1>
          <p className="text-[13px] text-[#4F675C]">{user.fullName}</p>
        </div>
        <button onClick={onLogout} className="text-[14px] text-[#0A5C43] underline">Log out</button>
      </header>

      <div className="max-w-[1000px] mx-auto p-6">
        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-[10px] text-[14px] font-semibold ${tab === t.key ? "bg-[#0A5C43] text-white" : "bg-white border border-gray-200 text-[#4F675C]"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, NIC, or Arogya ID"
          className="w-full mb-4 px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />

        {loading ? (
          <p className="text-[#4F675C]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-[#4F675C]">No records.</p>
        ) : (
          <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
            {visible.map((r) => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-[#F0F7F4] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#1B4332]">{r.fullName || "(no name)"}</div>
                  <div className="text-[13px] text-[#758D81]">{r.arogyaId} · {r.nic || "no NIC"}</div>
                </div>
                <div className="flex items-center gap-3">
                  {r.triage === "high-risk" && <span className="text-[12px] font-bold text-[#D32F2F]">HIGH RISK</span>}
                  <span className="text-[12px] uppercase tracking-wide text-[#4F675C]">{r.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
