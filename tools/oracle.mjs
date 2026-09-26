// Offline "hindsight" note tracker, used as a stand-in for ground truth when
// judging the real-time detector on recordings. It may look ahead: an attack
// is a broadband energy jump that peaks within the next ~50 ms, or a jump in
// the salience of the note that's sounding (a re-strike); the note is the
// most salient pitch over the 40-160 ms after the attack.
//   import { oracleNotes, decode } from './oracle.mjs'
import { execFileSync } from 'node:child_process';

export function decode(file, sr = 48000) {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Per-frame features: energy (dB), and per-semitone salience (MIDI lo..hi).
export function analyze(x, sr = 48000, { N = 4096, hop = 240, lo = 40, hi = 96 } = {}) {
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.max(0, Math.floor((x.length - N) / hop));
  const binHz = sr / N;
  const db = new Float32Array(frames), sal = [];
  const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2);
  for (let f = 0; f < frames; f++) {
    // Frame f is centred at f*hop + N/2; we index frames by that centre.
    for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let e = 0;
    for (let k = 0; k < N / 2; k++) { const m2 = re[k] * re[k] + im[k] * im[k]; mag[k] = Math.sqrt(Math.sqrt(m2)); if (k * binHz > 80 && k * binHz < 5000) e += m2; }
    db[f] = 10 * Math.log10(e + 1e-12);
    const s = new Float32Array(hi - lo + 1);
    for (let m = lo; m <= hi; m++) {
      const f0 = hz(m);
      let v = 0;
      for (let h = 1; h <= 10; h++) {
        const fh = h * f0 * Math.sqrt(1 + 0.0004 * h * h);
        if (fh > 5000) break;
        const a = Math.floor((fh * 0.975) / binHz), b = Math.ceil((fh * 1.025) / binHz);
        let mx = 0;
        for (let k = a; k <= b; k++) if (mag[k] > mx) mx = mag[k];
        v += (mx * (f0 + 27)) / (h * f0 + 320);
      }
      s[m - lo] = v;
    }
    sal.push(s);
  }
  return { db, sal, hop, N, sr, lo, hi, frames };
}

// Dominant note in frame f, preferring a lower note that explains nearly as
// much (the winner may be an overtone).
function dominant(A, f) {
  const s = A.sal[f];
  let best = 0;
  for (let i = 1; i < s.length; i++) if (s[i] > s[best]) best = i;
  for (const h of [2, 3, 4]) {
    const j = Math.round(best - 12 * Math.log2(h));
    if (j >= 0 && s[j] >= 0.75 * s[best]) { best = j; break; }
  }
  return { midi: A.lo + best, sal: s[best] };
}

// Onset strength from short frames: log-spectral flux (vs 10 ms earlier),
// with the log scale normalized to the whole recording's loudest frame.
function fluxCurve(x, sr, hop) {
  const N = 1024, win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.max(0, Math.floor((x.length - N) / hop));
  const binHz = sr / N, k0 = Math.ceil(100 / binHz), k1 = Math.floor(5000 / binHz);
  const re = new Float32Array(N), im = new Float32Array(N);
  const mags = [];
  const edb = new Float32Array(frames); // short-window energy (dB)
  let peak = 1e-9;
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const m = new Float32Array(k1 - k0);
    let e = 0;
    for (let k = k0; k < k1; k++) { m[k - k0] = Math.hypot(re[k], im[k]); e += m[k - k0] * m[k - k0]; if (m[k - k0] > peak) peak = m[k - k0]; }
    edb[f] = 10 * Math.log10(e + 1e-12);
    mags.push(m);
  }
  const L = mags.map((m) => m.map((v) => Math.log(1 + (1000 * v) / peak)));
  const flux = new Float32Array(frames);
  for (let f = 2; f < frames; f++) { let s = 0; const a = L[f], b = L[f - 2]; for (let k = 0; k < a.length; k++) { const d = a[k] - b[k]; if (d > 0) s += d; } flux[f] = s; }
  // Frame f covers samples [f*hop, f*hop+N); an attack shows up about as it
  // reaches the frame's middle, so report times ~10 ms earlier than its end
  // (calibrated on synthesized notes).
  return { flux, edb, frames, t: (f) => (f * hop + N) / sr - 0.011 };
}

export function oracleNotes(x, sr = 48000) {
  const hop = 240, F = (ms) => Math.round((ms / 1000) * sr / hop);
  const A = analyze(x, sr, { hop });
  const O = fluxCurve(x, sr, hop);
  const floor = [...A.db].sort((a, b) => a - b)[Math.floor(A.db.length * 0.1)] ?? -100;
  const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; };
  const onsets = [];
  for (let f = F(20); f < O.frames - F(160); f++) {
    const v = O.flux[f];
    // Local peak within ±30 ms, above the surrounding second's typical level.
    let isPeak = true;
    for (let k = f - F(30); k <= f + F(30) && isPeak; k++) if (k !== f && O.flux[k] > v) isPeak = false;
    if (!isPeak) continue;
    const around = O.flux.subarray(Math.max(0, f - F(500)), Math.min(O.frames, f + F(500)));
    const med = median(around);
    const mad = median(around.map((u) => Math.abs(u - med)));
    if (v < med + 4 * mad + 0.5) continue;
    // Attacks get louder; key releases (dampers) are sharp changes that get
    // quieter.
    let before = Infinity, after = -Infinity;
    for (let k = f - F(30); k < f - F(2); k++) before = Math.min(before, O.edb[k]);
    for (let k = f; k <= f + F(40); k++) after = Math.max(after, O.edb[k]);
    if (after - before < 1.5) continue;
    // Loud enough (long-window energy near this time, looking ahead).
    const af = Math.max(0, Math.round((O.t(f) * sr - A.N / 2) / hop));
    let pk = -Infinity;
    for (let k = af; k <= Math.min(A.frames - 1, af + F(60)); k++) pk = Math.max(pk, A.db[k]);
    if (pk < floor + 12) continue;
    if (onsets.length && f - onsets[onsets.length - 1].f < F(60)) continue;
    onsets.push({ f, af, strength: v / (med + 1e-6), level: pk - floor });
  }
  // Label each with the most salient note over 40-160 ms after the attack.
  return onsets.map((o) => {
    const votes = new Map();
    for (let k = o.af + F(40); k <= Math.min(A.frames - 1, o.af + F(160)); k++) { const d = dominant(A, k); votes.set(d.midi, (votes.get(d.midi) ?? 0) + d.sal); }
    const [midi, v] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? [];
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    return { time: O.t(o.f), midi, stability: total ? v / total : 0, strength: o.strength, level: o.level };
  });
}
