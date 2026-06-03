import React, { useState } from "react";
import { Language, text } from "../translations";
import { ArrowLeft, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { motion } from "motion/react";
import {
  emptyScreeningState,
  toggleSymptom,
  toggleNone,
  isScreeningComplete,
} from "../lib/screening";

interface Props {
  language: Language;
  onBack: () => void;
  onComplete: (flags: boolean[], consent: boolean) => void;
}

export function QuestionnaireScreen({ language, onBack, onComplete }: Props) {
  const t = text[language];
  const [state, setState] = useState(emptyScreeningState());
  const [consent, setConsent] = useState(false);

  const complete = isScreeningComplete(state, consent);

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-y-auto hidden-scrollbar">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <button onClick={onBack} className="text-[#122A21] mr-3 p-2 -ml-2 rounded-full focus:bg-gray-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight">{t.screening.stepLabel}</h1>
      </div>

      <div className="p-5 pb-10">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-white border-[1.5px] border-[#D6EFE3] rounded-[16px] p-5 flex gap-3.5 mb-6 shadow-sm">
          <AlertCircle className="text-[#0A5C43] shrink-0 mt-0.5" size={22} strokeWidth={2.5} />
          <p className="text-[13px] text-[#4F675C] leading-relaxed font-medium">{t.screening.intro}</p>
        </motion.div>

        <div className="space-y-3 mb-6">
          {t.screening.items.map((item, index) => {
            const checked = state.flags[index];
            return (
              <button key={index} type="button" onClick={() => setState((s) => toggleSymptom(s, index))}
                className={`w-full text-left flex items-start gap-3.5 p-4 rounded-[16px] border-[1.5px] transition-colors ${
                  checked ? "bg-[#E1F0E9] border-[#0A5C43]" : "bg-white border-gray-200"
                }`}>
                <div className={`w-[22px] h-[22px] rounded-[6px] mt-0.5 border-[2px] flex items-center justify-center shrink-0 transition-colors ${
                  checked ? "border-[#0A5C43] bg-[#0A5C43]" : "border-gray-400 bg-white"
                }`}>
                  {checked && <Check size={14} className="text-white" strokeWidth={3.5} />}
                </div>
                <span className="text-[14px] font-medium text-[#122A21] leading-relaxed">{item}</span>
              </button>
            );
          })}

          {/* None of the above */}
          <button type="button" onClick={() => setState((s) => toggleNone(s))}
            className={`w-full text-left flex items-start gap-3.5 p-4 rounded-[16px] border-[1.5px] transition-colors ${
              state.none ? "bg-[#E1F0E9] border-[#0A5C43]" : "bg-white border-gray-200"
            }`}>
            <div className={`w-[22px] h-[22px] rounded-[6px] mt-0.5 border-[2px] flex items-center justify-center shrink-0 transition-colors ${
              state.none ? "border-[#0A5C43] bg-[#0A5C43]" : "border-gray-400 bg-white"
            }`}>
              {state.none && <Check size={14} className="text-white" strokeWidth={3.5} />}
            </div>
            <span className="text-[14px] font-semibold text-[#122A21] leading-relaxed">{t.screening.none}</span>
          </button>
        </div>

        {/* Consent */}
        <div className="bg-[#EAF5F0] border-[1.5px] border-[#CDEAE0] p-5 rounded-[16px] mb-8">
          <label className="flex items-start gap-4 cursor-pointer group">
            <input type="checkbox" className="sr-only" checked={consent}
              onChange={(e) => setConsent(e.target.checked)} />
            <div className={`w-[22px] h-[22px] rounded-[6px] mt-0.5 border-[2px] flex items-center justify-center transition-colors shrink-0 ${
              consent ? "border-[#0A5C43] bg-[#0A5C43]" : "border-gray-400 bg-white group-hover:border-[#0A5C43]"
            }`}>
              {consent && <Check size={14} className="text-white" strokeWidth={3.5} />}
            </div>
            <span className="text-[13px] text-[#2C4138] leading-relaxed font-medium">{t.screening.consent}</span>
          </label>
        </div>

        <button onClick={() => complete && onComplete(state.flags, consent)} disabled={!complete}
          className="w-full py-[18px] bg-[#0A5C43] hover:bg-[#074734] text-white rounded-[12px] font-semibold text-[16px] transition-all shadow-[0_4px_12px_rgba(10,92,67,0.15)] disabled:bg-[#A8DEC3] disabled:text-[#F6F9F7] disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#2C8567]">
          {t.screening.submit} <CheckCircle2 size={20} />
        </button>
      </div>
    </div>
  );
}
