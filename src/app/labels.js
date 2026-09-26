// What to show under notes: 'letters' | 'fingers' | 'none' (grown-ups menu).
// Finger numbers are for C position: right-hand thumb on middle C, left-hand
// pinky on the C below. Notes outside the position fall back to a faint
// letter.
import { getState } from './store.js';
import { letter, isSharp } from './music.js';

export function labelMode() {
  const st = getState();
  return st.labels ?? (st.showLetters === false ? 'none' : 'letters');
}

const RH = { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 };
const LH = { 48: 5, 50: 4, 52: 3, 53: 2, 55: 1 };
export const fingerFor = (m) => RH[m] ?? LH[m] ?? null;
export const handFor = (m) => (m in RH ? 'right' : m in LH ? 'left' : null);

// { text, fallback } for a note under the given mode.
export function labelFor(m, mode = labelMode()) {
  if (mode === 'none') return { text: '' };
  const name = letter(m) + (isSharp(m) ? '♯' : '');
  if (mode === 'fingers') {
    const f = fingerFor(m);
    return f ? { text: String(f) } : { text: name, fallback: true };
  }
  return { text: name };
}
