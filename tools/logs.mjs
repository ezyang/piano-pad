// Summarize practice logs exported from the app (⚙︎ → Share practice logs).
//   node tools/logs.mjs logs.json            one line per session
//   node tools/logs.mjs logs.json <id|n>     full timeline of one session (n = index, -1 = last)
import { readFileSync } from 'node:fs';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => (m == null ? '?' : NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1));

const [file, which] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/logs.mjs logs.json [id|index]'); process.exit(1); }
const data = JSON.parse(readFileSync(file, 'utf8'));
const sessions = Array.isArray(data) ? data : data.sessions;

const brief = (s) => {
  const ev = s.events ?? [];
  const count = (t) => ev.filter((e) => e[1] === t).length;
  const pitches = ev.filter((e) => e[1] === 'pitch');
  const rejected = pitches.filter((e) => !e[2].ok).length;
  const r = s.result ?? {};
  return [
    s.started?.slice(5, 16).replace('T', ' '), s.id, (s.kind ?? '').padEnd(8), (s.mode ?? '').padEnd(5),
    (s.song?.title ?? '').slice(0, 18).padEnd(18),
    `${Math.round((s.duration ?? 0) / 1000)}s`.padStart(5),
    `notes ${pitches.length - rejected}${rejected ? `(+${rejected} rejected)` : ''}`.padEnd(22),
    count('sim') ? `sim ${count('sim')}` : '',
    r.aborted ? 'aborted' : r.stars != null ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '',
    count('error') ? `ERRORS ${count('error')}` : '',
  ].join('  ');
};

if (which == null) {
  sessions.forEach((s, i) => console.log(String(i).padStart(3), brief(s)));
  process.exit(0);
}

const s = /^-?\d+$/.test(which) ? sessions.at(+which) : sessions.find((x) => x.id === which);
if (!s) { console.error('no such session'); process.exit(1); }
console.log(brief(s));
console.log('app', s.app?.built, s.app?.standalone ? '(home screen)' : '', '| audio', JSON.stringify(s.audio), '| settings', JSON.stringify(s.settings));
if (s.song?.notes) console.log('song', s.song.clef, s.song.notes.map((n) => (n.p == null ? 'rest' : nm(n.p)) + ':' + n.d).join(' '));
console.log('result', JSON.stringify(s.result));
console.log();
// Timeline. Detector events carry audio-clock times (at = attack, seen = when
// reported); the others are page-clock times. Both start at the session start.
const events = [...(s.events ?? [])].sort((a, b) => (a[2].at ?? a[0]) - (b[2].at ?? b[0]));
for (const [t, type, d] of events) {
  const at = String(d.at ?? t).padStart(7);
  switch (type) {
    case 'onset': console.log(at, 'onset', `flux ${d.flux}`, `(+${d.seen - d.at}ms)`); break;
    case 'pitch': console.log(at, d.ok ? 'PITCH' : 'pitch(rejected)', nm(d.midi), `${d.f0}Hz`, `clarity ${d.clarity}`, `(+${d.seen - d.at}ms)`,
      d.why ? `why r1=${nm(d.why.r1)} old=${d.why.old != null ? nm(d.why.old) : '-'} sp=${d.why.sp != null ? nm(d.why.sp) : '-'}` : ''); break;
    case 'judge': console.log(at, '  →', d.grade, d.k != null ? `#${d.k}` : '', `want ${nm(d.want)} got ${nm(d.got)}`, d.err != null ? `err ${d.err}ms` : ''); break;
    case 'level': console.log(at, 'level', `${d.min}..${d.max} dB (mean ${d.mean})`); break;
    case 'expect': console.log(at, 'expect', `beat ${Math.round(d.beatSec * 1000)}ms`, 'at', d.times.join(' ')); break;
    default: console.log(at, type, JSON.stringify(d));
  }
}
