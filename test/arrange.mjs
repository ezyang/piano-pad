// Tests for the party band's arrangement: node test/arrange.mjs
import assert from 'node:assert/strict';
import { PIECES } from '../src/app/homework.js';
import { keyOf, pickChords, arrange } from '../src/app/arrange.js';
import { layout, pitchClass } from '../src/app/music.js';

const CHORD_PCS = { I: [0, 4, 7], IV: [5, 9, 0], V: [7, 11, 2], V7: [7, 11, 2, 5] }; // in C
const names = (song) => pickChords(song).map((c) => c.name).join(' ');

// Ode (C): I on the opening E's, V(7) on the F G / G F, a half cadence on
// V at the end of the left hand's line, and home on I at the end.
assert.equal(keyOf(PIECES.ode), 0);
assert.equal(names(PIECES.ode), 'I V7 V7 I I V I V I V7 V7 I I V V I');

// Zebra (G, one sharp): G for the G's, D for the A's, never a C chord
// with an F (everything is in G).
assert.equal(keyOf(PIECES.zebra), 7);
assert.equal(names(PIECES.zebra), 'I I I I V V I I I I I I I V I I');
for (const c of arrange(PIECES.zebra).harmony.concat(arrange(PIECES.zebra).bass)) assert.notEqual(pitchClass(c.p), 5, 'no F natural in G');
assert.ok(arrange(PIECES.zebra).harmony.some((n) => pitchClass(n.p) === 6), 'F sharp under the A');

// Reading ends on F, so it's harmonised in F: C for the G's, F after.
assert.equal(keyOf(PIECES.reading), 5);
assert.equal(names(PIECES.reading), 'V I I I');
// Cats (C): its own chart, the left hand's G G A B over V.
assert.equal(keyOf(PIECES.cats), 0);
assert.equal(names(PIECES.cats), 'I I V IV V V I I I I V IV V V I I');

// 3/4 (a waltz): one chord per bar; Dot's chart is pinned on the piece.
assert.equal(names(PIECES.dot), 'I V V I I V7 I I');
assert.equal(names(PIECES.bell), 'I V7 I V I I V I');
for (const id of ['dot', 'bell']) {
  const a = arrange(PIECES[id]);
  assert.ok(a.chords.every((c, i) => c.start === 3 * i && c.d === 3), `${id}: a chord a bar`);
  // The bass on beat 1 only; the piano's oom (one note) on 1, pah chords on 2 and 3.
  assert.ok(a.bass.every((b) => b.start % 3 === 0 && b.d === 1), `${id}: oom on 1`);
  a.waltz.forEach((w) => {
    assert.equal(w.ps.length, w.start % 3 === 0 ? 1 : 3, `${id}: oom-pah-pah at ${w.start}`);
    const ch = a.chords.find((c) => w.start >= c.start && w.start < c.start + c.d).name;
    for (const p of w.ps) assert.ok(CHORD_PCS[ch].includes(pitchClass(p)), `${id}: ${p} in ${ch} at ${w.start}`);
  });
  assert.equal(a.waltz.length, 24, `${id}: 8 bars of oom-pah-pah`);
}
// 4/4 pieces have no oom-pah-pah.
assert.equal(arrange(PIECES.ode).waltz.length, 0);

// A per-piece override wins.
assert.deepEqual(pickChords({ ...PIECES.g, chords: ['I', 'IV'] }).map((c) => c.name), ['I', 'IV']);

// Every party piece: in key, ends on I, the bass under the tune, the
// harmony a third or sixth under the tune note it goes with.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
for (const [id, song] of Object.entries(PIECES)) {
  const a = arrange(song), laid = layout(song.notes).filter((n) => n.p != null);
  assert.equal(a.chords.at(-1).name, 'I', `${id} ends at home`);
  for (const n of [...a.bass, ...a.harmony]) assert.ok(MAJOR.includes((pitchClass(n.p) - a.key + 12) % 12), `${id}: ${n.p} in key`);
  for (const b of a.bass) {
    const over = laid.filter((n) => n.start < b.start + b.d && n.start + n.d > b.start);
    assert.ok(over.every((n) => n.p > b.p), `${id}: bass under the tune at ${b.start}`);
  }
  a.harmony.forEach((h, i) => assert.ok([3, 4, 8, 9].includes(laid[i].p - h.p), `${id}: harmony interval at ${h.start}`));
}
console.log('arrange tests passed');
