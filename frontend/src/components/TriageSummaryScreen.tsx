import React, { useState, useEffect, useRef } from "react";
import { Language, text } from "../translations";
import type { RegistrationData, TriageResult } from "../types";
import { submitRegistration } from "../services/api";
import { mapApiError } from "../lib/apiError";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

interface Props {
  language: Language;
  clinicId: string;
  requestId: string;
  registration: RegistrationData;
  screeningFlags: boolean[];
  consent: boolean;
  onReset: () => void;
}

export function TriageSummaryScreen({
  language, clinicId, requestId, registration, screeningFlags, consent, onReset,
}: Props) {
  const t = text[language];
  const [isSubmitting, setIsSubmitting] = useState(true);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // useRef (not state) so the guard survives re-renders and StrictMode's
  // double-invoke of effects — exactly one automatic submit happens.
  const startedRef = useRef(false);

  async function submit() {
    setIsSubmitting(true);
    setSubmitError(null);

    // Same requestId on every attempt (mount + Retry) → server-side idempotent.
    const res = await submitRegistration({
      requestId,
      language,
      clinicId,
      patient: { ...registration },
      screening: { flags: screeningFlags },
      consent,
    });

    if (res.ok === false) {
      setSubmitError(mapApiError(res, language));
      setIsSubmitting(false);
      return;
    }
    setResult({ level: res.data.triage, message: res.data.message, arogyaId: res.data.arogyaId });
    setIsSubmitting(false);
  }

  useEffect(() => {
    if (startedRef.current) return; // StrictMode's second invoke bails out
    startedRef.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHighRisk = result?.level === "high-risk";

  if (isSubmitting) {
    return (
      <div className="h-full bg-[#F6F9F7] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-[#E1F0E9] flex items-center justify-center mb-6">
          <svg className="animate-spin h-10 w-10 text-[#0A5C43]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-[#0A5C43] mb-3">{t.screening.submitting}</h2>
        <p className="text-[15px] text-[#4F675C] text-center">{t.screening.submittingHint}</p>
      </div>
    );
  }

  if (submitError) {
    return (
      <div className="h-full bg-[#F6F9F7] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-[#FFF2F2] flex items-center justify-center mb-6">
          <AlertCircle size={36} className="text-[#D32F2F]" strokeWidth={2.5} />
        </div>
        <h2 className="text-[22px] font-bold text-[#B71C1C] mb-3">{t.screening.unableTitle}</h2>
        <p className="text-[15px] text-[#4F675C] text-center mb-2">{submitError}</p>
        <p className="text-[14px] text-[#4F675C] text-center mb-8">{t.screening.askStaff}</p>
        <button onClick={submit}
          className="w-full max-w-[300px] py-[16px] bg-[#0A5C43] text-white hover:bg-[#0C6E50] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2 mb-3 focus:outline-none focus:ring-4 focus:ring-[#D6F2E5]">
          <RotateCcw size={18} strokeWidth={2.5} />
          {t.tryAgain}
        </button>
        <button onClick={onReset}
          className="w-full max-w-[300px] py-[16px] bg-white border-[1.5px] border-[#0A5C43] text-[#0A5C43] hover:bg-[#EAF5F0] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2">
          {t.startOver}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-y-auto hidden-scrollbar">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight mx-auto">{t.screening.complete}</h1>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center -mt-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="w-full bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
          <div className={`p-10 flex flex-col items-center text-center ${isHighRisk ? "bg-[#FFF2F2]" : "bg-[#E1F0E9]"}`}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
              className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm border-[2px] ${
                isHighRisk ? "bg-[#FFE5E5] text-[#D32F2F] border-[#FFCDCD]" : "bg-[#D6F2E5] text-[#0A5C43] border-[#BCE4D3]"
              }`}>
              {isHighRisk ? <AlertCircle size={36} strokeWidth={2.5} /> : <CheckCircle2 size={36} strokeWidth={2.5} />}
            </motion.div>
            <h2 className={`text-[22px] font-bold mb-3 tracking-tight ${isHighRisk ? "text-[#B71C1C]" : "text-[#0A5C43]"}`}>
              {isHighRisk ? t.screening.attention : t.screening.allSet}
            </h2>
            <p className={`text-[15px] font-medium leading-relaxed ${isHighRisk ? "text-[#C62828]" : "text-[#1B4332]"}`}>
              {result?.message || (isHighRisk ? t.triageDengue : t.triageNormal)}
            </p>
          </div>
          {result?.arogyaId && (
            <div className="p-5 flex flex-col items-center border-t border-gray-100">
              <span className="text-[12px] font-bold text-[#758D81] uppercase tracking-[0.12em] mb-1">{t.reg.arogyaId}</span>
              <span className="text-[22px] font-bold text-[#0A5C43] tracking-wide">{result.arogyaId}</span>
            </div>
          )}
        </motion.div>

        <div className="w-full mt-10">
          <button onClick={onReset}
            className="w-full py-[16px] bg-white border-[1.5px] border-[#0A5C43] text-[#0A5C43] hover:bg-[#EAF5F0] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#D6F2E5]">
            <RotateCcw size={18} strokeWidth={2.5} />
            {t.startOver}
          </button>
        </div>
      </div>
    </div>
  );
}
