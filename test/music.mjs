// Tests for bar grouping (4/4) and quantize: node test/music.mjs
import assert from 'node:assert/strict';
import { layout, bars, pieces, notationGroups, quantize, totalBeats } from '../src/app/music.js';
import { PIECES } from '../src/app/homework.js';

const sum = (ps) => ps.reduce((a, p) => a + p.d, 0);
const show = (song) => bars(layout(song)).map((b) => b.map((p) => (p.tieFrom ? '~' : '') + p.d).join(' '));
const ta = (p = 60) => ({ d: 1, p }), taa = (p = 60) => ({ d: 2, p }), whole = (p = 60) => ({ d: 4, p });
const titi = (p = 60) => [{ d: 0.5, p }, { d: 0.5, p }], rest = { d: 1, p: null };

// Every bar holds exactly 4 beats (the last may be short); a note across a
// bar line is split into tied pieces.
function check(song) {
  const bs = bars(layout(song));
  bs.forEach((b, k) => (k < bs.length - 1 ? assert.equal(sum(b), 4, `bar ${k}: ${show(song)[k]}`) : assert.ok(sum(b) <= 4)));
  assert.equal(sum(bs.flat()), totalBeats(song));
  // ti-ti pairs stay beamed together inside one bar.
  for (const g of notationGroups(layout(song))) {
    if (g.kind !== 'titi') continue;
    assert.equal(Math.floor(g.notes[0].start / 4), Math.floor((g.notes[1].start + 0.25) / 4), 'ti-ti in one bar');
  }
  return show(song);
}

// The song made with the tools when this was reported: before, the ta-a on
// beat 4 and the whole note on beat 12 sat in the bar they started in
// (bars of 5, 3, 6, ... beats).
assert.deepEqual(check([ta(), ta(), ta(), taa(), ...titi(), rest, taa(), ...titi(), ta(), whole(), ta(), ta()]),
  ['1 1 1 1', '~1 0.5 0.5 1 1', '~1 0.5 0.5 1 1', '~3 1', '1']);
assert.deepEqual(check([ta(), ta(), whole()]), ['1 1 2', '~2']);
assert.deepEqual(check([ta(), { d: 3, p: 60 }, whole(), taa(), taa()]), ['1 3', '4', '2 2']);
// An off-beat song (a lone ti, as older quantize could make): still 4-beat bars.
assert.deepEqual(check([{ d: 0.5, p: 60 }, ta(), ta(), ta(), ta(), taa()]), ['0.5 1 1 1 0.5', '~0.5 2']);
assert.equal(pieces({ start: 1, d: 4 }).map((p) => p.d).join(), '3,1');
assert.ok(pieces({ start: 3, d: 2 })[0].tieTo && pieces({ start: 3, d: 2 })[1].tieFrom);
// Homework pieces are already bar-aligned: nothing gets split.
for (const [id, p] of Object.entries(PIECES)) {
  check(p.notes);
  assert.equal(bars(layout(p.notes)).flat().length, p.notes.length, `${id}: no ties`);
}

// quantize: steady quarters + a ti-ti pair + a long note. Starts land on the
// beat grid, ti's only in on-beat pairs, the last note fills its bar.
const at = (beats, bpm = 90) => beats.map((b, i) => ({ time: (b * 60) / bpm + (i % 2 ? 0.02 : -0.015), midi: 60 + i }));
let q = quantize(at([0, 1, 2, 3, 3.5, 4, 6, 7]));
assert.deepEqual(q.notes.map((n) => n.d), [1, 1, 1, 0.5, 0.5, 2, 1, 1]);
check(q.notes);
// A lone ti (a rushed note) becomes a ta, so the rest stay on the beat.
q = quantize(at([0, 1, 1.5, 2.5, 3.5, 4.5]));
assert.ok(q.notes.every((n) => n.d !== 0.5), q.notes.map((n) => n.d).join());
assert.equal(totalBeats(q.notes) % 4, 0, 'last note fills the bar');
check(q.notes);
// Written after notes already in the song: the last note fills the bar
// counting from there.
q = quantize(at([0, 1, 2]), 2);
assert.deepEqual(q.notes.map((n) => n.d), [1, 1, 4]);
check([taa(), ...q.notes]);
// Lots of random playing: always whole bars of 4.
for (let t = 0; t < 200; t++) {
  let time = 0;
  const played = Array.from({ length: 3 + (t % 17) }, () => ({ time: (time += 0.1 + Math.random() * 1.6), midi: 60 }));
  const off = t % 3;
  const n = quantize(played, off).notes;
  assert.equal((off + totalBeats(n)) % 4, 0);
  check([...Array.from({ length: off }, () => ta()), ...n]);
}
console.log('music ok');
