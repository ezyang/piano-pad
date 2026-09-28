// Compare mic setups: the #/calibrate/placement and #/calibrate/mic takes
// (same passage: C D E F G, then G three times softly).
//   node tools/placement-report.mjs <calibration session .json files...>
// Per take: which input the browser used, how both detectors did (right /
// missed / extra against the passage), "thumps" (onsets whose pitch didn't
// get louder: key or action noise, not a new note), and how far notes stand
// above the room (median note level minus the 10th-percentile level).
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const SR = 48000;
const pc = (m) => ((m % 12) + 12) % 12;
function align(asked, heard) {
  const L = Array.from({ length: asked.length + 1 }, () => new Array(heard.length + 1).fill(0));
  for (let i = 1; i <= asked.length; i++) for (let j = 1; j <= heard.length; j++) L[i][j] = pc(asked[i - 1]) === pc(heard[j - 1]) ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  return L[asked.length][heard.length];
}
function run(x, opts) {
  const d = new PianoDetector(SR, opts), notes = [], pitches = [];
  d.onEvent = (e) => {
    if (e.type !== 'pitch') return;
    pitches.push(e);
    if (e.midi != null && e.clarity > 0.6 && !e.reject && !e.voice) notes.push(e.midi);
  };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  return { notes, pitches };
}

console.log('take          input                         classic r/m/x   network r/m/x   thumps/note   notes above room (dB)');
for (const f of process.argv.slice(2).sort()) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  if (s.kind !== 'calibration' || !['placement', 'mic'].includes(s.calSet)) continue;
  const audio = f.replace(/\.json$/, '.mp4');
  if (!existsSync(audio)) { console.log(`${s.calibration.padEnd(13)} (no recording yet)`); continue; }
  const x = decode(audio, SR), asked = s.song.notes.map((n) => n.p);
  const score = (o) => { const { notes, pitches } = run(x, o); const r = align(asked, notes); return { r, m: asked.length - r, x: notes.length - r, pitches }; };
  const c = score(profileOptions(['--classic'])), n = score(profileOptions([]));
  // Thumps: classic-path onsets whose pitch didn't rise (or had no clear pitch).
  const thumps = c.pitches.filter((e) => e.midi == null || e.clarity <= 0.6 || (e.toneRise ?? 99) < 6).length;
  // Level in 40 ms blocks: notes (top 20% of blocks) vs room (10th percentile).
  const lv = []; for (let i = 0; i + 1920 <= x.length; i += 1920) { let e = 0; for (let k = i; k < i + 1920; k++) e += x[k] * x[k]; lv.push(10 * Math.log10(e / 1920 + 1e-12)); }
  lv.sort((a, b) => a - b);
  const room = lv[Math.floor(0.1 * lv.length)], notesLv = lv[Math.floor(0.9 * lv.length)];
  console.log(`${s.calibration.padEnd(13)} ${(s.audio?.track?.label ?? '?').slice(0, 28).padEnd(29)} ${`${c.r}/${c.m}/${c.x}`.padEnd(15)} ${`${n.r}/${n.m}/${n.x}`.padEnd(15)} ${(thumps / asked.length).toFixed(2).padEnd(13)} ${(notesLv - room).toFixed(0)} (notes ${notesLv.toFixed(0)}, room ${room.toFixed(0)})`);
}
