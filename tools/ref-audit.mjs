// Score the real-time detector against a neural reference transcription
// (tools/nn/kong.py writes <rec>.kong.json beside each recording).
//   node tools/ref-audit.mjs rec1.mp4 ... [--ref=kong] [--opt key=value ...] [--templates=profile.json]
//                            [--no-profile | --classic | --profile-onsets] [--list] [--confusion] [--min=57]
// The reference isn't ground truth either: on the iPad mic it adds quiet
// overtone "ghost" notes, and it transcribes some speech. So reference notes
// are grouped into attacks (onsets within 40 ms), and an attack counts when
// its loudest note is at least --vel (default 30) and at or above --min.
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--opt');
const opts = profileOptions(args);
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? v : +v; } });
const flag = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : def; };
if (flag('templates')) opts.templates = JSON.parse(readFileSync(flag('templates'), 'utf8'));
const REF = flag('ref', 'kong'), MIN = +flag('min', 57), VEL = +flag('vel', 30), TOL = 0.07;
const list = args.includes('--list');
const SR = 48000;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => (m == null ? '?' : NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1));
const pc = (m) => ((m % 12) + 12) % 12;

// Reference notes -> attacks: {t, main (loudest note), notes, vel}.
function attacks(ref) {
  const out = [];
  for (const n of [...ref].sort((a, b) => a.t - b.t)) {
    const last = out[out.length - 1];
    if (last && n.t - last.t < 0.04) last.notes.push(n);
    else out.push({ t: n.t, notes: [n] });
  }
  for (const a of out) {
    a.main = a.notes.reduce((x, y) => (y.vel > x.vel || (y.vel === x.vel && y.midi < x.midi) ? y : x)).midi;
    a.vel = Math.max(...a.notes.map((n) => n.vel));
  }
  return out;
}

export function detect(x, o = {}) {
  const det = new PianoDetector(SR, o);
  const notes = [];
  det.onEvent = (e) => {
    if (e.type === 'pitch' && e.midi != null && e.clarity > 0.6 && !e.reject) notes.push({ t: e.sample / SR, midi: e.midi, voice: !!e.voice });
  };
  for (let i = 0; i < x.length; i += 128) det.process(x.subarray(i, i + 128));
  return notes;
}

const bands = [[VEL, 50], [50, 70], [70, 128]];
const conf = new Map(); // 'ref->det' for matched attacks where the note differs
const T = { ref: 0, hit: 0, letter: 0, exact: 0, det: 0, detMatched: 0, detLow: 0, voice: 0, band: bands.map(() => ({ n: 0, hit: 0 })) };
for (const f of files) {
  const rf = f.replace(/\.[a-z0-9]+$/, `.${REF}.json`);
  if (!existsSync(rf)) { console.error(`no reference for ${f}`); continue; }
  const all = attacks(JSON.parse(readFileSync(rf, 'utf8')));
  const want = all.filter((a) => a.vel >= VEL && a.main >= MIN);
  const got = detect(decode(f, SR), opts).filter((n) => !n.voice);
  const used = new Set();
  const rows = [];
  for (const a of want) {
    let best = -1;
    got.forEach((n, j) => { if (!used.has(j) && Math.abs(n.t - a.t) < TOL && (best < 0 || Math.abs(n.t - a.t) < Math.abs(got[best].t - a.t))) best = j; });
    const bi = bands.findIndex(([lo, hi]) => a.vel >= lo && a.vel < hi);
    T.ref++; T.band[bi].n++;
    if (best >= 0) {
      used.add(best);
      const n = got[best];
      T.hit++; T.band[bi].hit++;
      if (a.notes.some((r) => pc(r.midi) === pc(n.midi))) T.letter++;
      if (n.midi === a.main) T.exact++;
      else { const k = `${nm(a.main)}->${nm(n.midi)}`; conf.set(k, (conf.get(k) ?? 0) + 1); }
      rows.push([a.t, `${nm(a.main)} v${a.vel}`, nm(n.midi), a.notes.some((r) => pc(r.midi) === pc(n.midi)) ? '' : '  <- differ']);
    } else rows.push([a.t, `${nm(a.main)} v${a.vel}`, '-', '  <- missed']);
  }
  // Detector notes with no reference attack anywhere near (any velocity/range).
  got.forEach((n, j) => {
    T.det++;
    if (n.midi < MIN) { T.detLow++; return; }
    const near = all.some((a) => Math.abs(a.t - n.t) < TOL);
    if (near) T.detMatched++;
    else if (!used.has(j)) rows.push([n.t, '-', nm(n.midi), '  <- extra']);
  });
  if (list) {
    console.log(`\n${f.split('/').pop()}`);
    for (const [t, r, d, why] of rows.sort((a, b) => a[0] - b[0])) console.log(t.toFixed(2).padStart(7), r.padEnd(9), d.padEnd(5), why);
  }
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
console.log(`reference attacks (vel>=${VEL}, >=${nm(MIN)}): ${T.ref}`);
console.log(`  detected ${pct(T.hit, T.ref)} · right letter ${pct(T.letter, T.hit)} of those · exact note ${pct(T.exact, T.hit)}`);
console.log(`  by loudness: ${bands.map(([lo, hi], i) => `v${lo}-${hi - 1} ${pct(T.band[i].hit, T.band[i].n)} (n=${T.band[i].n})`).join(' · ')}`);
const inRange = T.det - T.detLow;
console.log(`detector notes >=${nm(MIN)}: ${inRange} · with a reference attack within ${TOL * 1000} ms: ${pct(T.detMatched, inRange)} · extras ${inRange - T.detMatched}`);
if (args.includes('--confusion')) {
  console.log('most common wrong notes (reference -> detector):');
  for (const [k, v] of [...conf].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k.padEnd(10)} ${v}`);
}
