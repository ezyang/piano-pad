// Pick the moments in her real sessions where the detectors and the reference
// disagree, and cut short clips for the parent to label (tools/label/).
//   node tools/label/make-clips.mjs <out dir> <session .mp4 files...> [--n=60]
//        [--groups=net-miss:8,classic-miss:8,...] [--skip=<earlier manifest>] [--prefix=c]
// Four groups, interleaved so an early stop still covers all of them:
//   classic-only  the classic detector accepted a note, network and reference didn't
//   net-only      the network (with its classic fallback) accepted one, the others didn't
//   ref-only      the reference transcribed a note (vel >= 40), neither detector did
//   pitch         two or more of them heard a note, with different letters
//   net-miss      classic and reference agree, the network heard nothing
//   classic-miss  network and reference agree, classic heard nothing
//   ref-miss      both detectors agree, the reference heard nothing
// Writes <out>/clips/<id>.wav (1.5 s: 0.6 s before the moment, 0.9 s after)
// and <out>/manifest.json. Labels never go in git.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PianoDetector } from '../../src/detector.js';
import { decode } from '../oracle.mjs';
import { profileOptions } from '../profile.mjs';

const args = process.argv.slice(2);
const [out, ...rest] = args.filter((a) => !a.startsWith('--'));
const N = +(args.find((a) => a.startsWith('--n='))?.split('=')[1] ?? 60);
const prefix = args.find((a) => a.startsWith('--prefix='))?.split('=')[1] ?? 'c';
const SR = 48000, PRE = 0.6, POST = 0.9, NEAR = 0.07;
mkdirSync(join(out, 'clips'), { recursive: true });

// Deterministic shuffle so reruns pick the same clips.
let seed = 12345;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const detect = (x, o) => {
  const d = new PianoDetector(SR, o), got = [];
  d.onEvent = (e) => { if (e.type === 'pitch' && e.midi != null && e.clarity > 0.6 && !e.reject && !e.voice) got.push({ t: e.sample / SR, midi: e.midi }); };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  return got;
};
// Every note any source heard in a recording, merged into moments within 70 ms.
function momentsOf(f) {
  const rf = f.replace(/\.mp4$/, '.kong.json');
  const x = decode(f, SR);
  const classic = detect(x, profileOptions([]));
  const net = detect(x, { ...profileOptions(['--net']), dspFallbackClarity: 0.85, dspFallbackWaitMs: 100 });
  const ref = existsSync(rf) ? JSON.parse(readFileSync(rf, 'utf8')).filter((r) => r.vel >= 40).map((r) => ({ t: r.t, midi: r.midi })) : [];
  const all = [...classic.map((n) => ({ ...n, s: 'c' })), ...net.map((n) => ({ ...n, s: 'n' })), ...ref.map((n) => ({ ...n, s: 'r' }))].sort((a, b) => a.t - b.t);
  const moments = [];
  for (const e of all) { const m = moments.at(-1); if (m && e.t - m.t0 < NEAR) m.ev.push(e); else moments.push({ t0: e.t, ev: [e] }); }
  return { x, moments };
}
// --groups=name:count,... (default: the four below, N/4 each). --skip=<manifest>:
// leave out moments already in an earlier batch.
const spec = (args.find((a) => a.startsWith('--groups='))?.split('=')[1] ?? 'classic-only,net-only,ref-only,pitch').split(',').map((g) => g.split(':'));
const want = Object.fromEntries(spec.map(([g, n]) => [g, n ? +n : Math.ceil(N / spec.length)]));
const skipArg = args.find((a) => a.startsWith('--skip='));
const skip = skipArg ? JSON.parse(readFileSync(skipArg.split('=')[1], 'utf8')).map((c) => `${c.session}@${c.t}`) : [];
const groups = Object.fromEntries(Object.keys(want).map((g) => [g, []]));
for (const f of rest) {
  if (!existsSync(f.replace(/\.mp4$/, '.kong.json'))) continue;
  const { x, moments } = momentsOf(f);
  for (const m of moments) {
    const t = m.ev.find((e) => e.s === 'c')?.t ?? m.ev.find((e) => e.s === 'n')?.t ?? m.t0;
    if (t < PRE || t + POST > x.length / SR) continue;
    const has = (s) => m.ev.some((e) => e.s === s);
    const letters = new Set(m.ev.map((e) => e.midi % 12));
    const cands = [...new Set(m.ev.map((e) => e.midi))];
    // Other sounds in the same clip window, so the page can show them too.
    // (A note that started just before the clip shows at its very start.)
    const others = moments.filter((o) => o !== m && o.t0 > t - PRE - 0.3 && o.t0 < t + POST).map((o) => +Math.max(0, o.t0 - (t - PRE)).toFixed(3));
    const item = { session: f.split('/').pop().replace('.mp4', ''), file: f, t, cands, others, heard: Object.fromEntries(['c', 'n', 'r'].map((s) => [s, m.ev.filter((e) => e.s === s).map((e) => e.midi)])) };
    if (skip.includes(`${item.session}@${+t.toFixed(3)}`)) continue;
    // Which sources heard a note here, and did they agree on the letter?
    const who = ['c', 'n', 'r'].filter(has).join('');
    const g = letters.size > 1 ? 'pitch'
      : { c: 'classic-only', n: 'net-only', r: 'ref-only', cr: 'net-miss', nr: 'classic-miss', cn: 'ref-miss' }[who];
    groups[g]?.push(item);
  }
}
for (const g of Object.values(groups)) shuffle(g);
// Interleave the groups, spreading each across sessions.
const picked = [];
for (let i = 0; Object.entries(groups).some(([name, g]) => g.length > i && i < want[name]); i++) {
  for (const [name, g] of Object.entries(groups)) if (g[i] && i < want[name]) picked.push({ ...g[i], group: name });
}
// Cut a clip, turned up by the SAME amount for every clip (the iPad mic hears
// the piano quietly), so relative loudness still tells a faint background
// sound from a real strike; a limiter keeps loud notes from distorting.
const GAIN_DB = 26;
export function cut(file, t, dest) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', (t - PRE).toFixed(3), '-t', (PRE + POST).toFixed(3), '-i', file, '-ac', '1', '-ar', '48000',
    '-af', `volume=${GAIN_DB}dB,alimiter=limit=0.9:attack=2:release=50`, dest]);
  return GAIN_DB;
}
const manifest = picked.map((p, i) => {
  const id = `${prefix}${String(i + 1).padStart(3, '0')}`;
  p.gain = cut(p.file, p.t, join(out, 'clips', `${id}.wav`));
  return { id, session: p.session, t: +p.t.toFixed(3), mark: PRE, others: p.others, gain: p.gain, cands: shuffle([...p.cands]), group: p.group, heard: p.heard };
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
// Reference examples with known answers (from the labeled calibration takes).
const exArg = args.find((a) => a.startsWith('--examples='));
if (exArg) {
  mkdirSync(join(out, 'examples'), { recursive: true });
  const ex = JSON.parse(readFileSync(exArg.split('=')[1], 'utf8')).map((e, i) => {
    const id = `e${i + 1}`;
    const others = momentsOf(e.file).moments.filter((o) => Math.abs(o.t0 - e.t) >= NEAR && o.t0 > e.t - PRE - 0.3 && o.t0 < e.t + POST).map((o) => +Math.max(0, o.t0 - (e.t - PRE)).toFixed(3));
    return { id, title: e.title, answer: e.answer, mark: PRE, others, gain: cut(e.file, e.t, join(out, 'examples', `${id}.wav`)) };
  });
  writeFileSync(join(out, 'examples.json'), JSON.stringify(ex, null, 1));
}
console.log(`${manifest.length} clips; available per group: ${Object.entries(groups).map(([k, g]) => `${k} ${g.length}`).join(', ')}`);
