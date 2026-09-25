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

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export const getState = () => state;
export const getSong = (id) => state.songs.find((s) => s.id === id);

export function newSong() {
  const n = state.songs.filter((s) => s.by !== 'teacher').length + 1;
  const song = { id: 's' + Date.now().toString(36), title: `My Song ${n}`, by: 'me', bpm: 80, notes: [], band: 1, plays: 0 };
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
