// Tests for the party band's arrangement: node test/arrange.mjs
import assert from 'node:assert/strict';
import { PIECES } from '../src/app/homework.js';
import { keyOf, pickChords, arrange } from '../src/app/arrange.js';
import { layout, pitchClass } from '../src/app/music.js';

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
