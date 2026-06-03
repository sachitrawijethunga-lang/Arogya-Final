import React from "react";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  required?: boolean;
  error?: string;
}

export function SegmentedControl<T extends string>({
  label, options, value, onChange, required, error,
}: Props<T>) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="flex gap-3">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex-1 py-3.5 rounded-[12px] border-[1.5px] font-semibold text-[15px] transition-all ${
                active
                  ? "bg-[#E1F0E9] border-[#0A5C43] text-[#0A5C43]"
                  : "bg-white border-gray-200 text-[#4F675C]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
