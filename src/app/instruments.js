// Offline band rendering: the song played by each unlocked band member.
import { renderNote, midiToHz, mulberry32 } from '../synth.js';
import { layout, totalBeats } from './music.js';

function addTone(out, start, sr, len, f, amp, decay, shape) {
  const n = Math.min(out.length - start, Math.round(len * sr));
  const w = (2 * Math.PI * f) / sr;
  const k = Math.exp(-1 / (decay * sr));
  let env = amp;
  for (let i = 0; i < n; i++) {
    const ph = w * i;
    let v;
    if (shape === 'square') v = Math.sin(ph) > 0 ? 0.5 : -0.5;
    else if (shape === 'bell') v = Math.sin(ph) + 0.35 * Math.sin(3 * ph) + 0.15 * Math.sin(5.4 * ph);
    else v = Math.sin(ph);
    const atk = Math.min(1, i / (0.004 * sr));
    const rel = i > n - 0.02 * sr ? (n - i) / (0.02 * sr) : 1;
    out[start + i] += v * env * atk * rel;
    env *= k;
  }
}

function drums(out, sr, beats, beat, t0, rng) {
  for (let b = 0; b < beats; b++) {
    const s = Math.round((t0 + b * beat) * sr);
    const bar = b % 4;
    if (bar === 0 || bar === 2) {
      // kick: pitch-swept sine
      const n = Math.round(0.18 * sr);
      let ph = 0;
      for (let i = 0; i < n && s + i < out.length; i++) {
        const f = 50 + 90 * Math.exp(-i / (0.03 * sr));
        ph += (2 * Math.PI * f) / sr;
        out[s + i] += 0.5 * Math.sin(ph) * Math.exp(-i / (0.07 * sr));
      }
    } else {
      // snare: noise burst
      const n = Math.round(0.15 * sr);
      for (let i = 0; i < n && s + i < out.length; i++) out[s + i] += 0.18 * (rng() * 2 - 1) * Math.exp(-i / (0.04 * sr));
    }
    // hats on every half beat
    for (const h of [0, 0.5]) {
      const hs = Math.round((t0 + (b + h) * beat) * sr);
      let prev = 0;
      for (let i = 0; i < 0.03 * sr && hs + i < out.length; i++) {
        const x = rng() * 2 - 1;
        out[hs + i] += 0.05 * (x - prev) * Math.exp(-i / (0.008 * sr));
        prev = x;
      }
    }
  }
}

// members: array of instrument names. Returns {audio, lead} where lead is
// the time (s) before the first beat.
export function renderBand(song, members, sr) {
  const beat = 60 / song.bpm;
  const lead = 0.3;
  const beats = Math.ceil(totalBeats(song.notes) / 4) * 4 || 4;
  const out = new Float32Array(Math.ceil((lead + beats * beat + 2) * sr));
  const rng = mulberry32(5);
  const laid = layout(song.notes).filter((n) => n.p != null);
  for (const inst of members) {
    if (inst === 'drums') { drums(out, sr, beats, beat, lead, rng); continue; }
    for (const n of laid) {
      const t = lead + n.start * beat, len = n.d * beat;
      const s = Math.round(t * sr);
      if (inst === 'piano') renderNote(out, s, { midi: n.p, vel: 0.7, dur: len * 0.95 }, sr, rng);
      else if (inst === 'bass') renderNote(out, s, { midi: n.p - 24, vel: 0.8, dur: len * 0.9 }, sr, rng);
      else if (inst === 'musicbox') addTone(out, s, sr, len + 0.4, midiToHz(n.p + 12), 0.12, 0.35, 'bell');
      else if (inst === 'chip') addTone(out, s, sr, len * 0.9, midiToHz(n.p + 12), 0.08, 2, 'square');
    }
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.85 / peak;
  return { audio: out, lead };
}

// A short happy jingle for celebrations.
export function renderJingle(sr) {
  const out = new Float32Array(Math.round(1.2 * sr));
  [72, 76, 79, 84].forEach((m, i) => addTone(out, Math.round(i * 0.1 * sr), sr, 0.5, midiToHz(m), 0.12, 0.25, 'square'));
  return out;
}

// Woodblock-ish count-in tick; accented ticks are higher.
export function renderTick(sr, accent = false) {
  const out = new Float32Array(Math.round(0.06 * sr));
  addTone(out, 0, sr, 0.05, accent ? 2000 : 1500, 0.35, 0.012, 'sine');
  return out;
}
