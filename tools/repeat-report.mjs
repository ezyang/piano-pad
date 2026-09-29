// Onset recall by loudness and onset timing, against Kong's onsets (the
// reference transcription), for takes of repeated notes (e.g. the G piece).
// Kong's velocity stands in for how hard a key was struck.
//   node tools/repeat-report.mjs <rec.mp4 ...> [--letter G] [--from s] [--to s] [--verified] [--classic] [--opt k=v]
// Per recording: Kong strikes of the letter, how many the detector caught
// (same letter within 60 ms), by velocity (soft < 50 <= medium < 70 <= loud),
// the detector's onset minus Kong's (median, 90th percentile of |error|),
// the error in each inter-onset interval, and notes the detector added
// (not within 60 ms of any Kong strike).
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const letter = opt('--letter'), pcWant = letter ? NAMES.indexOf(letter) : null;
const from = +(opt('--from') ?? 0), to = +(opt('--to') ?? 1e9);
const files = args.filter((a) => a.endsWith('.mp4'));
const opts = profileOptions(args);
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? (v.startsWith('[') ? JSON.parse(v) : v) : +v; } });
const SR = 48000, TOL = 0.06;
const bins = (v) => (v < 50 ? 'soft' : v < 70 ? 'medium' : 'loud');
const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN);
const T = { soft: [0, 0], medium: [0, 0], loud: [0, 0], err: [], ioi: [], extra: 0, dur: 0 };
for (const f of files) {
  const kf = f.replace(/\.mp4$/, '.kong.json');
  if (!existsSync(kf)) { console.log(`${f}: no Kong labels`); continue; }
  const inWin = (t) => t >= from && t <= to;
  const kong = JSON.parse(readFileSync(kf, 'utf8')).filter((r) => r.vel >= 20 && inWin(r.t) && (pcWant == null || r.midi % 12 === pcWant)).sort((a, b) => a.t - b.t);
  const allKong = JSON.parse(readFileSync(kf, 'utf8')).filter((r) => r.vel >= 20);
  // Kong sometimes lists a strike twice (a key and its octave): one strike per 60 ms.
  const strikes = kong.filter((r, i) => !kong.slice(0, i).some((p) => r.t - p.t < TOL));
  const x = decode(f, SR), d = new PianoDetector(SR, opts), notes = [];
  d.onEvent = (e) => { if (e.type === 'pitch' && e.midi != null && e.clarity > 0.6 && !e.reject && !e.voice && inWin(e.sample / SR)) notes.push({ t: e.sample / SR, midi: e.midi }); };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  const used = new Set(), hits = [];
  const row = { soft: [0, 0], medium: [0, 0], loud: [0, 0] };
  for (const s of strikes) {
    const b = bins(s.vel); row[b][1]++; T[b][1]++;
    const n = notes.find((n, i) => !used.has(i) && Math.abs(n.t - s.t) < TOL && n.midi % 12 === s.midi % 12);
    if (n) { used.add(notes.indexOf(n)); row[b][0]++; T[b][0]++; hits.push({ k: s.t, d: n.t }); T.err.push(n.t - s.t); }
  }
  for (let i = 1; i < hits.length; i++) T.ioi.push((hits[i].d - hits[i - 1].d) - (hits[i].k - hits[i - 1].k));
  const extra = notes.filter((n, i) => !used.has(i) && !allKong.some((r) => Math.abs(r.t - n.t) < TOL)).length;
  T.extra += extra; T.dur += Math.min(x.length / SR, to) - from;
  const fmt = (r) => `${r[0]}/${r[1]}`;
  console.log(`${f.split('/').pop().slice(0, 13)}: strikes ${strikes.length}, caught soft ${fmt(row.soft)} medium ${fmt(row.medium)} loud ${fmt(row.loud)}, notes with no Kong strike near ${extra}`);
}
const ms = (v) => (1000 * v).toFixed(0);
console.log(`TOTAL caught: soft ${T.soft[0]}/${T.soft[1]}, medium ${T.medium[0]}/${T.medium[1]}, loud ${T.loud[0]}/${T.loud[1]}; notes with no Kong strike near: ${T.extra} (${(T.extra / Math.max(1, T.dur) * 60).toFixed(1)}/min)`);
console.log(`onset minus Kong: median ${ms(q(T.err, 0.5))} ms, |error| 90% ${ms(q(T.err.map(Math.abs), 0.9))} ms; inter-onset interval error |90%| ${ms(q(T.ioi.map(Math.abs), 0.9))} ms, worst ${ms(Math.max(0, ...T.ioi.map(Math.abs)))} ms (n ${T.ioi.length})`);
