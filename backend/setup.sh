#!/usr/bin/env bash
set -euo pipefail

REPO="/home/developper/arogya-entry"
CADDYFILE="/etc/caddy/Caddyfile"

echo "==> Installing pm2 (user-global, no sudo)"
npm i -g pm2

echo "==> Creating SQLite data directory"
sudo mkdir -p /var/lib/arogya
sudo chown developper:developper /var/lib/arogya

echo "==> Installing backend dependencies"
cd "$REPO/backend"
npm ci

echo "==> Starting backend under pm2"
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Patching Caddy (adds /arogya/api route; DHIS2 block untouched)"
if grep -q "/arogya/api" "$CADDYFILE"; then
  echo "    /arogya/api route already present — skipping"
else
  TS="$(date +%Y%m%d%H%M%S)"
  sudo cp "$CADDYFILE" "${CADDYFILE}.bak.${TS}"
  awk '
    /handle_path \/arogya\/\* \{/ && !ins {
      print "    handle_path /arogya/api/* {"
      print "        reverse_proxy 127.0.0.1:4000"
      print "    }"
      print ""
      ins = 1
    }
    { print }
  ' "${CADDYFILE}.bak.${TS}" | sudo tee "$CADDYFILE" > /dev/null

  if caddy validate --adapter caddyfile --config "$CADDYFILE"; then
    sudo systemctl reload caddy
    echo "    Caddy validated and reloaded"
  else
    echo "    caddy validate FAILED — restoring backup and aborting"
    sudo cp "${CADDYFILE}.bak.${TS}" "$CADDYFILE"
    exit 1
  fi
fi

echo ""
echo "==> To enable start-on-boot, run the sudo command pm2 prints below ONCE:"
pm2 startup systemd -u developper --hp /home/developper || true
echo ""
echo "Setup complete. Backend: http://127.0.0.1:4000  | App: https://vmi3065909.contaboserver.net/arogya/"
