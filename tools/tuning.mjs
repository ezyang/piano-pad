// Per-key tuning as the detector hears it: for each reference note (Kong)
// matched by a detector note, the detector's pitch reading in cents from the
// reference key. The detector decides at the attack (~25 ms), where a piano
// reads sharper than its steady pitch, so this is what rounding should use.
//   node tools/tuning.mjs rec1.mp4 ... [--by-day] [--json]
// --json prints {midi: cents} for keys with enough readings (for the profile's
// "tuning"), measured with no tuning applied.
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const SR = 48000, MIN_N = 5;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const opts = { ...profileOptions(args), tuning: {} };
const by = new Map(); // key -> day -> cents[]
for (const f of files) {
  const rf = f.replace(/\.[a-z0-9]+$/, '.kong.json');
  if (!existsSync(rf)) continue;
  const ref = JSON.parse(readFileSync(rf, 'utf8'));
  const day = f.match(/\d{4}-\d\d-\d\d/)?.[0] ?? '?';
  const x = decode(f, SR);
  const d = new PianoDetector(SR, opts);
  d.onEvent = (e) => {
    if (e.type !== 'pitch' || e.midi == null || !(e.clarity > 0.8) || e.reject || !(e.f0 > 0) || e.method === 'spectral') return;
    const t = e.sample / SR, near = ref.filter((r) => Math.abs(r.t - t) < 0.05 && r.vel >= 40);
    if (!near.length) return;
    const main = near.reduce((a, b) => (b.vel > a.vel ? b : a)).midi;
    const cents = 1200 * Math.log2(e.f0 / (440 * 2 ** ((main - 69) / 12)));
    if (Math.abs(cents) > 150) return; // an octave or other gross error, not tuning
    const k = by.get(main) ?? new Map(); by.set(main, k);
    (k.get(day) ?? k.set(day, []).get(day)).push(cents);
  };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
}
const q = (v, f) => { v = [...v].sort((a, b) => a - b); return v[Math.floor(f * (v.length - 1))]; };
const out = {};
for (const key of [...by.keys()].sort((a, b) => a - b)) {
  const days = by.get(key), all = [...days.values()].flat();
  if (all.length < MIN_N) continue;
  const recent = days.get([...days.keys()].sort().at(-1));
  out[key] = Math.round(q(recent.length >= MIN_N ? recent : all, 0.5));
  if (args.includes('--json')) continue;
  const rows = args.includes('--by-day') ? [...days].sort() : [['all', all]];
  for (const [day, v] of rows) console.log(nm(key).padEnd(4), day.padEnd(10), `n ${String(v.length).padStart(3)}  median ${String(Math.round(q(v, 0.5))).padStart(4)}  p10 ${String(Math.round(q(v, 0.1))).padStart(4)}  p90 ${String(Math.round(q(v, 0.9))).padStart(4)}`);
}
if (args.includes('--json')) console.log(JSON.stringify(out));
