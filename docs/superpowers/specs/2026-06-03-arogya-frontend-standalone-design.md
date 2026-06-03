# Arogya Entry Frontend — Standalone Conversion Design

**Date:** 2026-06-03
**Status:** Approved

## Overview

Convert the existing Google AI Studio React app into a standalone static frontend served from `/var/www/arogya-entry/` on `vmi3065909.contaboserver.net`, connected to an independent Node.js backend (built separately in `backend/`). The frontend must coexist with the existing DHIS2 instance at `/dhis/` without any interference.

---

## Architecture

```
                          ┌──────────────────────────────────────┐
                          │  contaboserver.net (VPS)             │
                          │                                      │
  HTTPS ──────────────────►  nginx proxy (LXD 172.19.2.2)        │
                          │  │                                   │
                          │  ├─ server_name: vmi3065909...       │
                          │  │   └─ /dhis/  → DHIS2 (172.19.2.11)│  ← UNTOUCHED
                          │  │                                   │
                          │  ├─ server_name: arogya.vmi3065909.. │  ← NEW (isolated)
                          │  │   ├─ /       → /var/www/arogya-entry/ │ static files
                          │  │   └─ /api/*  → backend (Node.js)  │
                          │                                      │
                          └──────────────────────────────────────┘
```

- **Subdomain-based:** `arogya.vmi3065909.contaboserver.net`
- **Separate nginx server block:** Zero risk of path conflicts with DHIS2
- **DHIS2 server block remains completely untouched** — not modified, not reloaded

---

## API Strategy: Full Backend-Driven (Option B)

All data flows through the backend:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/questions` | GET | Fetch screening questions |
| `/api/clinics/validate` | POST | Validate clinic ID |
| `/api/registration` | POST | Submit answers, receive triage result |

**API URL discovery:** Primary method is relative URLs (`/api/*`), relying on nginx reverse proxy (same origin, no CORS). Fallback via `window.__APP_CONFIG__` for non-proxied setups.

---

## Frontend Changes

### Dependencies

| Action | Package | Reason |
|--------|---------|--------|
| Remove | `@google/genai` | No Gemini AI |
| Remove | `express`, `@types/express`, `tsx`, `esbuild` | Backend concern |
| Remove | `dotenv` | Vite handles env natively |
| Keep | `react`, `react-dom`, `vite`, `@vitejs/plugin-react` | Core |
| Keep | `@yudiel/react-qr-scanner`, `lucide-react`, `motion` | Features |
| Keep | `tailwindcss`, `@tailwindcss/vite`, `tailwind-merge`, `clsx` | Styling |
| Keep | `typescript`, `autoprefixer` | Dev |

### Files to remove
- `metadata.json` — AI Studio manifest
- `.env.example` — replaced with clean version

### Files to create
- `src/services/api.ts` — typed fetch wrapper (`ApiResult<T>`)
- `src/config.ts` — runtime config reader (reads `window.__APP_CONFIG__`, defaults to `/api`)
- `deploy.sh` — build + deploy script
- `config.js` — runtime config template for deployment

### Files to modify
- `package.json` — cleaned deps, removed `dev`/`preview`/`server` scripts
- `vite.config.ts` — remove dev server proxy, HMR config, server settings
- `index.html` — add `<script>` for `config.js` before app bundle
- `src/App.tsx` — replace hardcoded flow with API calls; add loading/error states
- `src/components/ScannerScreen.tsx` — validate clinic ID via `/api/clinics/validate`
- `src/components/QuestionnaireScreen.tsx` — fetch questions via `/api/questions`; fallback to hardcoded set
- `src/components/TriageSummaryScreen.tsx` — receive triage result from `/api/registration`
- `src/types.ts` — add API response types, `ApiResult<T>`, loading states

### API contract

```
GET  /api/questions
  Response: { questions: string[] }

POST /api/clinics/validate
  Body: { clinicId: string }
  Response: { valid: boolean, clinicName?: string }

POST /api/registration
  Body: { language: string, clinicId: string, answers: boolean[] }
  Response: { triage: "high-risk" | "normal", message: string }
```

---

## Build & Deployment

### No dev server
- `npm run dev` is removed — no Vite dev server used
- All testing is done against the live deployed version
- Workflow: `code → build → deploy → test live`

### Scripts

```json
{
  "scripts": {
    "build": "vite build",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "deploy": "./deploy.sh"
  }
}
```

### Deploy script (`deploy.sh`)

```bash
#!/usr/bin/env bash
set -e
npm run build
sudo mkdir -p /var/www/arogya-entry
sudo cp -r dist/* /var/www/arogya-entry/
[ ! -f /var/www/arogya-entry/config.js ] && sudo cp config.js /var/www/arogya-entry/config.js
echo "Deployed to /var/www/arogya-entry/"
```

For remote deployment to Contabo VPS:

```bash
rsync -avz dist/ user@vmi3065909.contaboserver.net:/var/www/arogya-entry/
```

### Runtime config (`config.js`)

```js
window.__APP_CONFIG__ = {
  apiBaseUrl: "/api"
};
```

Loaded before the app bundle via `<script>` in `index.html`. If absent, the app defaults to `/api`.

---

## Error Handling & Loading States

### API client (`ApiResult<T>`)

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```

- Network/HTTP errors return `{ ok: false, error: ... }`
- 10-second timeout per request
- Single attempt (no retry)

### Per-screen behavior

| Screen | Behavior |
|--------|----------|
| Scanner (validate) | Inline error: "Unable to verify clinic ID. Please try again." |
| Questionnaire (fetch) | Falls back to hardcoded questions from `translations.ts` |
| Triage (submit) | Full-screen message: "Unable to submit. Please ask staff for assistance." + retry button |

### Loading indicators

- Submit button spinner during clinic validation
- Skeleton placeholders during question fetch
- Full-screen overlay + "Submitting..." during registration submit

### Privacy

No health data is stored locally (no localStorage/IndexedDB). Failed submissions are not cached.

---

## Nginx Configuration (reference)

```nginx
server {
    listen 443 ssl http2;
    server_name arogya.vmi3065909.contaboserver.net;

    # SSL cert (shared with main domain or separate)
    ssl_certificate     /etc/letsencrypt/live/vmi3065909.contaboserver.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vmi3065909.contaboserver.net/privkey.pem;

    root /var/www/arogya-entry;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to Node.js backend
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        include /etc/nginx/proxy_params;
    }
}
```

This server block is **completely separate** from the DHIS2 configuration — it does not touch, include, or affect the DHIS2 `server{}` block in any way.

---

## Constraints & Safety Rules

1. **Never modify the DHIS2 nginx config** — not even `nginx -t` on that file
2. **Never restart/reload nginx without first verifying `nginx -t` passes**
3. **No dev server** — always build and deploy; test on live subdomain
4. **No Gemini / Google AI** — removed entirely
5. **No health data stored client-side** — privacy requirement
