// App state in localStorage. Most of it is disposable (see CLAUDE.md): a
// deploy may bump KEY and start fresh. Her character is the exception: it
// lives under its own key, kept across versions, clean slates and "Reset
// all data". It's a CHAR_W×CHAR_H array of CHAR_PALETTE indices (-1 = clear),
// so that format and the palette's order must never change (append colors
// only). It's mirrored into the state blob too, so old /v/ versions (which
// only read the blob) show her current character.
import { defaultCharacter, CHAR_W, CHAR_H } from './pixels.js';
import { PIECES } from './homework.js';

const KEY = 'pianopad.v1';
const CHARACTER_KEY = 'pianopad.character';

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
// Fill in anything missing from older or partial saves.
if (!Array.isArray(state.songs)) state.songs = fresh().songs;

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(CHARACTER_KEY, JSON.stringify(state.character));
  } catch { /* storage unavailable */ }
}

export const getState = () => state;
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

// Everything but her character.
export function resetAll() {
  state = { ...fresh(), character: state.character };
  save();
}
