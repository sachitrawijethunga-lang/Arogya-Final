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
    requestId: null,
    registration: null,
    screeningFlags: [],
    screeningNone: false,
    consent: false,
  };
}

function clinicIdFromUrl(): string | null {
  const clinic = new URLSearchParams(window.location.search).get("clinic")?.trim();
  return clinic || null;
}

export default function App() {
  const [state, setState] = useState<AppState>(() => initialState(clinicIdFromUrl()));

  // Resolve the clinic name as soon as the QR-provided clinic id is known so
  // the language screen can show the specific Arogya center.
  useEffect(() => {
    let cancelled = false;
    if (state.clinicId && state.clinicName === null) {
      validateClinic(state.clinicId).then((res) => {
        if (cancelled || !res.ok) return;
        if (res.data.valid && res.data.clinicName) {
          setState((s) => ({ ...s, clinicName: res.data.clinicName! }));
        } else if (!res.data.valid) {
          // The clinic from the URL doesn't exist; fall back to the scanner
          // so the user can scan or enter a valid clinic instead of being
          // stuck on registration with no clinic name.
          setState((s) => ({
            ...s,
            clinicId: null,
            screen: s.screen === "language" ? "language" : "scanner",
          }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [state.clinicId, state.clinicName]);

  // Kiosk privacy: after inactivity, wipe PII and return to the language screen so
  // the next patient never sees the previous patient's data. Disabled on the
  // language screen (no PII entered yet).
  useEffect(() => {
    if (state.screen === "language") return;
    const IDLE_MS = 90_000;
    let timer = window.setTimeout(() => handleReset(), IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handleReset(), IDLE_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen]);

  const handleLanguageSelect = (language: Language) => {
    setState((s) => ({ ...s, language, screen: s.clinicId ? "registration" : "scanner" }));
  };

  const handleScanSuccess = (clinicId: string, clinicName?: string) => {
    setState((s) => ({ ...s, clinicId, clinicName: clinicName ?? null, screen: "registration" }));
  };

  const handleRegistrationComplete = (registration: RegistrationData) => {
    setState((s) => ({ ...s, registration, screen: "questionnaire" }));
  };

  const handleQuestionnaireComplete = (flags: boolean[], none: boolean, consent: boolean) => {
    setState((s) => ({
      ...s,
      screeningFlags: flags,
      screeningNone: none,
      consent,
      requestId: crypto.randomUUID(),
      screen: "triage",
    }));
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
              <LanguageSelectScreen
                clinicId={state.clinicId}
                clinicName={state.clinicName}
                onSelectLanguage={handleLanguageSelect}
              />
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
                initialFlags={state.screeningFlags.length ? state.screeningFlags : undefined}
                initialNone={state.screeningNone}
                initialConsent={state.consent}
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
                requestId={state.requestId ?? ""}
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
