// Her name in the band (2026-11-21, pedagogy: she asked to change it from
// "Princess"). Like her character it has its own key, kept across clean
// slates and "Reset all data"; losing it is fine (back to Princess, and the
// grown-ups' ⚙︎ can set it). Uppercase A-Z and spaces, at most NAME_MAX.
// No imports, so pixels.js (BAND[0].name) can read it.
export const DEFAULT_NAME = 'Princess';
export const NAME_MAX = 12;
const NAME_KEY = 'pianopad.name';

export const cleanName = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();

let cached;
export function playerName() {
  if (cached === undefined) {
    try { cached = cleanName(localStorage.getItem(NAME_KEY)); } catch { cached = ''; }
  }
  return cached || DEFAULT_NAME;
}
export const hasOwnName = () => playerName() !== DEFAULT_NAME;

// Returns the stored name ('' = back to the default).
export function setPlayerName(s) {
  cached = cleanName(s);
  try {
    if (cached) localStorage.setItem(NAME_KEY, cached); else localStorage.removeItem(NAME_KEY);
  } catch { /* storage unavailable: kept for this load */ }
  return cached;
}
