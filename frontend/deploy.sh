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
