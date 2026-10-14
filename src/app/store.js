// App state in localStorage. Most of it is disposable (see CLAUDE.md): a
// deploy may bump KEY and start fresh. Her character is the exception: it
// lives under its own key, kept across versions, clean slates and "Reset
// all data". It's a CHAR_W×CHAR_H array of CHAR_PALETTE indices (-1 = clear),
// so that format and the palette's order must never change (append colors
// only). It's mirrored into the state blob too, so old /v/ versions (which
// only read the blob) show her current character.
// Her jewels (jewels.js) are treated the same way, under their own key
// `pianopad.jewels`: [{ i: cell index, m: gem name }] (older saves have
// Build block names, shown as gems: pixels.js gemName), in the order
// she earned them; kept across clean slates and resets, mirrored into the
// blob. Painting over a jewel's cell removes it (charedit.js).
import { defaultCharacter, characterUrl, CHAR_W, CHAR_H, CHAR_PALETTE } from './pixels.js';
import { PIECES } from './homework.js';

const KEY = 'pianopad.v1';
const CHARACTER_KEY = 'pianopad.character';
const JEWELS_KEY = 'pianopad.jewels';

const HOMEWORK = { ...PIECES.g, band: 1, plays: 0 };

function fresh() {
  return { songs: [HOMEWORK], character: defaultCharacter() };
}

let state;
try {
  state = JSON.parse(localStorage.getItem(KEY)) ?? fresh();
} catch {
  state = fresh();
}
const isCharacter = (c) => Array.isArray(c) && c.length === CHAR_W * CHAR_H && c.every(Number.isInteger);
let kept = null;
try { kept = JSON.parse(localStorage.getItem(CHARACTER_KEY)); } catch { /* none yet */ }
// Her own key first; before it existed, the character lived in the blob.
state.character = [kept, state.character].find(isCharacter) ?? defaultCharacter();
// Copy it to its own key right away, so a clean slate can't catch it first.
if (!isCharacter(kept)) try { localStorage.setItem(CHARACTER_KEY, JSON.stringify(state.character)); } catch { /* storage unavailable */ }
const isJewels = (js) => Array.isArray(js) && js.every((j) => Number.isInteger(j?.i) && j.i >= 0 && j.i < CHAR_W * CHAR_H && typeof j.m === 'string');
let keptJewels = null;
try { keptJewels = JSON.parse(localStorage.getItem(JEWELS_KEY)); } catch { /* none yet */ }
state.jewels = [keptJewels, state.jewels].find(isJewels) ?? [];
// Fill in anything missing from older or partial saves.
if (!Array.isArray(state.songs)) state.songs = fresh().songs;

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(CHARACTER_KEY, JSON.stringify(state.character));
    localStorage.setItem(JEWELS_KEY, JSON.stringify(state.jewels));
  } catch { /* storage unavailable */ }
}

export const getState = () => state;
// Her character as an image, jewels and all.
export const meUrl = () => characterUrl(state.character, state.jewels);
export const getSong = (id) => state.songs.find((s) => s.id === id);

// by: 'me' (her own song) or 'teacher' (homework a grown-up enters).
export function newSong(by = 'me') {
  const n = state.songs.filter((s) => s.by === by).length + 1;
  const title = by === 'teacher' ? `Homework ${n}` : `My Song ${n}`;
  const song = { id: 's' + Date.now().toString(36), title, by, bpm: 80, notes: [], band: 1, plays: 0 };
  state.songs.push(song);
  save();
  return song;
}

export function deleteSong(id) {
  state.songs = state.songs.filter((s) => s.id !== id);
  save();
}

// Everything but her character (and her jewels).
export function resetAll() {
  state = { ...fresh(), character: state.character, jewels: state.jewels };
  save();
}

// --- Her character's history (2026-10-13: she wiped a picture she'd spent
// many sessions on, with no way back). `pianopad.characterHistory` holds
// her last HISTORY_MAX distinct versions, oldest first: [{ t, grid: text,
// jewels }], grid in the text format below. The Me screen remembers the
// picture when it opens, before every wipe and when she leaves, and its ↩️
// steps back through them (screens/me.js). Like the character itself, it's
// kept across clean slates and resets.
// Text format (also in the logs and the ⚙︎ "Restore her picture"): CHAR_H
// rows of CHAR_W characters, top row first, each a CHAR_PALETTE index in
// base 36 (0-9, a-f today; g-z if the palette grows) or '.' for clear,
// rows joined by '/' (newlines and spaces are fine when pasting).
const HISTORY_KEY = 'pianopad.characterHistory';
const HISTORY_MAX = 40;

export const charText = (grid) => Array.from({ length: CHAR_H }, (_, y) =>
  grid.slice(y * CHAR_W, (y + 1) * CHAR_W).map((v) => (v < 0 ? '.' : v.toString(36))).join('')).join('/');

// A grid from the text format, a JSON array of indices, or a log's
// `character` snapshot ({ grid, jewels }); null if it isn't one.
// Returns { grid, jewels? }.
export function parseCharacter(input) {
  const s = String(input ?? '').trim();
  try {
    const j = JSON.parse(s);
    if (isCharacter(j)) return { grid: j };
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const g = isCharacter(j.grid) ? j.grid : parseCharacter(j.grid)?.grid;
      if (g) return { grid: g, ...(isJewels(j.jewels) ? { jewels: j.jewels } : {}) };
      return null;
    }
    if (typeof j === 'string') return parseCharacter(j);
  } catch { /* not JSON: the text format */ }
  const rows = s.split(/[\s/,]+/).filter(Boolean);
  if (rows.length !== CHAR_H || rows.some((r) => r.length !== CHAR_W || !/^[0-9a-z.]+$/i.test(r))) return null;
  const grid = rows.join('').split('').map((ch) => (ch === '.' ? -1 : parseInt(ch, 36)));
  return grid.every((v) => v < CHAR_PALETTE.length) ? { grid } : null;
}

// What the logs carry: { grid: text, jewels }.
export const characterSnapshot = () => ({ grid: charText(state.character), jewels: state.jewels.map((j) => ({ ...j })) });

const sameJewels = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function characterHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(h) ? h.filter((e) => parseCharacter(e?.grid) && isJewels(e.jewels)) : [];
  } catch { return []; }
}
// Add the current picture (or the given one) as the newest version; the
// same version seen before moves to the end instead.
export function rememberCharacter(grid = state.character, jewels = state.jewels) {
  const text = charText(grid);
  const h = characterHistory().filter((e) => !(e.grid === text && sameJewels(e.jewels, jewels)));
  h.push({ t: new Date().toISOString(), grid: text, jewels: jewels.map((j) => ({ ...j })) });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_MAX))); } catch { /* storage unavailable */ }
}

// Replace her picture (the grown-ups' restore); the old one is remembered
// first, so ↩️ on the Me screen can bring it back.
export function restoreCharacter({ grid, jewels }) {
  rememberCharacter();
  state.character = [...grid];
  if (jewels) state.jewels = jewels.map((j) => ({ ...j }));
  save();
  rememberCharacter();
}
