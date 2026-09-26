// Calibration takes: what was asked vs what the app heard live vs a replay
// of today's detector vs the reference transcription (<rec>.kong.json).
//   node tools/cal-report.mjs <calibration session .json files...> [--opt key=value ...]
import { existsSync, readFileSync } from 'node:fs';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const files = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--opt');
const opts = profileOptions(args);
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? v : +v; } });
const SR = 48000;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const fmt = (ns) => ns.map((n) => `${nm(n.midi)}${n.voice ? '(v)' : ''}@${n.t.toFixed(2)}`).join(' ') || '-';

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
    d.onEvent = (e) => { if (e.type === 'pitch' && e.midi != null && e.clarity > 0.6 && !e.reject) replay.push({ t: e.sample / SR, midi: e.midi, voice: e.voice }); };
    for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  }
  const kf = f.replace(/\.json$/, '.kong.json');
  if (existsSync(kf)) ref = JSON.parse(readFileSync(kf, 'utf8')).filter((n) => n.vel >= 20).sort((a, b) => a.t - b.t);
  const heard = (ns) => ns.filter((n) => !n.voice);
  console.log(`\n${s.calibration}: ${s.prompt}`);
  console.log(`  asked  (${want.length}) ${want.join(' ') || '-'}`);
  console.log(`  live   (${heard(live).length}) ${fmt(live)}`);
  console.log(`  replay (${heard(replay).length}) ${fmt(replay)}`);
  console.log(`  ref    (${ref.length}) ${ref.map((n) => `${nm(n.midi)}v${n.vel}@${n.t.toFixed(2)}`).join(' ') || '-'}`);
}
