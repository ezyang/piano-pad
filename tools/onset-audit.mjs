// Compare the real-time detector with the offline oracle on recordings.
//   node tools/onset-audit.mjs rec1.mp4 rec2.mp4 ... [--opt key=value ...] [--list]
// Oracle-only attacks are likely misses; detector-only ones are likely false
// or double triggers. Neither side is ground truth; look at patterns.
import { PianoDetector } from '../src/detector.js';
import { oracleNotes, decode } from './oracle.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Oracle results are slow to compute; cache them next to the recordings.
function cachedOracle(file, x) {
  const c = file.replace(/\.[a-z0-9]+$/, '.oracle.json');
  if (existsSync(c)) return JSON.parse(readFileSync(c, 'utf8'));
  const notes = oracleNotes(x, SR);
  writeFileSync(c, JSON.stringify(notes));
  return notes;
}

const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--opt');
const opts = {};
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? v : +v; } });
const SR = 48000, TOL = 0.07;
// Oracle attacks below this are mostly speech (adult and child voices sit
// around C3-A3 and below); --min=<midi> changes it.
const MIN_MIDI = +(args.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 57);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => (m == null ? '?' : NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1));


const tally = { oracle: 0, det: 0, both: 0, letterAgree: 0, oracleOnly: 0, detOnly: 0, detOnlyDouble: 0 };
const missReasons = {}, examples = [];
for (const f of files) {
  const x = decode(f, SR);
  const det = new PianoDetector(SR, { ...opts, debug: true });
  const frames = [], found = [];
  det.onEvent = (e) => {
    if (e.type === 'frame') frames.push(e);
    else if (e.type === 'onset') found.push({ time: e.sample / SR });
    else if (e.type === 'pitch') { const o = found.find((q) => Math.abs(q.time - e.sample / SR) < 1e-6); if (o) Object.assign(o, { midi: e.reject ? null : e.midi, clarity: e.clarity, reject: e.reject }); }
  };
  for (let i = 0; i < x.length; i += 128) det.process(x.subarray(i, i + 128));
  const live = found.filter((n) => n.midi != null && n.clarity > 0.6 && n.midi >= MIN_MIDI);
  const orc = cachedOracle(f, x).filter((n) => n.midi >= MIN_MIDI); // below: mostly speech
  tally.oracle += orc.length; tally.det += live.length;
  const used = new Set();
  for (const o of orc) {
    const j = live.findIndex((l, k) => !used.has(k) && Math.abs(l.time - o.time) < TOL);
    if (j >= 0) { used.add(j); tally.both++; if (live[j].midi % 12 === o.midi % 12) tally.letterAgree++; continue; }
    tally.oracleOnly++;
    // Why didn't the detector fire? Closest approach to its thresholds near here.
    const near = frames.filter((fr) => Math.abs(fr.sample / SR - o.time) < 0.04);
    const fluxR = Math.max(...near.map((fr) => fr.flux / fr.thr)), riseR = Math.max(...near.map((fr) => fr.rise / fr.rThr));
    const gate = Math.max(...near.map((fr) => fr.db - fr.floorDb - 10));
    const prevDet = found.filter((n) => n.time < o.time - TOL).pop();
    const sincePrev = prevDet ? o.time - prevDet.time : Infinity;
    const anyOnset = found.some((n) => Math.abs(n.time - o.time) < TOL); // onset but pitch rejected
    const reason = anyOnset ? 'onset, pitch rejected' : sincePrev < 0.13 ? 'within 130ms of a detected note' : gate < 0 ? 'below noise gate' : `thresholds (flux ${fluxR.toFixed(2)}, rise ${riseR.toFixed(2)} of needed)`;
    const key = reason.startsWith('thresholds') ? (Math.max(fluxR, riseR) > 0.7 ? 'thresholds: near miss (>70%)' : 'thresholds: far below') : reason;
    missReasons[key] = (missReasons[key] ?? 0) + 1;
    examples.push({ file: f.split('/').pop(), t: o.time.toFixed(2), what: 'MISS', note: nm(o.midi), strength: o.strength.toFixed(1), level: o.level.toFixed(0), reason });
  }
  live.forEach((l, k) => {
    if (used.has(k)) return;
    tally.detOnly++;
    const prev = live.filter((q) => q.time < l.time).pop();
    const dbl = prev && l.time - prev.time < 0.15;
    if (dbl) tally.detOnlyDouble++;
    examples.push({ file: f.split('/').pop(), t: l.time.toFixed(2), what: 'EXTRA', note: nm(l.midi), clarity: l.clarity.toFixed(2), reason: dbl ? `${Math.round(1000 * (l.time - prev.time))}ms after ${nm(prev.midi)}` : '' });
  });
}
const pct = (a, b) => `${Math.round((100 * a) / Math.max(1, b))}%`;
console.log(`oracle attacks ${tally.oracle}, detector notes ${tally.det}, matched ${tally.both} (letters agree ${pct(tally.letterAgree, tally.both)})`);
console.log(`detector recall vs oracle ${pct(tally.both, tally.oracle)}; oracle-only (likely misses) ${tally.oracleOnly}; detector-only ${tally.detOnly} (of which within 150 ms of another: ${tally.detOnlyDouble})`);
// Recall by loudness band (oracle's level above the room's noise).
const bands = {};
for (const e of examples) if (e.what === 'MISS') { const b = Math.min(50, Math.floor(e.level / 10) * 10); bands[b] = bands[b] ?? { miss: 0 }; bands[b].miss++; }
console.log('misses by loudness (dB above noise):', Object.entries(bands).map(([b, v]) => `${b}-${+b + 10}: ${v.miss}`).join(' | '));
console.log('why misses:', Object.entries(missReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' | '));
if (args.includes('--list')) for (const e of examples) console.log(' ', e.file, e.t, e.what, e.note, e.strength ? `strength ${e.strength} level ${e.level}dB` : `clarity ${e.clarity}`, e.reason);
