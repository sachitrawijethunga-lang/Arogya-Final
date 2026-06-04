import { useEffect, useState } from "react";
import { staffApi } from "./staffApi";
import type { StaffUser } from "./types";
import { LoginScreen } from "./LoginScreen";
import { QueueScreen } from "./QueueScreen";

export default function StaffApp() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    staffApi.me().then((res) => {
      if (res.ok) setUser(res.data);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-[#F6F9F7] flex items-center justify-center text-[#4F675C]">Loading…</div>;
  }
  if (!user) return <LoginScreen onLoggedIn={setUser} />;

  async function logout() {
    await staffApi.logout();
    setUser(null);
  }

  return <QueueScreen user={user} onLogout={logout} />;
}
