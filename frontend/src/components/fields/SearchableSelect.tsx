import React, { useEffect, useState } from "react";

interface Props {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
}

export function SearchableSelect({ label, options, value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);

  // Keep the visible text in sync if the selected value is reset/changed by the parent.
  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  const filtered = options
    .filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const pick = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">{label}</label>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full p-4 border-[1.5px] border-gray-200 rounded-[12px] bg-white focus:outline-none focus:border-[#0A5C43] focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] placeholder-gray-400 text-[16px] transition-all"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border-[1.5px] border-gray-200 rounded-[12px] shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((option) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className="w-full text-left px-4 py-3 text-[15px] text-[#122A21] hover:bg-[#EAF5F0]"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
