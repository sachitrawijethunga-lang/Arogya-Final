import { useState, type FormEvent } from "react";
import { staffApi } from "./staffApi";
import type { StaffUser } from "./types";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (u: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await staffApi.login(username.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 429 ? "Too many attempts. Try again later." : "Invalid username or password.");
      return;
    }
    onLoggedIn(res.data);
  }

  return (
    <div className="min-h-screen bg-[#F6F9F7] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-[360px] bg-white rounded-[20px] shadow-sm border border-gray-100 p-8">
        <h1 className="text-[22px] font-bold text-[#0A5C43] mb-1">Arogya — PHNO Portal</h1>
        <p className="text-[14px] text-[#4F675C] mb-6">Sign in to review patient registrations.</p>
        <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
          className="w-full mb-4 px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />
        <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />
        {error && <p className="text-[13px] text-[#D32F2F] mb-3">{error}</p>}
        <button type="submit" disabled={busy || !username || !password}
          className="w-full py-3 bg-[#0A5C43] hover:bg-[#074734] disabled:opacity-50 text-white rounded-[10px] font-bold text-[15px]">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
