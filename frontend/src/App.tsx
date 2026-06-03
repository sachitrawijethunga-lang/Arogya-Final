/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { AppState, RegistrationData } from "./types";
import { Language } from "./translations";
import { validateClinic } from "./services/api";
import { LanguageSelectScreen } from "./components/LanguageSelectScreen";
import { ScannerScreen } from "./components/ScannerScreen";
import { RegistrationScreen } from "./components/RegistrationScreen";
import { QuestionnaireScreen } from "./components/QuestionnaireScreen";
import { TriageSummaryScreen } from "./components/TriageSummaryScreen";
import { AnimatePresence, motion } from "motion/react";

function initialState(clinicId: string | null = null): AppState {
  return {
    screen: "language",
    language: "en",
    clinicId,
    clinicName: null,
    registration: null,
    screeningFlags: [],
    consent: false,
  };
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState());

  // Read ?clinic from the URL (QR opens the app with the clinic embedded).
  useEffect(() => {
    const clinic = new URLSearchParams(window.location.search).get("clinic")?.trim();
    if (clinic) setState((s) => ({ ...s, clinicId: clinic }));
  }, []);

  // Resolve the clinic name when entering registration with a clinic but no name yet.
  useEffect(() => {
    let cancelled = false;
    if (state.screen === "registration" && state.clinicId && state.clinicName === null) {
      validateClinic(state.clinicId).then((res) => {
        if (cancelled || !res.ok) return;
        if (res.data.valid && res.data.clinicName) {
          setState((s) => ({ ...s, clinicName: res.data.clinicName! }));
        } else if (!res.data.valid) {
          // The clinic from the URL doesn't exist; fall back to the scanner
          // so the user can scan or enter a valid clinic instead of being
          // stuck on registration with no clinic name.
          setState((s) => ({ ...s, clinicId: null, screen: "scanner" }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [state.screen, state.clinicId, state.clinicName]);

  const handleLanguageSelect = (language: Language) => {
    setState((s) => ({ ...s, language, screen: s.clinicId ? "registration" : "scanner" }));
  };

  const handleScanSuccess = (clinicId: string, clinicName?: string) => {
    setState((s) => ({ ...s, clinicId, clinicName: clinicName ?? null, screen: "registration" }));
  };

  const handleRegistrationComplete = (registration: RegistrationData) => {
    setState((s) => ({ ...s, registration, screen: "questionnaire" }));
  };

  const handleQuestionnaireComplete = (flags: boolean[], consent: boolean) => {
    setState((s) => ({ ...s, screeningFlags: flags, consent, screen: "triage" }));
  };

  const handleReset = () => {
    setState((s) => ({ ...initialState(s.clinicId), clinicName: s.clinicName }));
  };

  return (
    <div className="min-h-screen bg-[#F6F9F7] font-sans flex justify-center selection:bg-[#D6F2E5]">
      <div className="w-full max-w-[420px] h-[100dvh] relative shadow-[0_0_20px_rgba(0,60,30,0.03)] border-x border-gray-100 bg-[#F6F9F7] overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {state.screen === "language" && (
            <motion.div key="language" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }} className="absolute inset-0">
              <LanguageSelectScreen onSelectLanguage={handleLanguageSelect} />
            </motion.div>
          )}

          {state.screen === "scanner" && (
            <motion.div key="scanner" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <ScannerScreen language={state.language} onScanSuccess={handleScanSuccess} />
            </motion.div>
          )}

          {state.screen === "registration" && (
            <motion.div key="registration" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <RegistrationScreen
                language={state.language}
                clinicId={state.clinicId ?? ""}
                clinicName={state.clinicName}
                initial={state.registration}
                onBack={() => setState((s) => ({ ...s, screen: "language" }))}
                onComplete={handleRegistrationComplete}
              />
            </motion.div>
          )}

          {state.screen === "questionnaire" && (
            <motion.div key="questionnaire" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <QuestionnaireScreen
                language={state.language}
                onBack={() => setState((s) => ({ ...s, screen: "registration" }))}
                onComplete={handleQuestionnaireComplete}
              />
            </motion.div>
          )}

          {state.screen === "triage" && state.registration && (
            <motion.div key="triage" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <TriageSummaryScreen
                language={state.language}
                clinicId={state.clinicId ?? ""}
                registration={state.registration}
                screeningFlags={state.screeningFlags}
                consent={state.consent}
                onReset={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
