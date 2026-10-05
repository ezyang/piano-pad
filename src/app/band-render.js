// The band's whole-piece render takes seconds (the piano and bass partials;
// ~2.7 s for Ode on a laptop, more on an iPad), which used to freeze the
// party screen between the tap and any response. Render in a worker and
// keep the results, so a screen can ask early and a replay is instant.
//   bandAudio(song, members, sr, opts) → Promise<{audio, lead}>
// Results are shared, never modified by callers (engine.play copies).
import { renderBand } from './instruments.js';

const cache = new Map();
const waiting = new Map();
let worker = null, broken = false;

function getWorker() {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('./band-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { waiting.get(data.key)?.resolve(data); waiting.delete(data.key); };
    worker.onerror = () => { // e.g. no module workers: render here instead
      broken = true; worker = null;
      for (const [, w] of waiting) w.resolve(w.local());
      waiting.clear();
    };
  } catch { broken = true; }
  return worker;
}

export function bandAudio(song, members, sr, opts = {}) {
  const s = { notes: song.notes, bpm: song.bpm };
  const key = JSON.stringify([s, members, sr, opts]);
  if (!cache.has(key)) {
    const local = () => renderBand(s, members, sr, opts);
    const p = new Promise((resolve) => {
      const w = getWorker();
      if (!w) { setTimeout(() => resolve(local()), 0); return; }
      waiting.set(key, { resolve, local });
      w.postMessage({ key, song: s, members, sr, opts });
    });
    cache.set(key, p);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
