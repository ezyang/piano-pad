// How often does the note the app is waiting for register when she plays it?
// For sessions that log judge events with `want` (homework, blueprints, play,
// Copy me): replay the detector, and for every strike where the detector
// itself read the expected letter clearly (either path, clarity >= 0.8, or a
// reference note of that letter), check whether a note of that letter was
// accepted. This counts the misses pedagogy cares about (the detector heard
// it and dropped it, or never heard it), independent of the reference
// transcriber's blind spots (it misses quick re-strikes).
//   node tools/expect-audit.mjs <session .json files...> [--net] [--expect] [--opt k=v] [--list]
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const files = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--opt');
const opts = profileOptions(args);
const useExpect = args.includes('--expect'); // feed the song's targets to setExpect, as the app does
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? (v.startsWith('[') ? JSON.parse(v) : v) : +v; } });
const SR = 48000;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const pc = (m) => ((m % 12) + 12) % 12;
const T = { strikes: 0, registered: 0, first: 0, firstOk: 0, accepted: 0, acceptedOther: 0 };
const byKey = {};

for (const f of files.sort()) {
  const audio = f.replace(/\.json$/, '.mp4');
  if (!existsSync(audio)) continue;
  const s = JSON.parse(readFileSync(f, 'utf8'));
  const start = s.recording?.startMs ?? 0;
  const judges = s.events.filter((e) => e[1] === 'judge' && e[2].want != null).map((e) => ({ t: (e[0] - start) / 1000, want: e[2].want, grade: e[2].grade }));
  if (!judges.length) continue;
  // The expected note at time t: the `want` of the first judge event at or after t.
  const wantAt = (t) => judges.find((j) => j.t >= t - 0.05)?.want;
  const kf = f.replace(/\.json$/, '.kong.json');
  const ref = existsSync(kf) ? JSON.parse(readFileSync(kf, 'utf8')).filter((r) => r.vel >= 40) : [];
  const x = decode(audio, SR);
  const d = new PianoDetector(SR, opts);
  const ev = [];
  d.onEvent = (e) => { if (e.type === 'pitch') ev.push(e); };
  let cur;
  for (let i = 0; i < x.length; i += 128) {
    if (useExpect) { const w = wantAt(i / SR); if (w !== cur) { cur = w; d.setExpect(w != null ? [w] : null); } }
    d.process(x.subarray(i, i + 128));
  }
  const accepted = ev.filter((e) => e.midi != null && e.clarity > (e.expected ? 0.4 : 0.6) && !e.reject && !e.voice); // as the engine
  // Strikes: clusters (60 ms) of clear readings or reference notes.
  const marks = [
    ...ev.filter((e) => e.midi != null && e.clarity >= 0.8).map((e) => ({ t: e.sample / SR, midi: e.midi })),
    ...ref.map((r) => ({ t: r.t, midi: r.midi })),
  ].sort((a, b) => a.t - b.t);
  const strikes = [];
  for (const m of marks) { const l = strikes.at(-1); if (l && m.t - l.t < 0.06) l.midis.add(m.midi); else strikes.push({ t: m.t, midis: new Set([m.midi]) }); }
  const lines = [];
  let lastWant = null;
  for (const st of strikes) {
    const want = wantAt(st.t);
    if (want == null) continue;
    const firstForStep = want !== lastWant; lastWant = want; // (approximate: consecutive same targets merge)
    const got = accepted.filter((e) => Math.abs(e.sample / SR - st.t) < 0.07);
    if (![...st.midis].some((m) => pc(m) === pc(want))) {
      T.accepted += got.length; T.acceptedOther += got.length;
      continue; // she played something else
    }
    const ok = got.some((e) => pc(e.midi) === pc(want));
    T.strikes++; if (ok) T.registered++;
    const k = (byKey[nm(want)] ??= { n: 0, ok: 0 }); k.n++; if (ok) k.ok++;
    if (firstForStep) { T.first++; if (ok) T.firstOk++; }
    if (!ok) {
      const near = ev.filter((e) => Math.abs(e.sample / SR - st.t) < 0.07);
      lines.push(`  ${st.t.toFixed(2)} want ${nm(want)}: ${near.map((e) => `${e.via ?? 'dsp'}:${e.midi != null ? nm(e.midi) : '?'} cl${e.clarity?.toFixed(2)}${e.reject ? ' ' + e.reject : ''}${e.voice ? ' voice' : ''}`).join(' | ') || 'no pitch reading'}`);
    }
  }
  if (args.includes('--list') && lines.length) console.log(`${f.split('/').pop()} ${s.kind} ${s.song?.title ?? s.blueprint ?? ''}\n${lines.join('\n')}`);
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
console.log(`expected-letter strikes: ${T.strikes}, registered ${pct(T.registered, T.strikes)} · first strike of a step: ${pct(T.firstOk, T.first)} (n=${T.first})`);
console.log(`by key: ${Object.entries(byKey).sort().map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(' · ')}`);
