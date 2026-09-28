// The frozen evaluation: score a detector configuration on everything with
// ground truth, the same way every time.
//   node tools/eval.mjs <eval.json> [--classic | --net ...] [--expect] [--opt key=value ...] [--detail]
// eval.json (kept with the data, not in git) lists
//   { "takes": [calibration session .json paths...],
//     "labels": [label batch dirs (manifest.json + labels.jsonl)...],
//     "logs": "logs" (where the labeled sessions' recordings are) }
// Paths are relative to eval.json.
// Takes (the parent played exactly what the prompt said): notes matched in
// order by letter (a take's `alt` notes also count), missed, extra (not
// counted where the take says `extrasOk`). With --expect, the detector is told
// the next asked note and advances on a hit, like homework.
// Labeled moments (the parent listened to disputed moments in her sessions):
// real key presses caught with the right letter, caught with a wrong letter,
// missed; and non-notes wrongly accepted. Splat / hard / can't-tell answers
// don't count.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PianoDetector } from '../src/detector.js';
import { decode } from './oracle.mjs';
import { profileOptions } from './profile.mjs';

const args = process.argv.slice(2);
const evalFile = args.find((a) => a.endsWith('.json'));
if (!evalFile) { console.error('usage: node tools/eval.mjs <eval.json> [--classic|--net] [--expect] [--opt k=v] [--detail]'); process.exit(1); }
const spec = JSON.parse(readFileSync(evalFile, 'utf8'));
const base = dirname(evalFile);
const at = (p) => (p.startsWith('/') ? p : join(base, p));
const opts = profileOptions(args);
args.forEach((a, i) => { if (a === '--opt') { const [k, v] = args[i + 1].split('='); opts[k] = isNaN(+v) ? (v.startsWith('[') ? JSON.parse(v) : v) : +v; } });
const useExpect = args.includes('--expect'), detail = args.includes('--detail');
const SR = 48000;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const pc = (m) => ((m % 12) + 12) % 12;
const accepted = (e) => e.type === 'pitch' && e.midi != null && e.clarity > (e.expected ? 0.4 : 0.6) && !e.reject && !e.voice;

// Run the detector over a recording; `onNote` sees accepted notes as they come.
function run(x, onNote, setup) {
  const d = new PianoDetector(SR, opts);
  setup?.(d);
  const notes = [];
  d.onEvent = (e) => { if (accepted(e)) { const n = { t: e.sample / SR, midi: e.midi }; notes.push(n); onNote?.(n, d); } };
  for (let i = 0; i < x.length; i += 128) d.process(x.subarray(i, i + 128));
  return notes;
}

// Asked notes (with alternatives) vs heard notes, matched in order by letter.
function align(asked, alt, heard) {
  const ok = (i, m) => pc(m) === pc(asked[i]) || (alt?.[i] ?? []).some((a) => pc(a) === pc(m));
  const L = Array.from({ length: asked.length + 1 }, () => new Array(heard.length + 1).fill(0));
  for (let i = 1; i <= asked.length; i++) for (let j = 1; j <= heard.length; j++) L[i][j] = ok(i - 1, heard[j - 1].midi) ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  return L[asked.length][heard.length];
}

const T = { takes: 0, asked: 0, right: 0, missed: 0, extra: 0 };
const rows = [];
for (const f of spec.takes ?? []) {
  const s = JSON.parse(readFileSync(at(f), 'utf8'));
  const audio = at(f).replace(/\.json$/, '.mp4');
  if (!existsSync(audio)) continue;
  const asked = (s.song?.notes ?? []).map((n) => n.p);
  let k = 0;
  const next = (d) => d.setExpect(k < asked.length ? [asked[k]] : null);
  const heard = run(decode(audio, SR), useExpect && asked.length ? (n, d) => {
    const want = asked[k];
    if (k < asked.length && (pc(n.midi) === pc(want) || (s.alt?.[k] ?? []).some((a) => pc(a) === pc(n.midi)))) { k++; next(d); }
  } : null, useExpect && asked.length ? next : null);
  const right = align(asked, s.alt, heard), extra = s.extrasOk ? 0 : heard.length - right;
  T.takes++; T.asked += asked.length; T.right += right; T.missed += asked.length - right; T.extra += extra;
  rows.push(`  ${(s.calSet ?? s.kind ?? '').padEnd(8)} ${(s.calibration ?? s.song?.title ?? s.id).slice(0, 22).padEnd(22)} asked ${String(asked.length).padStart(2)}  right ${right}  missed ${asked.length - right}  extra ${extra}${s.extrasOk ? ' (extras ok)' : ''}   heard: ${heard.map((n) => nm(n.midi)).join(' ')}`);
}

// Recordings by session id, from the logs directory (<logs>/<date>/<id>.mp4).
const recordings = {};
const logsDir = at(spec.logs ?? 'logs');
if (existsSync(logsDir)) for (const d of readdirSync(logsDir)) if (/^\d{4}-/.test(d)) for (const f of readdirSync(join(logsDir, d))) if (f.endsWith('.mp4')) recordings[f.slice(0, -4)] = join(logsDir, d, f);

const L = { real: 0, caught: 0, wrongLetter: 0, missed: 0, non: 0, falseAccept: 0, skipped: 0 };
const lrows = [];
for (const dir of spec.labels ?? []) {
  const man = JSON.parse(readFileSync(join(at(dir), 'manifest.json'), 'utf8'));
  const lab = {};
  for (const line of readFileSync(join(at(dir), 'labels.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(line); lab[r.id] = r; }
  const bySession = {};
  for (const c of man) if (lab[c.id]) (bySession[c.session] ??= []).push(c);
  for (const [session, clips] of Object.entries(bySession)) {
    const audio = recordings[session];
    if (!audio) { L.skipped += clips.length; continue; }
    const heard = run(decode(audio, SR));
    for (const c of clips) {
      const l = lab[c.id], near = heard.filter((n) => Math.abs(n.t - c.t) < 0.07);
      if (l.strike === 'yes') {
        L.real++;
        const truth = /^\d+$/.test(l.note ?? '') ? +l.note : null;
        if (!near.length) { L.missed++; lrows.push(`  ${c.id} real ${truth != null ? nm(truth) : l.note}: missed`); }
        else if (truth == null || near.some((n) => pc(n.midi) === pc(truth))) L.caught++;
        else { L.wrongLetter++; lrows.push(`  ${c.id} real ${nm(truth)}: heard ${near.map((n) => nm(n.midi)).join(',')}`); }
      } else if (l.strike === 'no') {
        L.non++;
        if (near.length) { L.falseAccept++; lrows.push(`  ${c.id} not a key: heard ${near.map((n) => nm(n.midi)).join(',')}`); }
      } else L.skipped++;
    }
  }
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : '-');
console.log(`config: ${JSON.stringify({ onsets: opts.onsets, expect: useExpect, ...Object.fromEntries(Object.entries(opts).filter(([k]) => !['templates', 'net', 'onsets', 'octaveDown', 'tuning'].includes(k))) })}`);
console.log(`takes (${T.takes}): ${T.asked} asked notes, right ${T.right} (${pct(T.right, T.asked)}), missed ${T.missed}, extra ${T.extra}`);
console.log(`labeled moments: real key presses ${L.real}: caught ${L.caught}, wrong letter ${L.wrongLetter}, missed ${L.missed} · non-notes ${L.non}: wrongly accepted ${L.falseAccept}` + (L.skipped ? ` · not scored ${L.skipped}` : ''));
if (detail) { console.log(rows.join('\n')); if (lrows.length) console.log(lrows.join('\n')); }
