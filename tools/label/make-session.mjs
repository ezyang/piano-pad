// Label one whole session: every moment where the classic detector, the
// network or the reference heard a note becomes a step, in time order. Each
// step's clip starts just before the previous moment (shown as a grey light),
// or at most LEAD before its own, so "a key press with no light before the
// yellow one" covers the audio since the previous moment; longer stretches
// with nothing detected become "any key presses in this stretch?" steps.
//   node tools/label/make-session.mjs <out dir> <session .mp4>
// Writes <out>/clips/*.wav and <out>/manifest.json (steps in order, `seq`).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PianoDetector } from '../../src/detector.js';
import { decode } from '../oracle.mjs';
import { profileOptions } from '../profile.mjs';

const [out, file] = process.argv.slice(2);
const SR = 48000, NEAR = 0.07, LEAD = 2.0, MINLEAD = 0.6, TAIL = 0.8, GAP = 3.0, GAIN_DB = 26;
mkdirSync(join(out, 'clips'), { recursive: true });
const x = decode(file, SR), dur = x.length / SR;
const detect = (o) => {
  const d = new PianoDetector(SR, o), got = [];
  d.onEvent = (e) => { if (e.type === 'pitch' && e.midi != null && e.clarity > 0.6 && !e.reject && !e.voice) got.push({ t: e.sample / SR, midi: e.midi }); };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  return got;
};
const rf = file.replace(/\.mp4$/, '.kong.json');
const all = [
  ...detect(profileOptions(['--classic'])).map((n) => ({ ...n, s: 'c' })),
  ...detect(profileOptions([])).map((n) => ({ ...n, s: 'n' })),
  ...(existsSync(rf) ? JSON.parse(readFileSync(rf, 'utf8')).filter((r) => r.vel >= 25).map((r) => ({ t: r.t, midi: r.midi, s: 'r' })) : []),
].sort((a, b) => a.t - b.t);
const moments = [];
for (const e of all) { const m = moments.at(-1); if (m && e.t - m.t < NEAR) m.ev.push(e); else moments.push({ t: e.t, ev: [e] }); }

const cut = (from, to, dest) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', from.toFixed(3), '-t', (to - from).toFixed(3), '-i', file, '-ac', '1', '-ar', '48000',
  '-af', `volume=${GAIN_DB}dB,alimiter=limit=0.9:attack=2:release=50`, dest]);
const steps = [];
let covered = 0, prevT = -Infinity; // audio before `covered` is covered by earlier steps
const addGaps = (until) => {
  while (until - covered > 0.3) {
    const to = Math.min(until, covered + GAP);
    steps.push({ kind: 'gap', from: covered, to });
    covered = to;
  }
};
for (const m of moments) {
  const from = Math.max(0, Math.min(m.t - MINLEAD, Math.max(m.t - LEAD, prevT - 0.3)));
  addGaps(from);
  const to = Math.min(dur, m.t + TAIL);
  steps.push({ kind: 'cand', from, to, t: m.t, cands: [...new Set(m.ev.map((e) => e.midi))], heard: Object.fromEntries(['c', 'n', 'r'].map((s) => [s, m.ev.filter((e) => e.s === s).map((e) => e.midi)])) });
  covered = Math.max(covered, m.t + 0.25); prevT = m.t;
}
addGaps(dur);

const session = file.split('/').pop().replace('.mp4', '');
const manifest = steps.map((st, i) => {
  const id = `s${String(i + 1).padStart(3, '0')}`;
  cut(st.from, st.to, join(out, 'clips', `${id}.wav`));
  const others = moments.filter((o) => o.t !== st.t && o.t >= st.from && o.t < st.to).map((o) => +(o.t - st.from).toFixed(3));
  return { id, seq: i, session, kind: st.kind, from: +st.from.toFixed(3), to: +st.to.toFixed(3), ...(st.kind === 'cand' ? { t: +st.t.toFixed(3), mark: +(st.t - st.from).toFixed(3), cands: st.cands, heard: st.heard } : { mark: null, cands: [] }), others, group: st.kind };
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${session}: ${dur.toFixed(1)} s, ${manifest.filter((s) => s.kind === 'cand').length} moments + ${manifest.filter((s) => s.kind === 'gap').length} stretch checks = ${manifest.length} steps`);
