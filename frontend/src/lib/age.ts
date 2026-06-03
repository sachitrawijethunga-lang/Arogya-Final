export interface Age {
  years: number;
  months: number;
}

export function ageFromDob(dobISO: string, today: Date = new Date()): Age | null {
  if (!dobISO) return null;
  const dob = new Date(dobISO + "T00:00:00");
  if (isNaN(dob.getTime()) || dob.getTime() > today.getTime()) return null;

  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  if (today.getDate() < dob.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}
