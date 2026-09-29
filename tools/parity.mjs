// Replay a diagnostic capture exactly and check that the live detector
// events are reproduced (see engine.startCapture and the calibration
// screen's "Save exact audio"). A session's result.capture holds the live
// events (sample indices), the detector options, the start frame and when
// expect() took effect; <session id>.wav next to it holds the exact float32
// input the live detector processed.
//   node tools/parity.mjs <session .json files...> [--show]
// Uses the piano profile in this checkout: run it at the app version that
// made the capture (the session's app.version) for exact results.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PianoDetector, decodeNet } from '../src/detector.js';

const args = process.argv.slice(2);
const show = args.includes('--show');
const profile = JSON.parse(readFileSync(new URL('../src/piano-profile.json', import.meta.url), 'utf8'));

// Float32 mono WAV (as the calibration screen writes it).
function readWav(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.readUInt16LE(20) !== 3 || b.readUInt16LE(22) !== 1) throw new Error(`${path}: not a mono float WAV`);
  let o = 12;
  while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 4, out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = b.readFloatLE(o + 8 + 4 * k);
  return { sr: b.readUInt32LE(24), pcm: out };
}

const key = (e) => `${e[0]}@${e[1]}`;
let files = 0, exact = 0;
for (const f of args.filter((a) => a.endsWith('.json'))) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  const cap = s.result?.capture;
  if (!cap) continue;
  const wavPath = join(dirname(f), cap.file);
  if (!existsSync(wavPath)) { console.log(`${s.id}: no ${cap.file} yet`); continue; }
  const { sr, pcm } = readWav(wavPath);
  // The same options the live detector had: detector-node merges the profile
  // under the engine's options.
  const opts = { octaveDown: profile.octaveDown, tuning: profile.tuning ?? {}, templates: profile.templates, net: profile.net && decodeNet(profile.net), onsets: profile.net ? 'net' : 'dsp', debug: true, ...cap.opts };
  const d = new PianoDetector(sr, opts);
  d.pos = cap.start;
  const got = [];
  d.onEvent = (e) => {
    if (e.type !== 'onset' && e.type !== 'pitch') return;
    got.push([e.type === 'onset' ? 'o' : 'p', e.sample, e.detectedAt, e.midi ?? null, e.clarity != null ? +e.clarity.toFixed(3) : null, e.reject ?? null, e.via ?? null, e.voice ? 1 : 0, e.expected ? 1 : 0]);
  };
  const expects = [...(cap.expects ?? [])];
  for (let i = 0; i < pcm.length; i += 128) {
    const frame = cap.start + i;
    while (expects.length && expects[0].frame <= frame) d.setExpect(expects.shift().midis);
    d.process(pcm.subarray(i, i + 128));
  }
  // Events the previous detector emitted before the capture's fresh one
  // took over aren't part of the capture.
  const live = cap.events.filter((e) => e[2] >= cap.start);
  const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k] || (typeof v === 'number' && typeof b[k] === 'number' && Math.abs(v - b[k]) <= 1e-3));
  let match = 0; const diffs = [];
  const n = Math.max(live.length, got.length);
  for (let k = 0; k < n; k++) {
    if (live[k] && got[k] && same(live[k], got[k])) match++;
    else if (diffs.length < 8) diffs.push(`  #${k} live ${JSON.stringify(live[k] ?? null)}  replay ${JSON.stringify(got[k] ?? null)}`);
  }
  files++; if (match === n) exact++;
  console.log(`${s.id} ${s.calibration ?? s.kind} (${(pcm.length / sr).toFixed(1)} s, app ${String(s.app?.version ?? '?').slice(0, 7)}): live ${live.length} events, replay ${got.length}, identical ${match}/${n}${match === n ? '  EXACT' : ''}`);
  if (show || match !== n) for (const line of diffs) console.log(line);
}
console.log(`${exact}/${files} captures reproduced exactly`);
