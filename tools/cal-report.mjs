// Calibration takes: what was asked vs what the app heard live vs a replay
// of today's detector vs the reference transcription (<rec>.kong.json).
//   node tools/cal-report.mjs <calibration session .json files...> [--opt key=value ...] [--net] [--expect]
// (x) marks notes added by the expected-note helper; (v) voice-flagged (dropped).
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const files = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--opt');
const opts = profileOptions(args);
const useExpect = args.includes('--expect');
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? v : +v; } });
const SR = 48000;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const fmt = (ns) => ns.map((n) => `${nm(n.midi)}${n.voice ? '(v)' : ''}${n.via === 'expect' ? '(x)' : ''}@${n.t.toFixed(2)}`).join(' ') || '-';

const TOT = { replay: { right: 0, missed: 0, extra: 0 }, live: { right: 0, missed: 0, extra: 0 } };
for (const f of files.sort()) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  if (s.kind !== 'calibration') continue;
  const start = s.recording?.startMs ?? 0;
  const want = (s.song?.notes ?? []).map((n) => nm(n.p));
  const live = s.events.filter((e) => e[1] === 'pitch' && e[2].ok).map((e) => ({ t: (e[2].at - start) / 1000, midi: e[2].midi, voice: e[2].voice }));
  const audio = f.replace(/\.json$/, '.mp4');
  let replay = [], ref = [];
  if (existsSync(audio)) {
    const x = decode(audio, SR);
    const d = new PianoDetector(SR, opts);
    // --expect: behave like homework: expect the next asked note, advance on a
    // hit (same letter). Talk takes (nothing asked) expect --expect-talk=<midi>.
    const asked = (s.song?.notes ?? []).map((n) => n.p);
    const talkExp = +(args.find((a) => a.startsWith('--expect-talk='))?.split('=')[1] ?? 67);
    let k = 0;
    const setNext = () => d.setExpect(asked.length ? (k < asked.length ? [asked[k]] : null) : [talkExp]);
    if (useExpect) setNext();
    d.onEvent = (e) => {
      if (e.type !== 'pitch' || e.midi == null || !(e.clarity > (e.expected ? 0.4 : 0.6)) || e.reject) return;
      replay.push({ t: e.sample / SR, midi: e.midi, voice: e.voice, exp: e.expected, via: e.via });
      if (useExpect && !e.voice && asked.length && k < asked.length && e.midi % 12 === asked[k] % 12) { k++; setNext(); }
    };
    for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  }
  const kf = f.replace(/\.json$/, '.kong.json');
  if (existsSync(kf)) ref = JSON.parse(readFileSync(kf, 'utf8')).filter((n) => n.vel >= 20).sort((a, b) => a.t - b.t);
  const heard = (ns) => ns.filter((n) => !n.voice);
  // Score: asked notes matched in order (by letter), missed, extra.
  const score = (ns) => {
    const a = (s.song?.notes ?? []).map((n) => n.p % 12), b = heard(ns).map((n) => n.midi % 12);
    const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) L[i][j] = a[i - 1] === b[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
    const right = L[a.length][b.length];
    return { right, missed: a.length - right, extra: b.length - right };
  };
  const sc = score(replay), sl = score(live);
  for (const [k, v] of Object.entries(sc)) TOT.replay[k] += v;
  for (const [k, v] of Object.entries(sl)) TOT.live[k] += v;
  if (args.includes('--summary')) { console.log(`${s.calibration.padEnd(14)} asked ${String(want.length).padStart(2)}  replay right ${sc.right} missed ${sc.missed} extra ${sc.extra}   (live: ${sl.right}/${sl.missed}/${sl.extra})`); continue; }
  console.log(`\n${s.calibration}: ${s.prompt}`);
  console.log(`  asked  (${want.length}) ${want.join(' ') || '-'}`);
  console.log(`  live   (${heard(live).length}) ${fmt(live)}`);
  console.log(`  replay (${heard(replay).length}) ${fmt(replay)}`);
  console.log(`  ref    (${ref.length}) ${ref.map((n) => `${nm(n.midi)}v${n.vel}@${n.t.toFixed(2)}`).join(' ') || '-'}`);
}
if (args.includes('--summary')) console.log(`TOTAL          replay right ${TOT.replay.right} missed ${TOT.replay.missed} extra ${TOT.replay.extra}   (live: ${TOT.live.right}/${TOT.live.missed}/${TOT.live.extra})`);
