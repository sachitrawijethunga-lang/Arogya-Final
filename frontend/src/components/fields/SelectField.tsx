import React from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  error?: string;
}

export function SelectField({
  label, options, value, onChange, placeholder, required, error,
}: Props) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 border-[1.5px] rounded-[12px] bg-white focus:outline-none focus:ring-4 focus:ring-[#D6F2E5] text-[16px] transition-all ${
          value ? "text-[#122A21]" : "text-gray-400"
        } ${error ? "border-red-400" : "border-gray-200 focus:border-[#0A5C43]"}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-[#122A21]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
