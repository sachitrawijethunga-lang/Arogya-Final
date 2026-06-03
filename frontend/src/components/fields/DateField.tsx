import React from "react";
import { ageFromDob } from "../../lib/age";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  ageLabel: string;
  yearsLabel: string;
  monthsLabel: string;
}

export function DateField({
  label, value, onChange, required, error, ageLabel, yearsLabel, monthsLabel,
}: Props) {
  const age = ageFromDob(value);
  const max = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 border-[1.5px] rounded-[12px] bg-white focus:outline-none focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] text-[16px] transition-all ${
          error ? "border-red-400" : "border-gray-200 focus:border-[#0A5C43]"
        }`}
      />
      {age && (
        <p className="mt-1.5 text-[13px] text-[#4F675C] font-medium">
          {ageLabel}: {age.years} {yearsLabel} {age.months} {monthsLabel}
        </p>
      )}
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
