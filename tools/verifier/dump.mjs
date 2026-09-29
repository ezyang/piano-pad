// Candidate notes for the verifier: run the detector over recordings with
// permissive proposals (the network's weak any-key onsets too) and save
// every candidate it read a pitch for, with the verifier's input.
//   node tools/verifier/dump.mjs <out dir> <rec.mp4 ...>   (env VPOST=ms: vPostMs)
// Writes <out>/<id>.json (candidates, in order) and <out>/<id>.f32 (each
// candidate's channels x frames, then its scalars).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PianoDetector } from '../../src/detector.js';
import { decode } from '../oracle.mjs';
import { profileOptions } from '../profile.mjs';

const [out, ...files] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SR = 48000;
for (const f of files) {
  const id = basename(f, '.mp4');
  if (existsSync(join(out, `${id}.json`))) continue;
  const x = decode(f, SR);
  const d = new PianoDetector(SR, { ...profileOptions([]), netAgg: 'both', netAnyThr: 0.5, ...(process.env.VPOST ? { vPostMs: +process.env.VPOST } : {}) });
  const meta = [], feats = [];
  d.onEvent = () => {};
  d.onCandidate = (c) => {
    const { x: fx, s, ...m } = c;
    meta.push({ ...m, t: +(c.onset / SR).toFixed(4), f0: +c.f0.toFixed(2), clarity: +c.clarity.toFixed(3), level: Math.round(c.level), toneRise: Math.round(c.toneRise), ...(c.jump !== undefined ? { jump: Math.round(c.jump) } : {}), C: fx.length, S: s.length });
    feats.push(fx, s);
  };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  const n = feats.reduce((a, v) => a + v.length, 0), buf = new Float32Array(n);
  let o = 0;
  for (const v of feats) { buf.set(v, o); o += v.length; }
  writeFileSync(join(out, `${id}.f32`), Buffer.from(buf.buffer));
  writeFileSync(join(out, `${id}.json`), JSON.stringify({ id, file: f, dur: x.length / SR, cands: meta }));
  console.log(`${id}: ${meta.length} candidates`);
}
