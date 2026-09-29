// Tests for practice scoring: node test/scoring.mjs
import assert from 'node:assert/strict';
import { layout } from '../src/app/music.js';
import { rhythmReview, scoreGo, scoreLearn, scoreBeat, beatGrade, barRhythm, missedNote } from '../src/app/scoring.js';

// Homework: ta-a ta-a ta ta ti ti ta
const notes = [2, 2, 1, 1, 0.5, 0.5, 1].map((d) => ({ d, p: 67 }));
const laid = layout(notes);
const targets = laid.map((_, i) => i);
const play = (beatSec, tweak = {}) => {
  const times = laid.map((n) => n.start * beatSec);
  for (const [k, dt] of Object.entries(tweak)) for (let j = +k; j < times.length; j++) times[j] += dt;
  return times;
};

// Perfectly steady at any tempo: all ok.
for (const beat of [0.5, 0.75, 1.2]) {
  const r = rhythmReview(laid, targets, play(beat));
  assert.equal(r.stalls, 0);
  assert.equal(r.rhythm, 1, `steady at ${beat}`);
  assert.ok(Math.abs(r.beat - beat) < 1e-9);
}

// A 1.5 s stall before note 4.
{
  const r = rhythmReview(laid, targets, play(0.75, { 4: 1.5 }));
  assert.equal(r.marks.get(4), 'stall');
  assert.equal(r.stalls, 1);
}

// Rushing the half notes (played as quarters): marked rushed.
{
  const times = [0, 0.75, 1.5, 2.25, 3.0, 3.375, 3.75];
  const r = rhythmReview(laid, targets, times);
  assert.equal(r.marks.get(1), 'rushed');
  assert.equal(r.marks.get(2), 'rushed');
  assert.ok(r.rhythm < 0.8);
}

// Too few gaps to judge: no marks, neutral.
{
  const r = rhythmReview(layout([{ d: 1, p: 60 }, { d: 1, p: 62 }]), [0, 1], [0, 0.5]);
  assert.equal(r.marks.size, 0);
}

// Keep going stars.
{
  const grades = new Map(targets.map((k) => [k, 'hit']));
  assert.equal(scoreGo(7, grades, rhythmReview(laid, targets, play(0.75))).stars, 3);
  const stalled = scoreGo(7, grades, rhythmReview(laid, targets, play(0.75, { 2: 2, 5: 2 })));
  assert.ok(stalled.stars < 3, 'two stalls cost a star');
  grades.set(3, 'wrong');
  grades.set(5, 'wrong');
  assert.ok(scoreGo(7, grades, rhythmReview(laid, targets, play(0.75))).stars <= 2);
}

assert.equal(scoreLearn(0).stars, 3);
assert.equal(scoreLearn(3).stars, 2);
assert.equal(scoreLearn(9).stars, 1);

assert.equal(beatGrade(0.02), 'perfect');
assert.equal(beatGrade(-0.12), 'good');
assert.equal(beatGrade(-0.3), 'early');
assert.equal(beatGrade(0.3), 'late');
assert.equal(scoreBeat(4, new Map([[0, 'perfect'], [1, 'perfect'], [2, 'perfect'], [3, 'perfect']])).stars, 3);
assert.equal(scoreBeat(4, new Map()).stars, 0);

// Bar rhythm (the G song): contrasts at her own tempo, generously.
{
  const ok = (durs, iois) => barRhythm(durs, iois).ok;
  const at = (beat, durs) => durs.map((d) => d * beat);
  // Played as written, at any tempo.
  for (const beat of [0.4, 0.7, 1.1]) {
    assert.ok(ok([2, 2], at(beat, [2, 2])));
    assert.ok(ok([1, 1, 2], at(beat, [1, 1, 2])));
    assert.ok(ok([0.5, 0.5, 1, 0.5, 0.5, 1], at(beat, [0.5, 0.5, 1, 0.5, 0.5, 1])));
    assert.ok(ok([1, 1], at(beat, [1, 1])), 'the last bar: its half note is untimed');
  }
  // Roughly right is right.
  assert.ok(ok([1, 1, 2], [0.6, 0.7, 1.0]));
  assert.ok(ok([0.5, 0.5, 1, 0.5, 0.5, 1], [0.4, 0.45, 0.65, 0.4, 0.4, 0.7]));
  // Everything the same length: the long and quick notes don't show.
  assert.equal(barRhythm([1, 1, 2], [0.6, 0.6, 0.6]).why, 'long-too-short');
  assert.equal(barRhythm([0.5, 0.5, 1, 0.5, 0.5, 1], [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]).why, 'quick-too-slow');
  // A long hesitation inside a bar.
  assert.equal(barRhythm([2, 2], [1.0, 2.6]).why, 'uneven-long');
}

// A missed onset (she played it; the detector didn't hear it).
{
  const q = 0.6;
  // Bar 2 (ta ta ta-a), then bar 3 starts ti ti: the second ta unheard, so
  // the intervals are [ta, ta+ta-a(=3 beats), ti].
  const durs = [1, 1, 2, 0.5, 0.5];
  assert.equal(barRhythm([1, 1, 2], [q, 3 * q, q / 2]).ok, false);
  assert.equal(missedNote(durs, [q, 3 * q, q / 2]), 1);
  // Bar 3's last ta unheard: [ti ti ta ti ti, ta+ta(next bar)].
  assert.equal(missedNote([0.5, 0.5, 1, 0.5, 0.5, 1, 1, 1], [q / 2, q / 2, q, q / 2, q / 2, 2 * q]), 5);
  // Genuinely even playing isn't explained by a missed note, and neither is
  // playing it as written.
  assert.equal(missedNote(durs, [q, q, q]), null);
  assert.equal(missedNote(durs, [q, q, 2 * q]), null);
  assert.equal(missedNote([0.5, 0.5, 1, 0.5, 0.5, 1, 1, 1], [q / 2, q / 2, q, q / 2, q / 2, q]), null);
}

console.log('scoring tests passed');
