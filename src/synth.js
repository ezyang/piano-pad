// Offline piano-ish synthesizer used as a stand-in for a real acoustic piano
// when testing the detector. Pure JS (no Web Audio) so it runs in Node too.
//
// Models the features that matter for detection: inharmonic partials, a sharp
// hammer attack with a noise thump, two-stage decay, detuned unison strings
// (beating), and dampers on key release.

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Small deterministic PRNG so runs are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix one note into `out` starting at sample `start`.
export function renderNote(out, start, note, sr, rng) {
  const { midi, vel = 0.7, dur = 0.5 } = note;
  const f0 = midiToHz(midi);
  const B = 0.0003 * 2 ** ((midi - 60) / 18); // inharmonicity, grows in treble
  const hammer = 0.12 + 0.02 * rng(); // strike position along the string
  const sustainTau = Math.min(15, Math.max(0.4, 12 * 2 ** (-(midi - 21) / 15)));
  const releaseTau = midi < 40 ? 0.15 : 0.05;
  const release = Math.round(dur * sr);
  const len = Math.min(out.length - start, release + Math.round(6 * releaseTau * sr));
  if (len <= 0) return;

  const alpha = 2.4 - 1.4 * vel; // louder = brighter
  const fmax = Math.min(0.45 * sr, 9000);
  const partials = [];
  let norm = 0;
  for (let n = 1; n <= 60; n++) {
    const fn = n * f0 * Math.sqrt(1 + B * n * n);
    if (fn > fmax) break;
    let a = n ** -alpha * (0.2 + Math.abs(Math.sin(Math.PI * n * hammer)));
    if (n === 1 && midi < 48) a *= 0.3 + (0.7 * (midi - 21)) / 27; // weak bass fundamentals
    partials.push({ fn, a, n });
    norm += a * a;
  }
  const gain = (0.3 * vel ** 1.5) / Math.sqrt(norm);
  const kRel = Math.exp(-1 / (releaseTau * sr));

  for (const { fn, a, n } of partials) {
    const tau2 = sustainTau / (1 + 0.2 * (n - 1));
    const tau1 = Math.min(tau2 / 6, 0.3);
    const k1 = Math.exp(-1 / (tau1 * sr));
    const k2 = Math.exp(-1 / (tau2 * sr));
    const kAtk = Math.exp(-1 / ((0.002 / Math.sqrt(n)) * sr));
    for (let s = 0; s < 2; s++) {
      const cents = (s ? 1 : -1) * (0.2 + 0.8 * rng());
      const w = (2 * Math.PI * fn * 2 ** (cents / 1200)) / sr;
      let ph = rng() * 2 * Math.PI;
      let e1 = 0.3 * a * gain;
      let e2 = 0.2 * a * gain;
      let atk = 1;
      let rel = 1;
      for (let i = 0; i < len; i++) {
        out[start + i] += (e1 + e2) * (1 - atk) * rel * Math.sin(ph);
        ph += w;
        e1 *= k1;
        e2 *= k2;
        atk *= kAtk;
        if (i >= release) rel *= kRel;
      }
    }
  }

  // Hammer thump: short burst of low-passed noise.
  const kThump = Math.exp(-1 / (0.005 * sr));
  let env = 0.15 * vel ** 2;
  let lp = 0;
  const n = Math.min(len, Math.round(0.04 * sr));
  for (let i = 0; i < n; i++) {
    lp += 0.2 * (rng() * 2 - 1 - lp);
    out[start + i] += env * lp;
    env *= kThump;
  }
}

// events: [{time (s), midi, dur (s), vel}]
export function renderSequence(events, { sr = 48000, tail = 1.0, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const end = Math.max(0, ...events.map((e) => e.time + e.dur)) + tail;
  const out = new Float32Array(Math.ceil(end * sr));
  for (const e of events) renderNote(out, Math.round(e.time * sr), e, sr, rng);
  return out;
}

// Cheap Schroeder reverb (in place). wet in [0, 1].
export function addReverb(buf, sr, wet = 0.25) {
  if (wet <= 0) return buf;
  const combs = [29.7, 37.1, 41.1, 43.7].map((ms) => ({
    d: new Float32Array(Math.round((ms / 1000) * sr)), i: 0, lp: 0,
  }));
  const aps = [5.0, 1.7].map((ms) => ({ d: new Float32Array(Math.round((ms / 1000) * sr)), i: 0 }));
  const fb = 0.84, damp = 0.3, g = 0.5;
  for (let n = 0; n < buf.length; n++) {
    const x = buf[n];
    let y = 0;
    for (const c of combs) {
      const out = c.d[c.i];
      c.lp = out * (1 - damp) + c.lp * damp;
      c.d[c.i] = x + c.lp * fb;
      c.i = (c.i + 1) % c.d.length;
      y += out;
    }
    y *= 0.25;
    for (const a of aps) {
      const bufOut = a.d[a.i];
      const v = y + bufOut * g;
      a.d[a.i] = v;
      a.i = (a.i + 1) % a.d.length;
      y = bufOut - v * g;
    }
    buf[n] = x + wet * y;
  }
  return buf;
}

// Pink noise plus a little mains hum at the given level (dBFS RMS), in place.
export function addNoise(buf, sr, dbfs, seed = 99) {
  if (dbfs <= -120) return buf;
  const rng = mulberry32(seed);
  const amp = 10 ** (dbfs / 20);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let n = 0; n < buf.length; n++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    const hum = 0.3 * Math.sin((2 * Math.PI * 60 * n) / sr);
    buf[n] += amp * (pink * 1.6 + hum);
  }
  return buf;
}

export function scale(buf, db) {
  const g = 10 ** (db / 20);
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}
