// Re-run the detector on a recorded practice session and compare with what
// the app detected live.
//   node tools/replay.mjs <session.mp4|webm> [--overlap] [--opt key=value ...]
// Looks for <session>.json next to the audio (as the log server stores them).
// Needs ffmpeg to decode.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !a.includes('='));
if (!file) { console.error('usage: node tools/replay.mjs <audio> [--overlap] [--opt key=value]'); process.exit(1); }
const opts = { overlapAware: args.includes('--overlap') };
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? v : +v; } });

const SR = 48000;
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const audio = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => (m == null ? '?' : NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1));

// Offline detection.
const det = new PianoDetector(SR, opts);
const found = new Map();
det.onEvent = (e) => {
  if (e.type === 'onset') found.set(e.sample, { at: e.sample / SR, flux: e.flux });
  else if (e.type === 'pitch') Object.assign(found.get(e.sample) ?? {}, { midi: e.midi, clarity: e.clarity, why: e.why });
};
for (let i = 0; i < audio.length; i += 128) det.process(audio.subarray(i, i + 128));
const replay = [...found.values()].filter((n) => n.midi != null && n.clarity > 0.6);

// Live detections from the session log, shifted onto the recording's clock.
const jsonPath = file.replace(/\.[a-z0-9]+$/, '.json');
let live = [], session = null;
if (existsSync(jsonPath)) {
  session = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const start = session.recording?.startMs ?? 0;
  live = session.events.filter((e) => e[1] === 'pitch' && e[2].ok).map((e) => ({ at: (e[2].at - start) / 1000, midi: e[2].midi }));
  const want = (session.song?.notes ?? []).filter((n) => n.p != null).map((n) => nm(n.p));
  console.log(`session ${session.id} · ${session.song?.title} · ${session.mode} · detector ${session.settings?.detector ?? 'simple'} · result ${JSON.stringify(session.result)}`);
  console.log(`song: ${want.join(' ')}`);
}
console.log(`audio ${(audio.length / SR).toFixed(1)}s · replay detector ${JSON.stringify(opts)}`);
console.log(`live ${live.length} notes: ${live.map((n) => nm(n.midi)).join(' ')}`);
console.log(`replay ${replay.length} notes: ${replay.map((n) => nm(n.midi)).join(' ')}`);
console.log();
// Side by side, matched by time (within 60 ms).
const rows = [];
const used = new Set();
for (const r of replay) {
  const j = live.findIndex((l, k) => !used.has(k) && Math.abs(l.at - r.at) < 0.06);
  if (j >= 0) used.add(j);
  rows.push({ at: r.at, replay: r, live: j >= 0 ? live[j] : null });
}
live.forEach((l, k) => { if (!used.has(k)) rows.push({ at: l.at, replay: null, live: l }); });
rows.sort((a, b) => a.at - b.at);
for (const { at, replay: r, live: l } of rows) {
  const flag = !r || !l ? '  <- only ' + (r ? 'replay' : 'live') : r.midi % 12 !== l.midi % 12 ? '  <- differ' : '';
  console.log(at.toFixed(3).padStart(8), (l ? nm(l.midi) : '-').padEnd(5), (r ? nm(r.midi) : '-').padEnd(5),
    r ? `clarity ${r.clarity.toFixed(2)}` : '', r?.why ? `why r1=${nm(r.why.r1)} old=${r.why.old != null ? nm(r.why.old) : '-'} sp=${r.why.sp != null ? nm(r.why.sp) : '-'}` : '', flag);
}
