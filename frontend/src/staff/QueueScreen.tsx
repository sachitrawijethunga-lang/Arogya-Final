import type { StaffUser } from "./types";
export function QueueScreen({ user, onLogout }: { user: StaffUser; onLogout: () => void }) {
  return (
    <div className="p-6">
      <p>Signed in as {user.fullName} ({user.clinicName}).</p>
      <button onClick={onLogout} className="underline text-[#0A5C43]">Log out</button>
    </div>
  );
}
