// Offline band rendering: the song played by each unlocked band member.
import { renderNote, midiToHz, mulberry32 } from '../synth.js';
import { layout, totalBeats, meter } from './music.js';
import { arrange } from './arrange.js';

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

// The surprise guests' voices (pixels.js GUESTS), one note at midi:
//   meow  Kitty sings: slides up into each note, a little vibrato, and
//         brightens then softens like "mee-ow"
//   horn  Sparky's toy trumpet: buzzy harmonics, soft attack
//   xylo  Waddles's xylophone: a short wooden ding with a click
function guestNote(out, start, sr, len, midi, kind) {
  const n = Math.min(out.length - start, Math.round(len * sr));
  const f0 = midiToHz(midi);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const rel = i > n - 0.03 * sr ? (n - i) / (0.03 * sr) : 1;
    let v;
    if (kind === 'meow') {
      const glide = 2 ** ((-3 * Math.exp(-t / 0.05)) / 12);
      const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.15);
      ph += (2 * Math.PI * f0 * glide * vib) / sr;
      const u = Math.min(1, t / Math.max(0.05, len));
      const bright = 0.15 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.4));
      v = 0.1 * Math.min(1, t / 0.03) * (Math.sin(ph) + bright * Math.sin(2 * ph) + 0.4 * bright * Math.sin(3 * ph));
    } else if (kind === 'horn') {
      ph += (2 * Math.PI * f0) / sr;
      let x = 0;
      for (let k = 1; k <= 6; k++) x += Math.sin(k * ph) / k;
      v = 0.08 * Math.min(1, t / 0.035) * (0.75 + 0.25 * Math.exp(-t / 0.3)) * x;
    } else { // xylo
      ph += (2 * Math.PI * f0) / sr;
      v = 0.14 * Math.exp(-t / 0.13) * Math.sin(ph) + 0.06 * Math.exp(-t / 0.03) * Math.sin(3.9 * ph) +
        (i < 0.002 * sr ? 0.05 * (1 - i / (0.002 * sr)) : 0);
    }
    out[start + i] += v * rel;
  }
}

// In 4/4 kick on 1 and 3, snare on 2 and 4; in 3/4 (perBar 3) kick on 1,
// snare on 2 and 3, a waltz.
function drums(out, sr, beats, beat, t0, rng, perBar = 4) {
  for (let b = 0; b < beats; b++) {
    const s = Math.round((t0 + b * beat) * sr);
    const bar = b % perBar;
    if (bar === 0 || (perBar === 4 && bar === 2)) {
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
      const amp = perBar === 3 ? 0.13 : 0.18; // a waltz's pah-pah, lighter
      for (let i = 0; i < n && s + i < out.length; i++) out[s + i] += amp * (rng() * 2 - 1) * Math.exp(-i / (0.04 * sr));
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

// Roary's big low drum (timpani): a tuned boom, the strike's thump, then
// the ringing partials of a kettle drum (1, 1.5, 2, 2.4 × f), dropping a
// little in pitch as it starts.
function boom(out, start, sr, midi, len) {
  const f0 = midiToHz(midi), n = Math.min(out.length - start, Math.round(Math.min(len + 0.5, 1.6) * sr));
  const parts = [[1, 1, 0.8], [1.5, 0.45, 0.45], [1.98, 0.25, 0.3], [2.44, 0.12, 0.2]];
  const ph = parts.map(() => 0);
  let lp = 0, seed = 7;
  for (let i = 0; i < n; i++) {
    const t = i / sr, glide = 1 + 0.03 * Math.exp(-t / 0.04);
    let v = 0;
    parts.forEach(([r, a, d], k) => { ph[k] += (2 * Math.PI * f0 * r * glide) / sr; v += a * Math.exp(-t / d) * Math.sin(ph[k]); });
    seed = (seed * 16807) % 2147483647;
    lp += 0.08 * ((seed / 2147483647) * 2 - 1 - lp); // the mallet's thump: low noise
    v += 2.5 * lp * Math.exp(-t / 0.02);
    const atk = Math.min(1, i / (0.003 * sr)), rel = i > n - 0.05 * sr ? (n - i) / (0.05 * sr) : 1;
    out[start + i] += 0.22 * v * atk * rel;
  }
}
// Timpani range: G2..F♯3.
const kettle = (p) => 43 + ((((p - 43) % 12) + 12) % 12);

// Mix levels: brings each instrument alone to about -22 dB RMS.
const GAIN = { piano: 2.07, bass: 1.35, drums: 1.74, musicbox: 2.16, chip: 2.92, meow: 1.23, horn: 1.72, xylo: 2.8, timpani: 1.25 };

// Voices that play the tune an octave up (the guests and Blobby's chip).
const HIGH_TUNE = ['chip', 'meow', 'xylo'];
// The music box's harmony sits a little under the tune voices.
const HARMONY_GAIN = 0.7;
const BOX_LOW = 45; // A2

// members: array of instrument names. Returns {audio, lead} where lead is
// the time (s) before the first beat. opts.boost (dB): louder, through a
// look-ahead peak limiter instead of the tanh (for the party, which has to
// carry over a talking room on iPad speakers). opts.arrange: a band
// arrangement (arrange.js; the party) instead of everyone on the tune: the
// piano and the guest play the tune, the bass the chords' roots (and
// fifths), the music box a third under the tune (an octave up when a
// guest sings the tune up there, so the tune stays on top); drums as ever.
// In 3/4 (song.beats 3) the arrangement is a waltz: the piano adds an
// oom-pah-pah (arrange.js `waltz`) under the tune, the bass plays beat 1
// only, the drums kick on 1 and tap 2 and 3.
// song may carry `sharps`, `key`, `chords`, `beats` for arrange.js.
export function renderBand(song, members, sr, { boost = 0, arrange: arranged = false } = {}) {
  const beat = 60 / song.bpm;
  const lead = 0.3;
  const perBar = meter(song);
  const beats = Math.ceil(totalBeats(song.notes) / perBar) * perBar || perBar;
  const out = new Float32Array(Math.ceil((lead + beats * beat + 2) * sr));
  const rng = mulberry32(5);
  const laid = layout(song.notes).filter((n) => n.p != null);
  const parts = arranged ? arrange(song) : null;
  const boxUp = members.some((m) => HIGH_TUNE.includes(m)) ? 12 : 0;
  for (const inst of members) {
    // Each instrument renders into its own buffer and is mixed at a fixed
    // level, so any one of them alone is about equally loud.
    const buf = new Float32Array(out.length);
    const at = (n) => [lead + n.start * beat, n.d * beat];
    if (inst === 'drums') drums(buf, sr, beats, beat, lead, rng, perBar);
    else if (inst === 'timpani') {
      // The chords' roots (the bass line's notes) in the party; elsewhere
      // a boom on each bar's first note.
      const hits = parts ? parts.bass : laid.filter((n, i) => i === 0 || Math.floor(n.start / perBar + 1e-9) !== Math.floor(laid[i - 1].start / perBar + 1e-9));
      for (const n of hits) { const [t, len] = at(n); boom(buf, Math.round(t * sr), sr, kettle(n.p), len); }
    }
    else if (parts && inst === 'bass') for (const n of parts.bass) {
      const [t, len] = at(n);
      renderNote(buf, Math.round(t * sr), { midi: n.p, vel: 0.8, dur: len * 0.9 }, sr, rng);
    } else if (parts && inst === 'musicbox') for (const n of parts.harmony) {
      if (n.p + boxUp < BOX_LOW) continue; // too low for a music box: it rests
      const [t, len] = at(n);
      addTone(buf, Math.round(t * sr), sr, len + 0.4, midiToHz(n.p + boxUp), 0.12 * HARMONY_GAIN, 0.35, 'bell');
    } else for (const n of laid) {
      const [t, len] = at(n);
      const s = Math.round(t * sr);
      if (inst === 'piano') renderNote(buf, s, { midi: n.p, vel: 0.7, dur: len * 0.95 }, sr, rng);
      else if (inst === 'bass') renderNote(buf, s, { midi: n.p - 24, vel: 0.8, dur: len * 0.9 }, sr, rng);
      else if (inst === 'musicbox') addTone(buf, s, sr, len + 0.4, midiToHz(n.p + 12), 0.12, 0.35, 'bell');
      else if (inst === 'chip') addTone(buf, s, sr, len * 0.9, midiToHz(n.p + 12), 0.08, 2, 'square');
      else if (inst === 'meow') guestNote(buf, s, sr, len * 0.92, n.p + 12, 'meow');
      else if (inst === 'horn') guestNote(buf, s, sr, len * 0.9, n.p, 'horn');
      else if (inst === 'xylo') guestNote(buf, s, sr, Math.min(len, 0.6) + 0.1, n.p + 12, 'xylo');
    }
    // The piano's oom-pah-pah (3/4 only): the oom a little firmer than the pahs.
    if (parts && inst === 'piano') for (const w of parts.waltz) {
      const [t] = at(w), oom = w.ps.length === 1;
      for (const p of w.ps) renderNote(buf, Math.round(t * sr), { midi: p, vel: oom ? 0.55 : 0.35, dur: beat * (oom ? 0.8 : 0.45) }, sr, rng);
    }
    const g = GAIN[inst] ?? 1;
    for (let i = 0; i < out.length; i++) out[i] += g * buf[i];
  }
  // Fixed levels (not normalized per mix, which made a solo instrument as
  // loud as the whole band), then a soft limiter for the full band.
  if (boost) limit(out, 10 ** (boost / 20), sr);
  else for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]);
  return { audio: out, lead };
}

// Gain then a clean peak limiter (no waveshaping): the gain dips ~5 ms
// ahead of a peak and recovers over ~80 ms, never letting a sample past
// `ceil` (-1 dBFS).
export function limit(x, gain, sr, ceil = 0.89) {
  const n = x.length, env = new Float32Array(n);
  const kA = Math.exp(-1 / (0.002 * sr)), kR = Math.exp(-1 / (0.08 * sr));
  let e = 1;
  for (let i = n - 1; i >= 0; i--) {
    const a = Math.abs(x[i]) * gain;
    e = Math.min(a > ceil ? ceil / a : 1, 1 - (1 - e) * kA);
    env[i] = e;
  }
  e = 1;
  for (let i = 0; i < n; i++) {
    e = Math.min(env[i], 1 - (1 - e) * kR);
    x[i] *= gain * e;
  }
}

// A phrase in one voice at its written pitch (for call and response):
// notes [{d, p}], timbre 'chip' | 'bell' | 'piano'. Returns {audio, lead,
// starts, soundEnd}: each note's start time and when the sound has died
// away (s from the beginning of `audio`; the buffer itself runs longer).
export function renderVoice(notes, bpm, timbre, sr) {
  const beat = 60 / bpm, lead = 0.15;
  const laid = layout(notes);
  const out = new Float32Array(Math.ceil((lead + totalBeats(notes) * beat + 1) * sr));
  const rng = mulberry32(9);
  const starts = [];
  for (const n of laid) {
    const t = lead + n.start * beat;
    starts.push(t);
    if (n.p == null) continue;
    const s = Math.round(t * sr), len = n.d * beat * 0.9;
    if (timbre === 'piano') renderNote(out, s, { midi: n.p, vel: 0.95, dur: len }, sr, rng);
    else if (timbre === 'bell') addTone(out, s, sr, len + 0.3, midiToHz(n.p), 0.25, 0.4, 'bell');
    else addTone(out, s, sr, len, midiToHz(n.p), 0.18, 2, 'square');
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 1.5);
  return { audio: out, lead, starts, soundEnd: lead + totalBeats(notes) * beat + 0.35 };
}

// A short happy jingle for celebrations.
export function renderJingle(sr) {
  const out = new Float32Array(Math.round(1.2 * sr));
  [72, 76, 79, 84].forEach((m, i) => addTone(out, Math.round(i * 0.1 * sr), sr, 0.5, midiToHz(m), 0.12, 0.25, 'square'));
  return out;
}

// A smaller "ta-da" (two notes) for halfway moments, e.g. the first time
// through a piece played twice; the jingle stays the bigger one.
export function renderYay(sr) {
  const out = new Float32Array(Math.round(0.8 * sr));
  [76, 84].forEach((m, i) => addTone(out, Math.round(i * 0.14 * sr), sr, 0.45, midiToHz(m), 0.1, 0.25, 'square'));
  return out;
}

// The bunny hopping into its house (before the first piece): two little boings, then
// a sparkly "home!" (about a second).
export function renderBunnyHop(sr) {
  const out = new Float32Array(Math.round(1.4 * sr));
  [[0, 74], [0.05, 81], [0.32, 76], [0.37, 83]].forEach(([t, m]) => addTone(out, Math.round(t * sr), sr, 0.12, midiToHz(m), 0.09, 0.05, 'square'));
  [84, 88, 91, 96].forEach((m, i) => addTone(out, Math.round((0.7 + i * 0.07) * sr), sr, 0.5, midiToHz(m), 0.16, 0.18, 'bell'));
  return out;
}

// The lion waking up (lion.js): a big, friendly ROAR, about 1.6 s. A
// buzzy low voice that swoops up and back down, rumbling (a fast wobble in
// its loudness), with breath noise on top, then a little happy grumble.
export function renderRoar(sr) {
  const T = 1.6, out = new Float32Array(Math.round((T + 0.3) * sr));
  const rng = mulberry32(13);
  let ph = 0, lp = 0, bp = 0;
  for (let i = 0; i < T * sr; i++) {
    const t = i / sr, u = t / T;
    const f = 95 + 110 * Math.sin(Math.PI * Math.min(1, u * 1.25)) ** 1.5; // up, then down
    ph += (2 * Math.PI * f) / sr;
    let saw = 0;
    for (let k = 1; k <= 12; k++) saw += Math.sin(k * ph) / k;
    const env = Math.min(1, t / 0.12) * (u < 0.7 ? 1 : (1 - u) / 0.3);
    const rumble = 0.6 + 0.4 * Math.sin(2 * Math.PI * 27 * t);
    const x = rng() * 2 - 1;
    lp += 0.25 * (x - lp); bp = lp - bp * 0.3;
    out[i] += env * (0.22 * saw * rumble + 0.1 * bp * (0.4 + u));
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(1.6 * out[i]) * 0.8;
  return out;
}

// A snare drum roll, getting faster and louder, for `secs` (the surprise
// guest's reveal), with a cymbal-ish crash at the end.
export function renderDrumroll(sr, secs = 1.8) {
  const out = new Float32Array(Math.round((secs + 0.8) * sr));
  const rng = mulberry32(11);
  for (let t = 0, k = 0; t < secs; k++) {
    const u = t / secs, s = Math.round(t * sr);
    for (let i = 0; i < 0.06 * sr && s + i < out.length; i++) out[s + i] += (0.05 + 0.13 * u) * (rng() * 2 - 1) * Math.exp(-i / (0.018 * sr));
    t += 0.09 - 0.05 * u + (k % 2 ? 0.004 : 0);
  }
  const s = Math.round(secs * sr);
  let prev = 0;
  for (let i = 0; s + i < out.length; i++) {
    const x = rng() * 2 - 1;
    out[s + i] += 0.22 * (x - 0.6 * prev) * Math.exp(-i / (0.25 * sr));
    prev = x;
  }
  return out;
}

// Woodblock-ish count-in tick; accented ticks are higher.
export function renderTick(sr, accent = false) {
  const out = new Float32Array(Math.round(0.06 * sr));
  addTone(out, 0, sr, 0.05, accent ? 2000 : 1500, 0.35, 0.012, 'sine');
  return out;
}
