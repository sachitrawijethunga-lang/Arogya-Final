#!/usr/bin/env bash
set -euo pipefail

REPO="/home/developper/arogya-entry"
CADDYFILE="/etc/caddy/Caddyfile"
WWW="/var/www/arogya-entry"

echo "==> [1/5] Building frontend"
cd "$REPO/frontend"
npm ci
npm run build

echo "==> [2/5] Shipping frontend to ${WWW}"
sudo rsync -a --delete "$REPO/frontend/dist/" "${WWW}/"
sudo cp "$REPO/frontend/config.js" "${WWW}/config.js"

echo "==> [3/5] Building + testing backend"
cd "$REPO/backend"
npm ci
npm test

echo "==> [4/5] Restarting backend (pm2)"
pm2 restart arogya-backend --update-env || pm2 start ecosystem.config.cjs

echo "==> [5/5] Ensuring Caddy /arogya/api route, then reloading"
if ! grep -q "/arogya/api" "$CADDYFILE"; then
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
fi

if caddy validate --adapter caddyfile --config "$CADDYFILE"; then
  sudo systemctl reload caddy
else
  echo "    caddy validate FAILED — NOT reloading. Inspect ${CADDYFILE}"
  exit 1
fi

echo ""
echo "Deploy complete: https://vmi3065909.contaboserver.net/arogya/"
