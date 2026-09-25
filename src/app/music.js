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

// Natural-note rows (low to high) covering the song, at least C4..G4.
export function rowsFor(notes) {
  const ps = notes.filter((n) => n.p != null).map((n) => n.p - (isSharp(n.p) ? 1 : 0));
  let lo = Math.min(60, ...ps), hi = Math.max(67, ...ps);
  const rows = [];
  for (let m = lo; m <= hi; m++) if (!isSharp(m)) rows.push(m);
  return rows;
}
export const rowOf = (rows, p) => rows.indexOf(isSharp(p) ? p - 1 : p);

// Group notes for notation: consecutive ti's starting on a half-beat grid pair
// up as beamed "ti-ti". Returns [{kind, notes: [laid-out notes]}].
export function notationGroups(laid) {
  const groups = [];
  for (let i = 0; i < laid.length; i++) {
    const n = laid[i], nx = laid[i + 1];
    if (n.d === 0.5 && nx && nx.d === 0.5 && n.p != null && nx.p != null && n.start % 1 === 0) {
      groups.push({ kind: 'titi', notes: [n, nx] });
      i++;
    } else {
      groups.push({ kind: n.p == null ? 'rest' : SYLLABLE[n.d] ?? 'ta', notes: [n] });
    }
  }
  return groups;
}

// Turn freely played notes [{time (s), midi}] into song notes. The typical gap
// between notes becomes one beat; every gap snaps to the nearest rhythm.
export function quantize(played) {
  if (!played.length) return { notes: [], bpm: 80 };
  const iois = [];
  for (let i = 1; i < played.length; i++) iois.push(played[i].time - played[i - 1].time);
  const usable = iois.filter((x) => x > 0.12 && x < 2.5).sort((a, b) => a - b);
  let beat = usable.length ? usable[usable.length >> 1] : 0.75;
  // Prefer a beat that makes the common gap a "ta" at a sane tempo.
  beat = Math.min(1.2, Math.max(0.4, beat));
  const notes = played.map((p, i) => {
    if (i === played.length - 1) return { d: 2, p: p.midi };
    const r = iois[i] / beat;
    let best = 1, err = Infinity;
    for (const d of DURATIONS) {
      const e = Math.abs(Math.log(r / d));
      if (e < err) { err = e; best = d; }
    }
    return { d: best, p: p.midi };
  });
  return { notes, bpm: Math.round(60 / beat) };
}
