#!/bin/sh
# Push a new logsrv.py to autobox; systemd (Restart=always) restarts it.
set -e
cd "$(dirname "$0")"
scp -q logsrv.py autobox:piano-logs/logsrv.py
ssh autobox 'pkill -f piano-logs/logsrv.py || true'
