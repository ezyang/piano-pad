// Song model and music helpers.
//
// A song is a list of notes, each {d: beats, p: midi | null (rest)}.
// Durations are Piano Safari rhythms: ti 0.5, ta 1, ta-a 2, ta-a-a 3, ta-a-a-a 4.

export const DURATIONS = [0.5, 1, 2, 3, 4];
export const SYLLABLE = { 0.5: 'ti', 1: 'ta', 2: 'ta-a', 3: 'ta-a-a', 4: 'ta-a-a-a' };
export const REST_SYLLABLE = 'sh';

const LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
export const letter = (m) => LETTERS[((m % 12) + 12) % 12];
export const isSharp = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export const pitchClass = (m) => ((m % 12) + 12) % 12;
export const noteName = (m) => letter(m) + (isSharp(m) ? '♯' : '');

// Does a played note count as the wanted one? Exactly, when the octave must
// match (grown-ups setting, on by default), else by letter.
export const sameNote = (played, want, strictOctave) =>
  strictOctave ? played === want : pitchClass(played) === pitchClass(want);

// Far outside what a task asks for — almost always speech (adult voices sit
// around 85-250 Hz) or a stray bump — so ignore it rather than call it wrong.
export const outOfRange = (m, lo, hi) => m < lo - 12 || m > hi + 12;

// Beat positions for each note.
export function layout(notes) {
  let t = 0;
  return notes.map((n) => {
    const out = { ...n, start: t };
    t += n.d;
    return out;
  });
}

export const totalBeats = (notes) => notes.reduce((s, n) => s + n.d, 0);

// Natural-note rows (low to high) covering the song and at least the clef's
// home range: treble C4..C5, bass C3..C4, grand C3..C5.
const HOME = { treble: [60, 72], bass: [48, 60], grand: [48, 72] };
export function rowsFor(notes, clef = 'treble') {
  const ps = notes.filter((n) => n.p != null).map((n) => n.p - (isSharp(n.p) ? 1 : 0));
  const [homeLo, homeHi] = HOME[clef] ?? HOME.treble;
  let lo = Math.min(homeLo, ...ps), hi = Math.max(homeHi, ...ps);
  const rows = [];
  for (let m = lo; m <= hi; m++) if (!isSharp(m)) rows.push(m);
  return rows;
}
export const rowOf = (rows, p) => rows.indexOf(isSharp(p) ? p - 1 : p);

// Bars are 4/4 from beat 0 (or `bar` beats: a 3/4 piece has `beats: 3`,
// see meter()). A note that crosses a bar line is drawn as two
// (or more) tied pieces, so every bar holds exactly 4 beats: a ta-a on beat
// 4 is "ta" before the line, tied to "a" after it. Only the drawing splits;
// the stored note (and playback, scoring) stays one note. Each piece is a
// standard length (4, 3, 2, 1, 0.5). Returns [{start, d, i, tieTo, tieFrom}]
// for laid-out note i.
export const BAR = 4;
// Beats per bar of a song: its `beats` (3 for 3/4), else 4.
export const meter = (song) => (song?.beats > 0 ? song.beats : BAR);
const EPS = 1e-9;
export function pieces(n, i = 0, bar = BAR) {
  const out = [];
  let t = n.start, left = n.d;
  while (left > EPS) {
    const barEnd = (Math.floor(t / bar + EPS) + 1) * bar;
    let room = Math.min(left, barEnd - t);
    while (room > EPS) {
      const d = [4, 3, 2, 1, 0.5].find((x) => x <= room + EPS && (x < 3 || t % 1 < EPS)) ?? room;
      out.push({ start: t, d, i, tieFrom: out.length > 0 });
      t += d; room -= d; left -= d;
    }
  }
  out.forEach((p, k) => { p.tieTo = k < out.length - 1; });
  return out;
}

// Pieces grouped into bars: [[piece, ...], ...], each bar 4 beats (or
// `bar`; the last may be short).
export function bars(laid, bar = BAR) {
  const out = [];
  laid.forEach((n, i) => {
    for (const p of pieces(n, i, bar)) (out[Math.floor(p.start / bar + EPS)] ??= []).push(p);
  });
  return out.filter(Boolean);
}

// Group notes for notation: consecutive ti's starting on a half-beat grid pair
// up as beamed "ti-ti" (a pair on the beat never crosses a bar line). Notes
// that cross a bar line come as tied pieces (see pieces()). Returns
// [{kind, notes: [{...note, start, d, tieTo, tieFrom}]}].
export function notationGroups(laid) {
  const groups = [];
  for (let i = 0; i < laid.length; i++) {
    const n = laid[i], nx = laid[i + 1];
    if (n.d === 0.5 && nx && nx.d === 0.5 && n.p != null && nx.p != null && n.start % 1 === 0) {
      groups.push({ kind: 'titi', notes: [n, nx] });
      i++;
      continue;
    }
    for (const pc of pieces(n, i)) {
      groups.push({ kind: n.p == null ? 'rest' : SYLLABLE[pc.d] ?? 'ta', notes: [{ ...n, ...pc }] });
    }
  }
  return groups;
}

// Turn freely played notes [{time (s), midi}] into song notes. The typical gap
// between notes becomes one beat; each note's start snaps to the half-beat
// grid (so rounding never piles up). Then, so the bars come out as real 4/4:
// a ti only stays a ti as half of a ti-ti pair on the beat (a lone ti
// becomes a ta, which keeps everything after it on the beat), and the last
// note fills its bar. `offset` = beats already in the song before these.
export function quantize(played, offset = 0) {
  if (!played.length) return { notes: [], bpm: 80 };
  const iois = [];
  for (let i = 1; i < played.length; i++) iois.push(played[i].time - played[i - 1].time);
  const usable = iois.filter((x) => x > 0.12 && x < 2.5).sort((a, b) => a - b);
  let beat = usable.length ? usable[usable.length >> 1] : 0.75;
  // Prefer a beat that makes the common gap a "ta" at a sane tempo.
  beat = Math.min(1.2, Math.max(0.4, beat));
  const snap = (r) => {
    let best = 1, err = Infinity;
    for (const d of DURATIONS) {
      const e = Math.abs(Math.log(r / d));
      if (e < err) { err = e; best = d; }
    }
    return best;
  };
  const ds = iois.map((x) => snap(x / beat));
  const notes = [];
  let t = offset;
  for (let i = 0; i < played.length; i++) {
    let d;
    if (i === played.length - 1) d = BAR - (((t % BAR) + BAR) % BAR) || BAR;
    else if (ds[i] === 0.5) {
      if (t % 1 < EPS && ds[i + 1] === 0.5 && i + 1 < played.length - 1) {
        notes.push({ d: 0.5, p: played[i].midi }, { d: 0.5, p: played[i + 1].midi });
        t += 1; i++;
        continue;
      }
      d = 1;
    } else d = ds[i];
    if (i === played.length - 1 && d % 1) d = 1; // the song's off the beat (an old song): a ta to end
    notes.push({ d, p: played[i].midi });
    t += d;
  }
  return { notes, bpm: Math.round(60 / beat) };
}
