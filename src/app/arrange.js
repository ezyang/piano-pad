// The party band's arrangement (instruments.js renderBand { arrange }):
// instead of everyone playing the tune, the bass plays chord roots and the
// music box a harmony a third (or sixth) under the tune. The piano and the
// guest keep the tune, on top, so the kids can sing along.
//
//   keyOf(song)       tonic pitch class: song.key, else G with an F♯ key
//                     signature or F♯s in the notes, else C
//   pickChords(song)  [{start, d, name}] one chord per half bar (2 beats)
//                     from I / IV / V / V7 of the key (in 3/4, `beats: 3`,
//                     one per bar); song.chords (a name per half bar, or
//                     per bar in 3/4, e.g. ['I', 'V7', ...]) overrides
//   arrange(song)     {key, chords, bass: [{start, d, p}], harmony: [...],
//                     waltz: [{start, d, ps: [midi...]}]}
// Pieces have no pickup (bars from beat 0), 4/4 or 3/4. In 3/4 the band
// plays a waltz: the bass only on beat 1 ("oom"), and `waltz` is the
// piano's oom-pah-pah (the root on 1, short soft chords on 2 and 3), so
// the 1-2-3 is heard whoever is in the band. Empty in 4/4.
import { layout, totalBeats, pitchClass, meter } from './music.js';

// Beats per chord: half a bar in 4/4, a whole bar in 3/4.
const segOf = (song) => (meter(song) === 3 ? 3 : 2);
// Pitch classes above the tonic. V7 is V plus the 7th (the scale's 4th).
const CHORDS = { I: [0, 4, 7], IV: [5, 9, 0], V: [7, 11, 2], V7: [7, 11, 2, 5] };
// A small lean towards the plainest chords, when the tune fits several.
const PRIOR = { I: 0.4, V: 0.2, IV: 0.15, V7: 0.1 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export function keyOf(song) {
  if (song.key != null) return song.key;
  if (song.sharps?.includes('F') || song.notes.some((n) => n.p != null && pitchClass(n.p) === 6)) return 7;
  return 0;
}

const tones = (name, key) => CHORDS[name].map((x) => (x + key) % 12);
const family = (name) => (name === 'V7' ? 'V' : name);

// How well a chord fits the tune in one half bar: each sounding note counts
// by how long it sounds there, double if it starts on the half bar's beat;
// chord tones +, others − (V7's 7th a little +, it's what the 7th is for).
function fit(name, key, notes) {
  const ts = tones(name, key);
  let s = PRIOR[name];
  for (const { pc, w } of notes) {
    if (ts.includes(pc)) s += name === 'V7' && pc === ts[3] ? 0.5 * w : w;
    else s -= w;
  }
  return s;
}

export function pickChords(song) {
  const key = keyOf(song);
  const laid = layout(song.notes).filter((n) => n.p != null);
  const SEG = segOf(song);
  const segs = Math.max(1, Math.ceil(totalBeats(song.notes) / SEG));
  if (song.chords) return song.chords.slice(0, segs).map((name, i) => ({ start: i * SEG, d: SEG, name }));
  const out = [];
  let prev = 'I';
  for (let i = 0; i < segs; i++) {
    const a = i * SEG, b = a + SEG;
    const notes = laid.filter((n) => n.start < b && n.start + n.d > a).map((n) => ({
      pc: pitchClass(n.p),
      w: (Math.min(b, n.start + n.d) - Math.max(a, n.start)) * (n.start === a ? 2 : 1),
    }));
    let best = prev, bestS = -Infinity;
    if (notes.length) {
      for (const name of Object.keys(CHORDS)) {
        let s = fit(name, key, notes);
        if (family(name) === family(prev)) s += 0.1; // don't change chords for nothing
        if (i === segs - 1 && name === 'I') s += 3; // end at home
        if (i === segs - 2 && family(name) === 'V') s += 0.4; // ... from V
        if (s > bestS) { best = name; bestS = s; }
      }
    }
    out.push({ start: a, d: SEG, name: best });
    prev = best;
  }
  return out;
}

const chordAt = (chords, t) => chords.find((c) => t >= c.start && t < c.start + c.d) ?? chords.at(-1);
// The highest pitch of class pc at or below `top`.
const below = (pc, top) => top - ((top - pc) % 12 + 12) % 12;

// The bass: the chord's root on its beat; a chord held a whole bar plays
// root (beat 1) then fifth (beat 3). Low (C2..B2), and always under the
// tune when a left-hand line goes down there. In 3/4 (waltz) just the
// root on beat 1, one beat long: the "oom".
const lowestIn = (laid, a, b) => Math.min(...laid.filter((n) => n.start < b && n.start + n.d > a).map((n) => n.p), 99);
const rootOf = (c, laid, key) => below(tones(c.name, key)[0], Math.max(28 + 11, Math.min(47, lowestIn(laid, c.start, c.start + c.d) - 5)));
function bassLine(chords, laid, key, waltz) {
  const out = [];
  chords.forEach((c, i) => {
    const top = Math.max(28 + 11, Math.min(47, lowestIn(laid, c.start, c.start + c.d) - 5));
    const root = rootOf(c, laid, key);
    if (waltz) { out.push({ start: c.start, d: 1, p: root }); return; }
    const sameAsBefore = i % 2 === 1 && family(chords[i - 1].name) === family(c.name);
    out.push({ start: c.start, d: c.d, p: sameAsBefore ? (root + 7 <= top + 3 ? root + 7 : root - 5) : root });
  });
  return out;
}

// The piano's oom-pah-pah in 3/4: per bar, the root on beat 1 (the bass's
// note) and the chord, closed, on beats 2 and 3 (where the bar has them).
// The chord sits just under the bar's tune when the tune is up from A3
// (a right-hand line); under a left-hand line it goes just above the tune
// instead (below there it's mud).
function waltzLine(chords, laid, key, end) {
  const out = [];
  for (const c of chords) {
    const ts = tones(c.name, key).slice(0, 3);
    const inBar = laid.filter((n) => n.start < c.start + c.d && n.start + n.d > c.start);
    if (!inBar.length) continue;
    const lo = Math.min(...inBar.map((n) => n.p)), hi = Math.max(...inBar.map((n) => n.p));
    let ps;
    if (lo >= 57) { // under: the highest closed triad with its top a third under the tune
      const top = lo - 3;
      const t0 = Math.max(...ts.map((pc) => below(pc, top)));
      ps = ts.map((pc) => below(pc, t0)).sort((a, b) => a - b);
    } else { // over: the lowest closed triad from a third above the tune
      const b0 = hi + 3;
      ps = ts.map((pc) => b0 + ((pc - b0) % 12 + 12) % 12).sort((a, b) => a - b);
    }
    out.push({ start: c.start, d: 1, ps: [rootOf(c, laid, key)] });
    for (const t of [c.start + 1, c.start + 2]) if (t < end) out.push({ start: t, d: 1, ps });
  }
  return out;
}

// The harmony, under each tune note: the scale's third or sixth below
// (thirds and sixths always sound sweet with the tune), whichever is
// nearer the last harmony note, so the line moves smoothly in parallel
// thirds or sixths. When the tune is on a chord tone, the harmony must be
// a chord tone too (a fourth below if neither is); off the chord it's a
// passing note, so either is fine.
const stepsDown = (p, key, steps) => {
  const deg = MAJOR.indexOf((pitchClass(p) - key + 12) % 12);
  if (deg < 0) return p - { 2: 3, 3: 5, 5: 8 }[steps]; // not in the key (no piece has one yet)
  return p - ((MAJOR[deg] - MAJOR[(deg + 7 - steps) % 7] + 12) % 12);
};
function harmonyLine(chords, laid, key) {
  let last = null;
  return laid.map((n) => {
    const ts = tones(chordAt(chords, n.start).name, key);
    let opts = [stepsDown(n.p, key, 2), stepsDown(n.p, key, 5)];
    if (ts.includes(pitchClass(n.p))) {
      opts = opts.filter((q) => ts.includes(pitchClass(q)));
      if (!opts.length) opts = [stepsDown(n.p, key, 3)];
    }
    const p = last == null ? opts[0] : opts.reduce((x, y) => (Math.abs(y - last) < Math.abs(x - last) ? y : x));
    last = p;
    return { start: n.start, d: n.d, p };
  });
}

export function arrange(song) {
  const key = keyOf(song);
  const chords = pickChords(song);
  const laid = layout(song.notes).filter((n) => n.p != null);
  const waltz = meter(song) === 3;
  return {
    key, chords, bass: bassLine(chords, laid, key, waltz), harmony: harmonyLine(chords, laid, key),
    waltz: waltz ? waltzLine(chords, laid, key, totalBeats(song.notes)) : [],
  };
}
