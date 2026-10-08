// The party band's arrangement (instruments.js renderBand { arrange }):
// instead of everyone playing the tune, the bass plays chord roots and the
// music box a harmony a third (or sixth) under the tune. The piano and the
// guest keep the tune, on top, so the kids can sing along.
//
//   keyOf(song)       tonic pitch class: song.key, else G with an F♯ key
//                     signature or F♯s in the notes, else C
//   pickChords(song)  [{start, d, name}] one chord per half bar (2 beats)
//                     from I / IV / V / V7 of the key; song.chords
//                     (a name per half bar, e.g. ['I', 'V7', ...]) overrides
//   arrange(song)     {key, chords, bass: [{start, d, p}], harmony: [...]}
// Pieces are 4/4 with no pickup (bars of 4 beats from beat 0).
import { layout, totalBeats, pitchClass } from './music.js';

const SEG = 2; // beats per chord (half a bar)
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
// tune when a left-hand line goes down there.
function bassLine(chords, laid, key) {
  const out = [];
  chords.forEach((c, i) => {
    const low = Math.min(...laid.filter((n) => n.start < c.start + c.d && n.start + n.d > c.start).map((n) => n.p), 99);
    const top = Math.max(28 + 11, Math.min(47, low - 5));
    const root = below(tones(c.name, key)[0], top);
    const sameAsBefore = i % 2 === 1 && family(chords[i - 1].name) === family(c.name);
    out.push({ start: c.start, d: c.d, p: sameAsBefore ? (root + 7 <= top + 3 ? root + 7 : root - 5) : root });
  });
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
  return { key, chords, bass: bassLine(chords, laid, key), harmony: harmonyLine(chords, laid, key) };
}
