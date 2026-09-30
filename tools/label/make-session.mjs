// Label one whole session: every moment where the classic detector, the
// network or the reference heard a note becomes a step, in time order. A
// step's clip runs from a little before its moment (at most LEAD, never back
// into the previous clip unless that leaves less than MINLEAD) to just before
// the next moment (at least MINTAIL, at most TAIL after its own), so clips
// barely overlap and "a key press with no light in this clip" covers the
// audio once; what no clip covers becomes "any key presses here?" steps.
// (Parent, 2026-09-29: long lead-ins and hearing the next note confused.)
//   node tools/label/make-session.mjs <out dir> <session .mp4> [--carry <old label dir>]
// Writes <out>/clips/*.wav and <out>/manifest.json (steps in order, `seq`).
// --carry copies answers for the same moments (by time) from an earlier
// layout of the same session.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PianoDetector } from '../../src/detector.js';
import { decode } from '../oracle.mjs';
import { profileOptions } from '../profile.mjs';

const [out, file] = process.argv.slice(2);
const carry = process.argv.includes('--carry') ? process.argv[process.argv.indexOf('--carry') + 1] : null;
const SR = 48000, NEAR = 0.07, LEAD = 0.7, MINLEAD = 0.3, TAIL = 0.8, MINTAIL = 0.3, CUT = 0.03, GAP = 3.0, GAIN_DB = 26;
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
let covered = 0; // audio before `covered` is covered by earlier steps
const addGaps = (until) => {
  while (until - covered > 0.3) {
    const to = Math.min(until, covered + GAP);
    steps.push({ kind: 'gap', from: covered, to });
    covered = to;
  }
};
for (const [k, m] of moments.entries()) {
  const next = moments[k + 1]?.t ?? Infinity;
  const from = Math.max(0, Math.min(m.t - MINLEAD, Math.max(m.t - LEAD, covered)));
  addGaps(from);
  const to = Math.min(dur, Math.max(m.t + MINTAIL, Math.min(m.t + TAIL, next - CUT)));
  steps.push({ kind: 'cand', from, to, t: m.t, cands: [...new Set(m.ev.map((e) => e.midi))], heard: Object.fromEntries(['c', 'n', 'r'].map((s) => [s, m.ev.filter((e) => e.s === s).map((e) => e.midi)])) });
  covered = Math.max(covered, to);
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
if (carry) {
  const old = JSON.parse(readFileSync(join(carry, 'manifest.json'), 'utf8')), ans = {};
  for (const line of readFileSync(join(carry, 'labels.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(line); ans[r.id] = r; }
  const rows = [];
  for (const st of manifest.filter((x) => x.kind === 'cand')) {
    const o = old.find((x) => x.kind === 'cand' && Math.abs(x.t - st.t) < 0.005), a = o && ans[o.id];
    if (a) { const { missedBefore, ...rest } = a; rows.push({ ...rest, id: st.id, carried: o.id }); } // "+" meant something else there
  }
  writeFileSync(join(out, 'labels.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  console.log(`carried ${rows.length} answers from ${carry}`);
}
console.log(`${session}: ${dur.toFixed(1)} s, ${manifest.filter((s) => s.kind === 'cand').length} moments + ${manifest.filter((s) => s.kind === 'gap').length} stretch checks = ${manifest.length} steps`);
