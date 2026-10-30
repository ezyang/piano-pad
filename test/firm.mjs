// Tests for the lion's firm-note check, normalized by octave: node test/firm.mjs
import assert from 'node:assert/strict';
import { octaveOffset, normLevel, median, judgeFirm, FIRM_DB } from '../src/app/firm.js';

assert.equal(FIRM_DB, 5);
// Offsets: octave 2 and below 4.5, octave 3 4, octave 4 0, octave 5 and up 2.
assert.equal(octaveOffset(24), 4.5); // C1
assert.equal(octaveOffset(47), 4.5); // B2
assert.equal(octaveOffset(48), 4);   // C3
assert.equal(octaveOffset(59), 4);   // B3
assert.equal(octaveOffset(60), 0);   // C4
assert.equal(octaveOffset(71), 0);   // B4
assert.equal(octaveOffset(72), 2);   // C5
assert.equal(octaveOffset(96), 2);   // C7
assert.equal(normLevel(-30, 55), -34);
assert.equal(normLevel(null, 55), null);

// Her typical level: octave-4 notes around -32, plus a few left-hand notes
// in octave 3 that read ~4 dB louder raw at the same strength. Normalized,
// they all land on -32.
const typical = median([-32, -31.5, -32.5, -32, -32 + 4, -32 + 4].map((raw, i) => normLevel(raw, i < 4 ? 64 : 53)));
assert.equal(typical, -32);

// An octave-3 note at median + 4 raw: an ordinary left-hand note, soft.
const g3 = judgeFirm(typical + 4, 55, typical);
assert.equal(g3.firm, false, JSON.stringify(g3));
assert.equal(g3.raw, -28);
assert.equal(g3.db, -32);
// Even median + 8 raw in octave 3 is only + 4 normalized: soft.
assert.equal(judgeFirm(typical + 8, 55, typical).firm, false);
// Octave 3 needs + 9 raw.
assert.equal(judgeFirm(typical + 9, 55, typical).firm, true);
// An octave-4 note at median + 5: firm.
const e4 = judgeFirm(typical + 5, 64, typical);
assert.equal(e4.firm, true, JSON.stringify(e4));
assert.equal(e4.thr, -27);
assert.equal(judgeFirm(typical + 4.9, 64, typical).firm, false);
// Octave 5: + 7 raw.
assert.equal(judgeFirm(typical + 6.9, 76, typical).firm, false);
assert.equal(judgeFirm(typical + 7, 76, typical).firm, true);
// No level heard: soft.
assert.equal(judgeFirm(null, 64, typical).firm, false);

console.log('firm: ok');
