// What to show under notes: 'letters' | 'fingers' | 'none' (grown-ups menu).
// Finger numbers come from a hand position: { R: {midi: finger}, L: {...} }.
// The default is C position (right-hand thumb on middle C, left-hand pinky
// on the C below); a piece can bring its own (homework.js `position`, e.g.
// the left thumb on C3, going down). Notes outside the position fall back
// to a faint letter.
import { getState } from './store.js';
import { letter, isSharp, SYLLABLE } from './music.js';

export function labelMode() {
  const st = getState();
  return st.labels ?? (st.showLetters === false ? 'none' : 'letters');
}

export const C_POSITION = {
  R: { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 },
  L: { 48: 5, 50: 4, 52: 3, 53: 2, 55: 1 },
};
export const fingerFor = (m, pos = C_POSITION) => pos.R[m] ?? pos.L[m] ?? null;
export const handFor = (m, pos = C_POSITION) => (m in pos.R ? 'right' : m in pos.L ? 'left' : null);

// { text, fallback } for a note under the given mode. `finger` overrides
// the position's number (a note's `f`); `pos`: the hand position.
// Mode 'book': only the finger numbers the lesson book prints (`finger`).
// Mode 'rhythm': the Piano Safari rhythm words (ta-a, ta, ti) for `beats`.
export function labelFor(m, mode = labelMode(), finger = null, beats = null, pos = C_POSITION) {
  if (mode === 'none') return { text: '' };
  if (mode === 'book') return { text: finger != null ? String(finger) : '' };
  if (mode === 'rhythm') return { text: SYLLABLE[beats] ?? '' };
  const name = letter(m) + (isSharp(m) ? '♯' : '');
  if (mode === 'fingers') {
    const f = finger ?? fingerFor(m, pos);
    return f ? { text: String(f) } : { text: name, fallback: true };
  }
  return { text: name };
}
