# Arogya PHNO Portal — Operator & Login Guide

The PHNO (Public Health Nursing Officer) portal lets each clinic's nurse log in and
review the patient registrations made at **her clinic only** — approve, edit, or
reject each record, with a full audit trail. It shares the same site as the patient
kiosk; the URL path decides which app loads.

---

## 0. Deployment prerequisite (do this first)

> **The portal is not live until this branch is deployed.** As of writing, the
> running backend predates the staff feature — `GET /arogya/api/staff/me` returns
> **404** (routes not mounted), so login will not work yet. The code is complete and
> committed on the `phno-verification` branch but has not been shipped.

Deploy from the server as the **`developper`** user (it asks for the sudo password
once for the root-only steps — do **not** prefix with `sudo`):

```bash
cd /home/developper/arogya-entry
git checkout phno-verification        # ship this branch
./go-live.sh
```

`go-live.sh` builds + ships the frontend to `/var/www/arogya-entry`, runs the backend
tests, restarts the pm2 backend (mounting `/staff/*`), and reloads Caddy. It leaves
the co-hosted DHIS2 untouched. Verify afterwards:

```bash
curl -s http://127.0.0.1:4000/staff/me            # expect 401 (mounted), not 404
pm2 list                                           # arogya-backend "online"
```

> Note: `go-live.sh` does **not** add the bare-`/arogya` redirect — see
> *Troubleshooting* for that separate one-line Caddy change.

---

## 1. Accessing the portal

| App | URL |
|-----|-----|
| Patient kiosk | `https://vmi3065909.contaboserver.net/arogya/` |
| **PHNO portal** | `https://vmi3065909.contaboserver.net/arogya/staff` |

> ⚠️ **Always include the trailing slash on `/arogya/`.** A bare
> `…/arogya` (no slash) is currently misrouted to the DHIS2 backend and returns
> **502**. The portal path `…/arogya/staff` is fine. See *Troubleshooting*.

The portal shows a login screen. After signing in, the nurse sees only her own
clinic's review queue.

---

## 2. Creating a PHNO account (admin, one-time per nurse)

Accounts are created from the **backend server** with the `create-phno` CLI. Each
account is tied to exactly one clinic (`AC-001` … `AC-040`).

```bash
cd /home/developper/arogya-entry/backend

# Prompted for the password (hidden) — recommended:
node scripts/create-phno.js --clinic AC-005 --username nimasha --name "Nimasha P."

# Or pass it inline (avoid in shared shells — it lands in shell history):
node scripts/create-phno.js --clinic AC-005 --username nimasha --name "Nimasha P." --password 'StrongPass123'
```

Rules enforced by the CLI:
- Clinic must exist (`AC-001`…`AC-040`); unknown clinic is rejected.
- Username must be unique; duplicates are rejected.
- Password must be **at least 8 characters**.

On success it prints e.g. `Created PHNO #3: nimasha @ AC-005 (Nimasha P.)`.

The account is written to the same SQLite DB the running backend uses
(`AROGYA_DB_PATH`, default set by the pm2 ecosystem). Run the CLI on the server so
it targets the live DB.

### Demo / test account
For local testing only:

| Field | Value |
|-------|-------|
| Username | `phno` |
| Password | `arogya1234` |
| Clinic | `AC-005` (Kirinda) |

```bash
node scripts/create-phno.js --clinic AC-005 --username phno --name "Demo PHNO" --password arogya1234
```
Do **not** use a weak demo password for real clinics.

---

## 3. Logging in

1. Open `…/arogya/staff`.
2. Enter the **username** and **password** created above.
3. On success you land on your clinic's **review queue**.

Notes:
- A session cookie (`arogya_session`) keeps you signed in for **12 hours**, then you
  must log in again.
- After **5 failed attempts** (per username) login is temporarily blocked
  (HTTP 429) — wait and retry.
- The login error message is deliberately generic ("Invalid username or password")
  and does not reveal whether the username exists.
- **Log out** with the link in the top-right of the portal when done (especially on
  shared devices).

---

## 4. Reviewing registrations

The queue lists registrations **for your clinic only**, newest first.

**Filter tabs:** Pending · Approved · Rejected · All
**Search box:** matches patient name, NIC, or Arogya ID.

Click a record to open its **detail** view:

- **Patient details** — name, NIC/PHN, gender, DOB, mobile, address, etc.
- **Screening** — number of flagged symptoms and the triage result (`high-risk`
  records are badged in red).
- **History** — the full audit trail (who edited/approved/rejected and when).

For a **pending** record you can:

| Action | Effect |
|--------|--------|
| **Approve** | Marks the record `approved`, records you as reviewer + timestamp. Idempotent. |
| **Edit** | Correct patient fields. Saved changes are validated and written to the audit log (field-by-field from→to). Only **pending** records can be edited. |
| **Reject** | Requires a typed **reason**. Marks the record `rejected` with the reason. |

Once a record is approved or rejected it is locked (further edit/approve/reject
returns a conflict). A nurse can never see or act on another clinic's records
(those return *Forbidden*).

> DHIS2 push ("Layer B") is not wired up yet — approving currently only updates the
> local record + audit. The push will trigger from the Approve action in a later
> release.

---

## 5. Troubleshooting

**502 on `https://…/arogya` (no trailing slash).**
The Caddy site routes `/arogya/api/*` (backend) and `/arogya/*` (static app); a bare
`/arogya` matches neither and falls through to the DHIS2 catch-all, which is
currently down. Use `…/arogya/` or `…/arogya/staff`. Permanent fix — add to
`/etc/caddy/Caddyfile` *before* the catch-all `handle { … }` block:

```caddy
    handle /arogya {
        redir * /arogya/ 308
    }
```
then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

**Can't log in / 401 immediately.** Confirm the account exists and clinic is correct:
```bash
cd /home/developper/arogya-entry/backend
node -e "import('./src/db.js').then(({openDb})=>{const db=openDb();console.table(db.prepare('SELECT id,username,clinic_id,disabled FROM phno_users').all())})"
```

**Locked out (429).** Login throttle after 5 failures per username; it clears after
the window (15 min) or on the next successful login.

**Backend health check.**
```bash
pm2 list                              # arogya-backend should be "online"
curl -s http://127.0.0.1:4000/health  # -> {"ok":true}
```

**Disable an account** (e.g. nurse leaves) — sets `disabled=1`; existing sessions
stop authorizing immediately:
```bash
cd /home/developper/arogya-entry/backend
node -e "import('./src/db.js').then(({openDb})=>{const db=openDb();db.prepare('UPDATE phno_users SET disabled=1 WHERE username=?').run('nimasha');console.log('disabled')})"
```

---

## 6. Security summary

- Passwords stored as **scrypt** hashes with per-user salt (no plaintext).
- Sessions are server-side, opaque tokens; cookie is `HttpOnly` + `SameSite=Strict`
  (and `Secure`, scoped to `/arogya`, in production).
- Per-clinic authorization on every staff route — a nurse only ever sees/acts on her
  own clinic's records.
- Login throttling limits brute-force attempts.
- All edit/approve/reject actions are recorded in `registration_audit`.
