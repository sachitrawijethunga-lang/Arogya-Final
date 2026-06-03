# Arogya Entry Frontend — Standalone Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Google AI Studio React app into a standalone static frontend served from `/var/www/arogya-entry/`, connected to an independent Node.js backend via `/api/*`.

**Architecture:** Subdomain-based deployment at `arogya.vmi3065909.contaboserver.net` with a separate nginx server block. All data flows through backend API calls using a typed fetch wrapper (`ApiResult<T>`). No dev server — build → deploy → test live.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, motion (framer-motion), lucide-react

---

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/package.json` | Modify | Clean deps, remove dev/preview scripts, add deploy script |
| `frontend/vite.config.ts` | Modify | Strip dev server/HMR, keep only build plugins |
| `frontend/index.html` | Modify | Add config.js script before app bundle |
| `frontend/metadata.json` | Delete | AI Studio manifest, not needed |
| `frontend/.env.example` | Replace | Clean env template |
| `frontend/src/types.ts` | Modify | Add API response types, `ApiResult<T>`, loading/error states |
| `frontend/src/config.ts` | Create | Runtime config reader for `window.__APP_CONFIG__` |
| `frontend/src/services/api.ts` | Create | Typed fetch wrapper with timeout and error handling |
| `frontend/src/App.tsx` | Modify | Integrate API calls, loading/error/triage state |
| `frontend/src/components/ScannerScreen.tsx` | Modify | Validate clinic ID via API |
| `frontend/src/components/QuestionnaireScreen.tsx` | Modify | Fetch questions from API with fallback |
| `frontend/src/components/TriageSummaryScreen.tsx` | Modify | Accept triage result from parent (no API call here) |
| `frontend/deploy.sh` | Create | Build + deploy script |
| `frontend/config.js` | Create | Runtime config template |

---

### Task 1: Clean up package.json

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Remove Gemini, Express, and server-related dependencies**

```bash
cd /home/developper/arogya-entry/frontend && npm uninstall @google/genai express dotenv tsx esbuild @types/express @types/node
```

- [ ] **Step 2: Run to verify uninstall succeeded**

Run: `npm ls @google/genai express 2>&1`
Expected: both show as "empty" or not found

- [ ] **Step 3: Replace the scripts section in package.json**

Replace the `scripts` block with:

```json
{
  "name": "arogya-entry-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "deploy": "./deploy.sh"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "@yudiel/react-qr-scanner": "^2.6.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "tailwind-merge": "^3.6.0",
    "vite": "^6.2.3"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2"
  }
}
```

- [ ] **Step 4: Reinstall with cleaned package.json**

```bash
cd /home/developper/arogya-entry/frontend && rm -rf node_modules package-lock.json && npm install
```

- [ ] **Step 5: Verify build still works**

```bash
cd /home/developper/arogya-entry/frontend && npm run build
```
Expected: `vite v6.x.x building for production...` completes without errors, `dist/` is created.

- [ ] **Step 6: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add package.json package-lock.json && git commit -m "chore: clean dependencies for standalone frontend"
```

---

### Task 2: Strip vite.config.ts to build-only

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Replace vite.config.ts with minimal build-only config**

Replace the entire content of `frontend/vite.config.ts` with:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 2: Verify build still succeeds**

```bash
cd /home/developper/arogya-entry/frontend && npm run build
```
Expected: Build completes without errors.

- [ ] **Step 3: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add vite.config.ts && git commit -m "refactor: strip vite config to build-only"
```

---

### Task 3: Update types.ts with API types

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Replace types.ts with updated type definitions**

Replace the entire content of `frontend/src/types.ts` with:

```ts
import { Language } from "./translations";

export type ScreenState = "language" | "scanner" | "questionnaire" | "triage";

export interface AppState {
  screen: ScreenState;
  language: Language;
  clinicId: string | null;
  answers: boolean[];
  triageResult: TriageResult | null;
  isLoading: boolean;
  error: string | null;
}

export interface TriageResult {
  level: "high-risk" | "normal";
  message: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ClinicValidationResponse {
  valid: boolean;
  clinicName?: string;
}

export interface QuestionsResponse {
  questions: string[];
}

export interface RegistrationRequest {
  language: string;
  clinicId: string;
  answers: boolean[];
}

export interface RegistrationResponse {
  triage: "high-risk" | "normal";
  message: string;
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/types.ts && git commit -m "feat: add API response types and triage state"
```

---

### Task 4: Create runtime config reader

**Files:**
- Create: `frontend/src/config.ts`

- [ ] **Step 1: Create src/config.ts**

```ts
interface AppConfig {
  apiBaseUrl: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

export function getConfig(): AppConfig {
  if (typeof window !== "undefined" && window.__APP_CONFIG__?.apiBaseUrl) {
    return window.__APP_CONFIG__;
  }
  return { apiBaseUrl: "/api" };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/developper/arogya-entry/frontend && npx tsc --noEmit src/config.ts
```

- [ ] **Step 3: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/config.ts && git commit -m "feat: add runtime config reader"
```

---

### Task 5: Create API service layer

**Files:**
- Create: `frontend/src/services/api.ts`

- [ ] **Step 1: Create src/services/api.ts**

```ts
import { getConfig } from "../config";
import type {
  ApiResult,
  ClinicValidationResponse,
  QuestionsResponse,
  RegistrationRequest,
  RegistrationResponse,
} from "../types";

const TIMEOUT_MS = 10000;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const { apiBaseUrl } = getConfig();
  const url = `${apiBaseUrl}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      const message = body ? body : `Request failed with status ${response.status}`;
      return { ok: false, error: message };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timed out. Please try again." };
    }
    return {
      ok: false,
      error: "Unable to connect to the server. Please check your connection.",
    };
  }
}

export function fetchQuestions(): Promise<ApiResult<QuestionsResponse>> {
  return request<QuestionsResponse>("/questions");
}

export function validateClinic(
  clinicId: string
): Promise<ApiResult<ClinicValidationResponse>> {
  return request<ClinicValidationResponse>("/clinics/validate", {
    method: "POST",
    body: JSON.stringify({ clinicId }),
  });
}

export function submitRegistration(
  body: RegistrationRequest
): Promise<ApiResult<RegistrationResponse>> {
  return request<RegistrationResponse>("/registration", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/developper/arogya-entry/frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/services/api.ts && git commit -m "feat: add typed API service layer"
```

---

### Task 6: Update index.html for runtime config

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add config.js script tag before app bundle**

Replace the entire content of `frontend/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arogya Clinic Registration</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="/config.js"></script>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify build works**

```bash
cd /home/developper/arogya-entry/frontend && npm run build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add index.html && git commit -m "feat: add runtime config script to index.html"
```

---

### Task 7: Update TriageSummaryScreen for API-driven triage

**Files:**
- Modify: `frontend/src/components/TriageSummaryScreen.tsx`

- [ ] **Step 1: Replace App.tsx with API-integrated version**

Replace the entire content of `frontend/src/App.tsx` with:

```tsx
import React, { useState } from "react";
import { AppState } from "./types";
import { Language } from "./translations";
import { LanguageSelectScreen } from "./components/LanguageSelectScreen";
import { ScannerScreen } from "./components/ScannerScreen";
import { QuestionnaireScreen } from "./components/QuestionnaireScreen";
import { TriageSummaryScreen } from "./components/TriageSummaryScreen";
import { AnimatePresence, motion } from "motion/react";

export default function App() {
  const [state, setState] = useState<AppState>({
    screen: "language",
    language: "en",
    clinicId: null,
    answers: [],
    triageResult: null,
    isLoading: false,
    error: null,
  });

  const handleLanguageSelect = (language: Language) => {
    setState({ ...state, language, screen: "scanner" });
  };

  const handleScanSuccess = (clinicId: string) => {
    setState({ ...state, clinicId, screen: "questionnaire" });
  };

  const handleQuestionnaireComplete = (answers: boolean[]) => {
    setState({ ...state, answers, screen: "triage" });
  };

  const handleTriageResult = (triageResult: AppState["triageResult"]) => {
    setState((prev) => ({ ...prev, triageResult, isLoading: false }));
  };

  const handleReset = () => {
    setState({
      screen: "language",
      language: "en",
      clinicId: null,
      answers: [],
      triageResult: null,
      isLoading: false,
      error: null,
    });
  };

  return (
    <div className="min-h-screen bg-[#F6F9F7] font-sans flex justify-center selection:bg-[#D6F2E5]">
      <div className="w-full max-w-[420px] h-[100dvh] relative shadow-[0_0_20px_rgba(0,60,30,0.03)] border-x border-gray-100 bg-[#F6F9F7] overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {state.screen === "language" && (
            <motion.div
              key="language"
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <LanguageSelectScreen onSelectLanguage={handleLanguageSelect} />
            </motion.div>
          )}

          {state.screen === "scanner" && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <ScannerScreen
                language={state.language}
                onScanSuccess={handleScanSuccess}
              />
            </motion.div>
          )}

          {state.screen === "questionnaire" && (
            <motion.div
              key="questionnaire"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <QuestionnaireScreen
                language={state.language}
                onComplete={handleQuestionnaireComplete}
              />
            </motion.div>
          )}

          {state.screen === "triage" && (
            <motion.div
              key="triage"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <TriageSummaryScreen
                language={state.language}
                answers={state.answers}
                clinicId={state.clinicId!}
                onTriageResult={handleTriageResult}
                onReset={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /home/developper/arogya-entry/frontend && npm run build
```
Expected: Build may fail on TriageSummaryScreen prop changes — that's expected, we fix it in Task 10.

- [ ] **Step 3: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/App.tsx && git commit -m "feat: integrate API state into App.tsx"
```

---

### Task 8: Update ScannerScreen with API clinic validation

**Files:**
- Modify: `frontend/src/components/ScannerScreen.tsx`

- [ ] **Step 1: Read the current file**

Read `frontend/src/components/ScannerScreen.tsx` to understand the current structure.

- [ ] **Step 2: Add API validation import and modify handleSubmit**

Add import at the top after existing imports:

```tsx
import { validateClinic } from "../services/api";
```

Add state for validation loading and error after existing useState lines:

```tsx
const [validationError, setValidationError] = useState("");
const [isValidating, setIsValidating] = useState(false);
```

- [ ] **Step 3: Replace the handleSubmit function**

Replace:

```tsx
const handleSubmit = () => {
    if (manualId.trim()) {
      onScanSuccess(manualId.trim());
    }
  };
```

With:

```tsx
const handleSubmit = async () => {
    const idToValidate = manualId.trim();
    if (!idToValidate) return;
    
    setValidationError("");
    setIsValidating(true);
    
    const result = await validateClinic(idToValidate);
    setIsValidating(false);
    
    if (result.ok) {
      if (result.data.valid) {
        onScanSuccess(idToValidate);
      } else {
        setValidationError("Invalid clinic ID. Please check and try again.");
      }
    } else {
      setValidationError(result.error);
    }
  };
```

- [ ] **Step 4: Update the submit button to show loading state**

Replace the submit button's content with:

```tsx
{isValidating ? (
  <span className="flex items-center justify-center gap-2">
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
    Verifying...
  </span>
) : (
  <span className="flex items-center justify-center gap-2">
    {t.submit}
    <ArrowRight size={18} strokeWidth={2.5} />
  </span>
)}
```

- [ ] **Step 5: Add error display below the manual input (inside manualMode block)**

After the manual ID input, add:

```tsx
{validationError && (
  <p className="mt-3 text-[14px] text-red-600 bg-red-50 border border-red-200 rounded-[10px] p-3 font-medium">
    {validationError}
  </p>
)}
```

- [ ] **Step 6: Also disable button during validation**

Change the disabled condition on the submit button to:

```tsx
disabled={(manualMode && !manualId.trim()) || isValidating}
```

- [ ] **Step 7: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/components/ScannerScreen.tsx && git commit -m "feat: add API clinic validation to scanner"
```

---

### Task 9: Update QuestionnaireScreen with API question fetch

**Files:**
- Modify: `frontend/src/components/QuestionnaireScreen.tsx`

- [ ] **Step 1: Read the current file**

Read `frontend/src/components/QuestionnaireScreen.tsx` for current state.

- [ ] **Step 2: Add API import and useEffect for fetching questions**

Add import at top:

```tsx
import React, { useState, useEffect } from "react";
import { fetchQuestions } from "../services/api";
```

- [ ] **Step 3: Replace the questions initialization**

Replace:

```tsx
const questions = t.questions;
```

With:

```tsx
const [questions, setQuestions] = useState<string[]>([]);
const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);

useEffect(() => {
  let cancelled = false;
  
  async function loadQuestions() {
    setIsLoadingQuestions(true);
    const result = await fetchQuestions();
    if (!cancelled) {
      if (result.ok) {
        setQuestions(result.data.questions);
      } else {
        // Fallback to hardcoded questions
        setQuestions(t.questions);
      }
      setIsLoadingQuestions(false);
    }
  }
  
  loadQuestions();
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 4: Initialize answers only after questions are loaded**

Replace:

```tsx
const [answers, setAnswers] = useState<(boolean | null)[]>(questions.map(() => null));
```

With:

```tsx
const [answers, setAnswers] = useState<(boolean | null)[]>([]);

// Sync answers array when questions load
useEffect(() => {
  if (questions.length > 0) {
    setAnswers(questions.map(() => null));
  }
}, [questions]);
```

- [ ] **Step 5: Add loading skeleton for questions**

Before the questions map, add a loading state check. Replace the questions section with:

```tsx
{isLoadingQuestions ? (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white border-[1.5px] border-gray-100 rounded-[16px] p-5 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-5"></div>
        <div className="space-y-3">
          <div className="h-3 bg-gray-100 rounded w-1/4"></div>
          <div className="h-3 bg-gray-100 rounded w-1/4"></div>
        </div>
      </div>
    ))}
  </div>
) : (
  <div className="space-y-4 mb-8">
    {questions.map((question, index) => (
      // ... existing question rendering code (unchanged)
    ))}
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/components/QuestionnaireScreen.tsx && git commit -m "feat: fetch questions from API with fallback"
```

---

### Task 10: Update TriageSummaryScreen for API-driven triage

**Files:**
- Modify: `frontend/src/components/TriageSummaryScreen.tsx`

- [ ] **Step 1: Replace the TriageSummaryScreen props and logic**

Change the Props interface:

```tsx
import { TriageResult } from "../types";

interface Props {
  language: Language;
  answers: boolean[];
  clinicId: string;
  onTriageResult: (result: TriageResult) => void;
  onReset: () => void;
}
```

- [ ] **Step 2: Remove the local isHighRisk computation and add API submission**

Replace the component body's first lines. Instead of computing `isHighRisk` locally, add a useEffect to submit to API:

```tsx
export function TriageSummaryScreen({ language, answers, clinicId, onTriageResult, onReset }: Props) {
  const t = text[language];
  const [isSubmitting, setIsSubmitting] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    
    async function submit() {
      setIsSubmitting(true);
      setSubmitError(null);
      
      const result = await submitRegistration({
        language,
        clinicId,
        answers,
      });
      
      if (!cancelled) {
        if (result.ok) {
          onTriageResult({
            level: result.data.triage,
            message: result.data.message,
          });
        } else {
          setSubmitError(result.error);
          setIsSubmitting(false);
        }
      }
    }
    
    submit();
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 3: Add imports for useState, useEffect, and submitRegistration**

Add at the top:

```tsx
import React, { useState, useEffect } from "react";
import { submitRegistration } from "../services/api";
```

- [ ] **Step 4: Add loading state UI**

Before the triage result display, add:

```tsx
{isSubmitting && (
  <div className="h-full flex flex-col items-center justify-center p-6">
    <div className="w-20 h-20 rounded-full bg-[#E1F0E9] flex items-center justify-center mb-6">
      <svg className="animate-spin h-10 w-10 text-[#0A5C43]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
    <h2 className="text-[22px] font-bold text-[#0A5C43] mb-3">Submitting...</h2>
    <p className="text-[15px] text-[#4F675C] text-center">Please wait while we process your registration.</p>
  </div>
)}
```

- [ ] **Step 5: Add error state with retry**

```tsx
{submitError && (
  <div className="h-full flex flex-col items-center justify-center p-6">
    <div className="w-20 h-20 rounded-full bg-[#FFF2F2] flex items-center justify-center mb-6">
      <AlertCircle size={36} className="text-[#D32F2F]" strokeWidth={2.5} />
    </div>
    <h2 className="text-[22px] font-bold text-[#B71C1C] mb-3">Unable to Submit</h2>
    <p className="text-[15px] text-[#4F675C] text-center mb-2">{submitError}</p>
    <p className="text-[14px] text-[#4F675C] text-center mb-8">Please ask staff for assistance.</p>
    <button 
      onClick={onReset}
      className="w-full max-w-[300px] py-[16px] bg-white border-[1.5px] border-[#0A5C43] text-[#0A5C43] hover:bg-[#EAF5F0] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2"
    >
      <RotateCcw size={18} strokeWidth={2.5} />
      {t.startOver}
    </button>
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add src/components/TriageSummaryScreen.tsx && git commit -m "feat: submit registration to API with loading/error states"
```

---

### Task 11: Create deploy script and runtime config

**Files:**
- Create: `frontend/deploy.sh`
- Create: `frontend/config.js`
- Delete: `frontend/metadata.json`

- [ ] **Step 1: Create deploy.sh**

```bash
#!/usr/bin/env bash
set -e
echo "==> Building frontend..."
npm run build
echo "==> Deploying to /var/www/arogya-entry/..."
sudo mkdir -p /var/www/arogya-entry
sudo cp -r dist/* /var/www/arogya-entry/
if [ ! -f /var/www/arogya-entry/config.js ]; then
  sudo cp config.js /var/www/arogya-entry/config.js
  echo "==> Created config.js from template"
fi
echo "==> Deploy complete: /var/www/arogya-entry/"
```

- [ ] **Step 2: Make deploy.sh executable**

```bash
chmod +x /home/developper/arogya-entry/frontend/deploy.sh
```

- [ ] **Step 3: Create config.js**

```js
window.__APP_CONFIG__ = {
  apiBaseUrl: "/api"
};
```

- [ ] **Step 4: Delete metadata.json**

```bash
rm /home/developper/arogya-entry/frontend/metadata.json
```

- [ ] **Step 5: Verify build works end-to-end**

```bash
cd /home/developper/arogya-entry/frontend && npm run build
```
Expected: `dist/` created successfully with `index.html`, `assets/`, and JS/CSS bundles.

- [ ] **Step 6: Verify dist/index.html includes config.js script tag**

```bash
grep "config.js" /home/developper/arogya-entry/frontend/dist/index.html
```
Expected: Should show `<script src="/config.js"></script>`.

- [ ] **Step 7: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add deploy.sh config.js && git rm metadata.json && git commit -m "feat: add deploy script, runtime config, remove AI Studio manifest"
```

---

### Task 12: Create new .env.example

**Files:**
- Modify: `frontend/.env.example`

- [ ] **Step 1: Replace .env.example**

Replace the entire content of `frontend/.env.example` with:

```
# VITE_API_BASE_URL: Backend API base URL.
# Defaults to /api (relative, proxied by nginx).
# Set this only if the backend is on a different host/port.
# VITE_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 2: Commit**

```bash
cd /home/developper/arogya-entry/frontend && git add .env.example && git commit -m "docs: replace .env.example with clean template"
```

---

### Task 13: Final build verification

**Files:**
- None (verification only)

- [ ] **Step 1: Clean and rebuild from scratch**

```bash
cd /home/developper/arogya-entry/frontend && npm run clean && npm run build
```
Expected: Clean `dist/` directory created with all assets.

- [ ] **Step 2: Run TypeScript lint check**

```bash
cd /home/developper/arogya-entry/frontend && npm run lint
```
Expected: No TypeScript errors.

- [ ] **Step 3: Verify dist structure**

```bash
ls -la /home/developper/arogya-entry/frontend/dist/
```
Expected: `index.html`, `assets/` directory present.

- [ ] **Step 4: Verify no AI Studio remnants**

```bash
grep -r "gemini\|GEMINI\|google/genai\|AI Studio\|APP_URL" /home/developper/arogya-entry/frontend/src/ 2>/dev/null
```
Expected: No matches.

- [ ] **Step 5: Commit any remaining changes**

```bash
cd /home/developper/arogya-entry/frontend && git status
```
Commit any uncommitted changes if present.
