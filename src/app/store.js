// Persistent app state in localStorage.
import { defaultCharacter } from './pixels.js';

const KEY = 'pianopad.v1';

const HOMEWORK = {
  id: 'homework-g',
  title: 'Homework: G',
  by: 'teacher',
  bpm: 80,
  notes: [
    { d: 2, p: 67 }, { d: 2, p: 67 },
    { d: 1, p: 67 }, { d: 1, p: 67 }, { d: 0.5, p: 67 }, { d: 0.5, p: 67 }, { d: 1, p: 67 },
  ],
  band: 1,
  plays: 0,
};

function fresh() {
  return { songs: [HOMEWORK], character: defaultCharacter() };
}

let state;
try {
  state = JSON.parse(localStorage.getItem(KEY)) ?? fresh();
} catch {
  state = fresh();
}
// Fill in anything missing from older or partial saves.
if (!Array.isArray(state.character) || !state.character.length) state.character = defaultCharacter();
if (!Array.isArray(state.songs)) state.songs = fresh().songs;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
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

export function resetAll() {
  state = fresh();
  save();
}
