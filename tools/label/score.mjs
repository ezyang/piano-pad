// What the parent's labels say about each detector on the disputed moments.
//   node tools/label/score.mjs <data dir>      (manifest.json + labels.jsonl)
// For each group: how many moments were real key presses, and whose note was
// right. Groups: classic-only / net-only / ref-only (only that source heard a
// note there) and pitch (they disagreed on the note).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const labels = {};
for (const line of readFileSync(join(dir, 'labels.jsonl'), 'utf8').trim().split('\n').filter(Boolean)) {
  const row = JSON.parse(line); labels[row.id] = row; // latest answer wins
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const by = {};
for (const c of manifest) {
  const l = labels[c.id]; if (!l) continue;
  const g = (by[c.group] ??= { n: 0, yes: 0, no: 0, unsure: 0, right: { c: 0, n: 0, r: 0 }, noteKnown: 0, rows: [] });
  g.n++; g[l.strike]++;
  const truth = l.strike === 'yes' && /^\d+$/.test(l.note ?? '') ? +l.note : null;
  if (truth != null) {
    g.noteKnown++;
    for (const s of ['c', 'n', 'r']) if ((c.heard[s] ?? []).some((m) => m % 12 === truth % 12)) g.right[s]++;
  }
  g.rows.push(`${c.id} ${c.session}@${c.t}  heard c:${(c.heard.c ?? []).map(nm).join(',') || '-'} n:${(c.heard.n ?? []).map(nm).join(',') || '-'} r:${(c.heard.r ?? []).map(nm).join(',') || '-'}  -> ${l.strike}${l.note ? ' ' + (/^\d+$/.test(l.note) ? nm(+l.note) : l.note) : ''}`);
}
for (const [name, g] of Object.entries(by)) {
  console.log(`${name.padEnd(13)} labeled ${g.n}: key press ${g.yes}, none ${g.no}, can't tell ${g.unsure}; right letter where the note is known (${g.noteKnown}): classic ${g.right.c}, network ${g.right.n}, reference ${g.right.r}`);
}
if (process.argv.includes('--rows')) for (const [name, g] of Object.entries(by)) console.log(`\n${name}\n  ${g.rows.join('\n  ')}`);
