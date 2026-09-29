#!/bin/sh
# Push a new logsrv.py to autobox; systemd (Restart=always, RestartSec=5)
# restarts it. Waits until it answers again.
set -e
cd "$(dirname "$0")"
scp -q logsrv.py autobox:piano-logs/logsrv.py
ssh autobox 'pkill -f piano-logs/logsrv.py || true'
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 1
  if curl -sf -m 2 https://logs.cranbury.ezyang.com/health >/dev/null; then echo "logsrv is back"; exit 0; fi
done
echo "logsrv did not come back; check: ssh autobox journalctl -u piano-logs" >&2
exit 1
