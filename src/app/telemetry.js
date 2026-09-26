// Practice logs, for debugging and tuning. Each practice run (or "play to
// write" take) is recorded as a session: what was expected, everything the
// detector reported (including rejected pitches and why a pitch was chosen),
// how each note was judged, mic level once a second, simulated key presses,
// and errors. Sessions are kept on the device, shared as a JSON file from the
// ⚙︎ menu, and uploaded to the home log server (server/logsrv.py) when the
// device is on the home network.
//
// Audio is recorded only when the grown-ups turn it on (⚙︎ menu): the raw mic
// stream the detector hears, for the length of a run, kept in IndexedDB
// until it reaches the home server. Nothing identifies the player beyond song
// titles.
import { engine } from './engine.js';
import { getState } from './store.js';

const KEY = 'pianopad.logs';
const MAX_BYTES = 1_500_000; // localStorage is ~5 MB on Safari; leave room for songs
// Home LAN only. localStorage 'pianopad.uploadUrl' overrides it (development).
export const UPLOAD_URL = (() => { try { return localStorage.getItem('pianopad.uploadUrl'); } catch { return null; } })() ?? 'https://logs.cranbury.ezyang.com';
const MAX_AUDIO_BYTES = 150e6; // recordings waiting to upload
// "<sha> <commit date>", stamped into index.html by tools/build-site.mjs;
// absent when served straight from a checkout.
export const VERSION = document.querySelector('meta[name="piano-version"]')?.content ?? 'dev';

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

// The fields every session starts with.
export function sessionHeader(kind, id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) {
  return {
    v: 1,
    id,
    kind,
    started: new Date().toISOString(),
    app: {
      version: VERSION,
      path: location.pathname, // /v/<sha>/ when she's on an old version
      built: document.lastModified,
      ua: navigator.userAgent,
      screen: [innerWidth, innerHeight, devicePixelRatio],
      standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    },
  };
}

// Store (or replace, by id) a session that isn't recorded through
// startSession, e.g. the adventure's step log, and send it again.
export function record(session) {
  if (!loggingEnabled()) return;
  session.rev = (session.rev ?? 0) + 1; // so an upload in flight doesn't mark this copy as sent
  const sessions = load().filter((s) => s.id !== session.id);
  sessions.push({ ...session, uploaded: false });
  store(sessions);
  upload();
}

// kind: 'practice' | 'write' | ... info: song and mode details.
export function startSession(kind, info) {
  if (current) endSession({ aborted: true });
  if (!loggingEnabled()) return;
  const ctx = engine.ctx;
  current = {
    ...sessionHeader(kind),
    t0: performance.now(),
    ctxT0: ctx?.currentTime ?? 0,
    audio: ctx ? { sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency } : null,
    settings: { labels: getState().labels ?? (getState().showLetters === false ? 'none' : 'letters'), strictOctave: getState().strictOctave !== false, testKeyboard: !!getState().testKeyboard, detector: getState().detector ?? 'simple' },
    ...info,
    events: [],
  };
  engine.takeLevelStats();
  unsubs.push(engine.onRaw((e) => {
    // Audio-clock times, relative to the session's start on that clock.
    const t = (x) => Math.round((x - current.ctxT0) * 1000);
    if (e.type === 'mic-restart') event('mic-restart');
    else if (e.type === 'onset') event('onset', { at: t(e.time), seen: t(e.detectedTime), flux: +e.flux.toFixed(1) });
    else if (e.type === 'pitch') {
      event('pitch', {
        at: t(e.time), seen: t(e.detectedTime), midi: e.midi, f0: e.f0 ? +e.f0.toFixed(1) : 0,
        clarity: +(e.clarity ?? 0).toFixed(2), ok: e.accepted, ...(e.method ? { method: e.method } : {}), ...(e.why ? { why: e.why } : {}), ...(e.voice !== undefined ? { voice: e.voice } : {}),
      });
    }
  }));
  if (getState().recordAudio !== false && engine.stream) startAudio(current);
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
  const keep = !(result.aborted && !s.events.some((e) => e[1] === 'onset' || e[1] === 'sim'));
  stopAudio(s, keep);
  if (!keep) return;
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

// Send sessions and recordings that haven't been uploaded yet. Safe to call
// any time; away from home the server is unreachable and they wait.
let uploading = false, again = false;
export async function upload() {
  if (!UPLOAD_URL || !navigator.onLine) return;
  if (uploading) { again = true; return; }
  uploading = true;
  again = false;
  try {
    const pending = load().filter((s) => !s.uploaded);
    if (pending.length) {
      const res = await fetch(`${UPLOAD_URL}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending) });
      if (!res.ok) return;
      const latest = load();
      for (const s of latest) if (pending.some((p) => p.id === s.id && p.rev === s.rev)) s.uploaded = true;
      store(latest);
    }
    for (const [id, { blob, ext }] of await idb('entries')) {
      const res = await fetch(`${UPLOAD_URL}/audio/${id}.${ext}`, { method: 'PUT', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
      if (!res.ok) return;
      await idb('delete', id);
    }
  } catch { /* not home, or offline; try again later */ } finally {
    uploading = false;
    if (again) upload();
  }
}

// --- audio ---

let audioRec = null;

function startAudio(s) {
  if (typeof MediaRecorder === 'undefined') return;
  const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  let rec;
  try { rec = new MediaRecorder(engine.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 96000 }); } catch { return; }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstart = () => {
    // Where the recording starts on the session's audio clock (approximate;
    // detector onsets can refine the alignment).
    s.recording = { mime: rec.mimeType, startMs: Math.round(((engine.ctx?.currentTime ?? 0) - s.ctxT0) * 1000) };
  };
  rec.start(1000);
  audioRec = { rec, chunks, s };
  document.body.classList.add('rec-audio');
}

function stopAudio(s, keep) {
  if (!audioRec || audioRec.s !== s) return;
  const { rec, chunks } = audioRec;
  audioRec = null;
  document.body.classList.remove('rec-audio');
  rec.onstop = async () => {
    if (!keep || !chunks.length) return;
    const blob = new Blob(chunks, { type: rec.mimeType });
    const ext = /mp4/.test(rec.mimeType) ? 'mp4' : /ogg/.test(rec.mimeType) ? 'ogg' : 'webm';
    try {
      await idb('put', s.id, { blob, ext });
      await trimAudio();
    } catch { /* storage unavailable */ }
    upload();
  };
  try { rec.stop(); } catch { /* already stopped */ }
}

async function trimAudio() {
  const all = await idb('entries');
  let total = all.reduce((a, [, v]) => a + v.blob.size, 0);
  for (const [id, v] of all) { // keys sort oldest first (ids start with a timestamp)
    if (total <= MAX_AUDIO_BYTES) break;
    await idb('delete', id);
    total -= v.blob.size;
  }
}

// Tiny IndexedDB wrapper: idb('put', k, v) | idb('delete', k) | idb('entries').
function idb(op, key, value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('pianopad', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('audio');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('audio', op === 'entries' ? 'readonly' : 'readwrite');
      const st = tx.objectStore('audio');
      if (op === 'put') st.put(value, key);
      else if (op === 'delete') st.delete(key);
      const out = [];
      if (op === 'entries') {
        const cur = st.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } };
      }
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
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
