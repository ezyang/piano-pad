"""Labeling server for the parent: serves the page, the clips and records
answers. Home network only; nothing leaves this machine.

    python3 tools/label/server.py <data dir> [port=8770]

<data dir> holds manifest.json and clips/ (from make-clips.mjs); answers are
appended to <data dir>/labels.jsonl (the latest answer per clip wins).
"""
import json, os, sys, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

DATA = os.path.abspath(sys.argv[1])
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8770
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
LABELS = os.path.join(DATA, 'labels.jsonl')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DATA, **kw)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            return self._send(open(PAGE, 'rb').read(), 'text/html; charset=utf-8')
        if self.path == '/labels':
            rows = [json.loads(l) for l in open(LABELS)] if os.path.exists(LABELS) else []
            return self._send(json.dumps(rows).encode(), 'application/json')
        if self.path in ('/manifest.json', '/examples.json') or self.path.startswith(('/clips/', '/examples/')):
            return super().do_GET()
        self.send_error(404)

    def do_POST(self):
        if self.path != '/label':
            return self.send_error(404)
        row = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        # A page loaded before the clips were rebuilt would label the wrong
        # steps: it sends the manifest's size and we refuse on a mismatch.
        layout = row.pop('layout', None)
        if layout != os.path.getsize(os.path.join(DATA, 'manifest.json')):
            return self._send(b'{"ok":false,"stale":true}', 'application/json', 409)
        row['saved'] = time.strftime('%Y-%m-%dT%H:%M:%S')
        with open(LABELS, 'a') as fh:
            fh.write(json.dumps(row) + '\n')
        self._send(b'{"ok":true}', 'application/json')

    def _send(self, body, ctype, status=200):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print(f'labeling on http://0.0.0.0:{PORT}/  (data: {DATA})', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
