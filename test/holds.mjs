// Tests for held long notes (the sparkly bonus gem): node test/holds.mjs
import assert from 'node:assert/strict';
import { holdTracker } from '../src/app/holds.js';
import { PIECES } from '../src/app/homework.js';

// Driving, once through, as seq entries.
const seqOf = (song, times = 1) => Array.from({ length: times }, (_, pass) => song.notes.map((n) => ({ d: n.d, pass }))).flat();
// Play a seq at `q` s per quarter, each note lasting factor(d) × d quarters.
function run(seq, q, factor, skip = new Set()) {
  const tr = holdTracker(seq);
  let t = 0;
  const twinkles = [];
  seq.forEach((x, k) => {
    for (const j of tr.hit(k, skip.has(k) ? null : t)) if (j.held) twinkles.push(j.k);
    t += x.d * q * factor(x.d);
  });
  return { ...tr.summary(), twinkles };
}

const driving = seqOf(PIECES.driving, 2);
// Held at the written length: every long note held, the bonus.
let r = run(driving, 0.6, () => 1);
assert.equal(r.bonus, true);
assert.equal(r.held, r.counted);
assert.ok(r.counted >= 10, `counted ${r.counted}`);
assert.equal(r.quarterMs, 600);
// The first two halves (before any quarter) are judged once quarters come in.
assert.ok(r.twinkles.includes(0) && r.twinkles.includes(1));
// Her rush: halves at 1.6 beats, wholes at 3: no bonus, nothing held.
r = run(driving, 0.6, (d) => (d === 1 ? 1 : d === 2 ? 0.8 : 0.75));
assert.equal(r.bonus, false);
assert.equal(r.held, 0);
// Half her long notes held: no bonus (needs 3/4).
let flip = 0;
r = run(driving, 0.6, (d) => (d === 1 ? 1 : (flip++ % 2 ? 1 : 0.8)));
assert.equal(r.bonus, false);
// A stall (6 quarters after a half) is left out; the rest held → bonus.
const tr = holdTracker(seqOf(PIECES.driving));
let t = 0;
PIECES.driving.notes.forEach((n, k) => { tr.hit(k, t); t += (k === 2 ? 1 : n.d * (k === 4 ? 3 : 1)) * 0.6; });
r = tr.summary();
assert.equal(r.stalls, 1);
assert.equal(r.bonus, true);
// Grown-up steps (null) leave their neighbours out.
r = run(driving, 0.6, () => 1, new Set([0, 1, 2, 3]));
assert.ok(!r.notes.some((x) => x.k <= 2));
// The change between times through isn't an interval.
const last = PIECES.driving.notes.length - 1;
assert.ok(!run(driving, 0.6, () => 1).notes.some((x) => x.k === last));
console.log('holds ok');
