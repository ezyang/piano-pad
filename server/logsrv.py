#!/usr/bin/env python3
"""Practice-log receiver for Piano Pad. Stdlib only; runs behind nginx.

  POST /sessions            JSON array of session logs -> DATA/<day>/<id>.json
  PUT  /audio/<id>.<ext>    raw audio bytes (mp4/webm)  -> DATA/<day>/<id>.<ext>
  GET  /health              "ok"

Files for a session land in the directory of the day it started, so a JSON
log and its recording sit side by side.
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA = Path(os.environ.get("PIANO_LOGS_DIR", Path.home() / "piano-logs"))
PORT = int(os.environ.get("PIANO_LOGS_PORT", "8790"))
ORIGINS = {"https://piano.ezyang.com", "http://localhost:8000"}
MAX_JSON = 5 * 1024 * 1024
MAX_AUDIO = 60 * 1024 * 1024
ID = re.compile(r"^[a-z][a-z0-9]{4,40}$")
EXT = {"mp4", "m4a", "webm", "ogg"}


def day_dir(started: str | None) -> Path:
    day = (started or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        day = "undated"
    d = DATA / day
    d.mkdir(parents=True, exist_ok=True)
    return d


def find_day(session_id: str) -> Path:
    """Directory holding a session's JSON, or today's if it hasn't arrived yet."""
    for p in DATA.glob(f"*/{session_id}.json"):
        return p.parent
    from datetime import date
    return day_dir(date.today().isoformat())


class Handler(BaseHTTPRequestHandler):
    server_version = "piano-logs/1"

    def cors(self):
        origin = self.headers.get("Origin")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, PUT, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            # Chrome's Private Network Access: a public site calling a LAN host.
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

    def reply(self, code: int, body: str = ""):
        data = body.encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self, limit: int) -> bytes | None:
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > limit:
            self.reply(413 if n > limit else 411, "bad length")
            return None
        return self.rfile.read(n)

    def do_OPTIONS(self):
        self.reply(204)

    def do_GET(self):
        self.reply(200, "ok") if self.path == "/health" else self.reply(404, "not found")

    def do_POST(self):
        if self.path != "/sessions":
            return self.reply(404, "not found")
        raw = self.body(MAX_JSON)
        if raw is None:
            return
        try:
            sessions = json.loads(raw)
            assert isinstance(sessions, list)
        except Exception:
            return self.reply(400, "expected a JSON array")
        saved = 0
        for s in sessions:
            sid = s.get("id") if isinstance(s, dict) else None
            if not isinstance(sid, str) or not ID.match(sid):
                continue
            path = day_dir(s.get("started")) / f"{sid}.json"
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(s, separators=(",", ":")))
            tmp.replace(path)
            saved += 1
        self.reply(200, json.dumps({"saved": saved}))

    def do_PUT(self):
        m = re.fullmatch(r"/audio/([a-z0-9]+)\.([a-z0-9]+)", self.path)
        if not m or not ID.match(m[1]) or m[2] not in EXT:
            return self.reply(404, "not found")
        raw = self.body(MAX_AUDIO)
        if raw is None:
            return
        path = find_day(m[1]) / f"{m[1]}.{m[2]}"
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.replace(path)
        self.reply(200, json.dumps({"bytes": len(raw)}))

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    DATA.mkdir(parents=True, exist_ok=True)
    print(f"piano-logs on 127.0.0.1:{PORT}, data in {DATA}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
