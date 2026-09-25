// Practice logs, for debugging and tuning. Each practice run (or "play to
// write" take) is recorded as a session: what was expected, everything the
// detector reported (including rejected pitches and why a pitch was chosen),
// how each note was judged, mic level once a second, simulated key presses,
// and errors. Sessions are kept on the device and can be shared as a JSON
// file (⚙︎ menu) or, once UPLOAD_URL is set, uploaded.
//
// No audio is recorded, and nothing identifies the player beyond song titles.
import { engine } from './engine.js';
import { getState } from './store.js';

const KEY = 'pianopad.logs';
const MAX_BYTES = 1_500_000; // localStorage is ~5 MB on Safari; leave room for songs
export const UPLOAD_URL = null; // set once the log endpoint exists

let current = null;
let levelTimer = 0;
const unsubs = [];

const now = () => Math.round(performance.now() - current.t0);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? []; } catch { return []; } };
function store(sessions) {
  let json = JSON.stringify(sessions);
  while (json.length > MAX_BYTES && sessions.length > 1) {
    // Drop the oldest, preferring ones already uploaded.
    const i = sessions.findIndex((s) => s.uploaded);
    sessions.splice(i >= 0 ? i : 0, 1);
    json = JSON.stringify(sessions);
  }
  try { localStorage.setItem(KEY, json); } catch { /* full or unavailable */ }
}

export const loggingEnabled = () => getState().keepLogs !== false;

// kind: 'practice' | 'write'. info: song and mode details.
export function startSession(kind, info) {
  if (current) endSession({ aborted: true });
  if (!loggingEnabled()) return;
  const ctx = engine.ctx;
  current = {
    v: 1,
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    kind,
    started: new Date().toISOString(),
    t0: performance.now(),
    ctxT0: ctx?.currentTime ?? 0,
    app: {
      built: document.lastModified,
      ua: navigator.userAgent,
      screen: [innerWidth, innerHeight, devicePixelRatio],
      standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    },
    audio: ctx ? { sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency } : null,
    settings: { showLetters: getState().showLetters !== false, testKeyboard: !!getState().testKeyboard, detector: getState().detector ?? 'simple' },
    ...info,
    events: [],
  };
  engine.takeLevelStats();
  unsubs.push(engine.onRaw((e) => {
    // Audio-clock times, relative to the session's start on that clock.
    const t = (x) => Math.round((x - current.ctxT0) * 1000);
    if (e.type === 'onset') event('onset', { at: t(e.time), seen: t(e.detectedTime), flux: +e.flux.toFixed(1) });
    else if (e.type === 'pitch') {
      event('pitch', {
        at: t(e.time), seen: t(e.detectedTime), midi: e.midi, f0: e.f0 ? +e.f0.toFixed(1) : 0,
        clarity: +(e.clarity ?? 0).toFixed(2), ok: e.accepted, ...(e.method ? { method: e.method } : {}), ...(e.why ? { why: e.why } : {}),
      });
    }
  }));
  const sim = (midi) => event('sim', { midi });
  engine.simListeners.add(sim);
  unsubs.push(() => engine.simListeners.delete(sim));
  levelTimer = setInterval(() => {
    const L = engine.takeLevelStats();
    if (L) event('level', L);
  }, 1000);
}

// Timestamped event in the current session (no-op when none is running).
export function event(type, data = {}) {
  if (!current) return;
  current.events.push([now(), type, data]);
}

export function endSession(result = {}) {
  if (!current) return;
  clearInterval(levelTimer);
  while (unsubs.length) unsubs.pop()();
  const s = current;
  current = null;
  // An abandoned run where nothing was heard isn't worth keeping.
  if (result.aborted && !s.events.some((e) => e[1] === 'onset' || e[1] === 'sim')) return;
  s.ended = new Date().toISOString();
  s.duration = Math.round(performance.now() - s.t0);
  s.result = result;
  delete s.t0;
  const sessions = load();
  sessions.push(s);
  store(sessions);
  upload();
}

export function sessionCount() { return load().length; }

// An AudioContext time as milliseconds since the session started, on the
// same clock as the detector events.
export const ctxMs = (t) => (current ? Math.round((t - current.ctxT0) * 1000) : 0);

// Share all stored sessions as a JSON file (AirDrop, Files, ...).
export async function shareLogs() {
  const sessions = load();
  const name = `piano-pad-logs-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  const file = new File([JSON.stringify({ exported: new Date().toISOString(), sessions }, null, 1)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Piano Pad practice logs' }); return; } catch { /* cancelled */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function clearLogs() { store([]); }

// Send sessions that haven't been uploaded yet. Safe to call any time.
export async function upload() {
  if (!UPLOAD_URL || !navigator.onLine) return;
  const sessions = load();
  const pending = sessions.filter((s) => !s.uploaded);
  if (!pending.length) return;
  try {
    const res = await fetch(UPLOAD_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending) });
    if (!res.ok) return;
    const latest = load();
    for (const s of latest) if (pending.some((p) => p.id === s.id)) s.uploaded = true;
    store(latest);
  } catch { /* offline; try again later */ }
}

// Errors land in the current session, or a small one of their own.
function logError(msg, stack) {
  if (current) return event('error', { msg: String(msg).slice(0, 500), stack: String(stack ?? '').slice(0, 2000) });
  if (!loggingEnabled()) return;
  const sessions = load();
  sessions.push({ v: 1, id: 'e' + Date.now().toString(36), kind: 'error', started: new Date().toISOString(), app: { built: document.lastModified, ua: navigator.userAgent }, events: [[0, 'error', { msg: String(msg).slice(0, 500), stack: String(stack ?? '').slice(0, 2000) }]] });
  store(sessions);
}
addEventListener('error', (e) => logError(e.message, e.error?.stack));
addEventListener('unhandledrejection', (e) => logError(e.reason?.message ?? e.reason, e.reason?.stack));
document.addEventListener('visibilitychange', () => event('visibility', { state: document.visibilityState, ctx: engine.ctx?.state }));
upload();
