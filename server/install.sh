#!/bin/sh
# One-time setup on autobox (needs sudo). From a checkout or copy of server/:
#   sudo sh install.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
install -d -o ezyang -g ezyang /home/ezyang/piano-logs
install -o ezyang -g ezyang -m 755 "$here/logsrv.py" /home/ezyang/piano-logs/logsrv.py
install -m 644 "$here/piano-logs.service" /etc/systemd/system/piano-logs.service
install -m 644 "$here/logs.cranbury.ezyang.com.conf" /etc/nginx/sites-available/logs.cranbury.ezyang.com
ln -sf /etc/nginx/sites-available/logs.cranbury.ezyang.com /etc/nginx/sites-enabled/logs.cranbury.ezyang.com
systemctl daemon-reload
systemctl enable --now piano-logs
nginx -t
systemctl reload nginx
echo "ok: https://logs.cranbury.ezyang.com/health"
