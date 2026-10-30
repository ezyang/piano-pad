// How firm a note is, for the sleeping lion (lion.js): pure functions, no
// DOM, so test/firm.mjs can check them in Node.
//
// engine.attackLevel is whole-band (from ~150 Hz up) and reads louder for
// low keys at the same strike strength. piano-audio's review (2026-10-29),
// relative to octave 4: octave 2 +4.7 dB, octave 3 +4.0, octave 5 +2.0. So
// each level is normalized to "as if octave 4" before it goes into her
// typical level and before a lion note is judged, and a firm strike counts
// the same on any key. Offsets, not per-octave medians: works with few notes.
export const FIRM_DB = 5;

// Octave of a midi note (C4 = 60 is octave 4).
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;

// dB to subtract from a raw attack level at this midi note.
export function octaveOffset(midi) {
  if (typeof midi !== 'number' || !isFinite(midi)) return 0;
  const o = octaveOf(midi);
  return o <= 2 ? 4.5 : o === 3 ? 4 : o === 4 ? 0 : 2;
}

// The normalized ("octave 4") level, rounded to 0.1 dB; null stays null.
export function normLevel(db, midi) {
  if (typeof db !== 'number' || !isFinite(db)) return null;
  return Math.round(10 * (db - octaveOffset(midi))) / 10;
}

// Median of normalized levels, 0.1 dB.
export function median(v) {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return Math.round(10 * (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2)) / 10;
}

// Firm: the normalized level at least FIRM_DB over her typical (normalized) level.
export const firmLine = (typical) => Math.round(10 * (typical + FIRM_DB)) / 10;
export function judgeFirm(raw, midi, typical) {
  const db = normLevel(raw, midi), thr = firmLine(typical);
  return { raw: raw ?? null, db, thr, firm: db != null && db >= thr };
}
