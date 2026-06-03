#!/usr/bin/env bash
# One-shot, idempotent bring-up for the Arogya app on this server.
# Builds + ships the frontend, stands up the backend under pm2, and adds the
# Caddy /arogya/api route — without ever disturbing the co-hosted DHIS2.
# Safe to re-run. Run as the `developper` user (NOT with sudo); it will ask
# for your password once for the few root-only steps.
set -euo pipefail

REPO="/home/developper/arogya-entry"
CADDYFILE="/etc/caddy/Caddyfile"
WWW="/var/www/arogya-entry"
DBDIR="/var/lib/arogya"

log(){ printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

log "Caching sudo credentials (you will be asked for your password once)"
sudo -v

log "[1/8] Building frontend"
cd "$REPO/frontend"
npm ci
npm run build

log "[2/8] Shipping frontend to $WWW"
sudo mkdir -p "$WWW"
sudo rsync -a --delete "$REPO/frontend/dist/" "$WWW/"
sudo cp "$REPO/frontend/config.js" "$WWW/config.js"

log "[3/8] Installing pm2 if missing"
if ! command -v pm2 >/dev/null 2>&1; then
  npm i -g pm2
fi

log "[4/8] Creating SQLite data dir $DBDIR"
sudo mkdir -p "$DBDIR"
sudo chown "$(id -un)":"$(id -gn)" "$DBDIR"

log "[5/8] Installing + testing backend"
cd "$REPO/backend"
npm ci
npm test

log "[6/8] Starting/restarting backend under pm2"
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

log "[7/8] Ensuring Caddy /arogya/api route (DHIS2 block untouched)"
BACKUP=""
if grep -q "/arogya/api" "$CADDYFILE"; then
  echo "    route already present — skipping patch"
else
  BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
  sudo cp "$CADDYFILE" "$BACKUP"
  awk '
    /handle_path \/arogya\/\* \{/ && !ins {
      print "    handle_path /arogya/api/* {"
      print "        reverse_proxy 127.0.0.1:4000"
      print "    }"
      print ""
      ins = 1
    }
    { print }
  ' "$BACKUP" | sudo tee "$CADDYFILE" > /dev/null
  echo "    inserted /arogya/api block (backup: $BACKUP)"
fi

log "[8/8] Validating + reloading Caddy"
if sudo caddy validate --adapter caddyfile --config "$CADDYFILE"; then
  sudo systemctl reload caddy
  echo "    Caddy validated and reloaded"
else
  echo "    caddy validate FAILED"
  if [ -n "$BACKUP" ]; then
    echo "    restoring backup $BACKUP"
    sudo cp "$BACKUP" "$CADDYFILE"
  fi
  exit 1
fi

log "Verifying"
sleep 1
echo -n "  backend (direct)   : "; curl -s http://127.0.0.1:4000/health || echo "FAILED"; echo
echo -n "  backend (via Caddy): "; curl -sk https://vmi3065909.contaboserver.net/arogya/api/health || echo "FAILED"; echo
echo -n "  frontend bundle    : "; curl -sk https://vmi3065909.contaboserver.net/arogya/ | grep -o 'index-[A-Za-z0-9]*\.js' || echo "FAILED"

cat <<EOF

Done. Open (and hard-refresh):
  https://vmi3065909.contaboserver.net/arogya/?clinic=AC-002

Optional — start the backend automatically on server reboot:
  sudo env PATH="\$PATH" "\$(command -v pm2)" startup systemd -u "$(id -un)" --hp "$HOME"
  pm2 save
EOF
