import React from "react";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "tel" | "numeric";
}

export function TextField({
  label, value, onChange, required, error, type = "text", placeholder, inputMode,
}: Props) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full p-4 border-[1.5px] rounded-[12px] bg-white focus:outline-none focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] placeholder-gray-400 text-[16px] transition-all ${
          error ? "border-red-400" : "border-gray-200 focus:border-[#0A5C43]"
        }`}
      />
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
