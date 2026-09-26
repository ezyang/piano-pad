// Real-time onset + pitch detector for a (monophonic) acoustic piano.
//
// Pure JS with no Web Audio dependency: the same code runs inside an
// AudioWorklet and in the Node bench. Feed it samples with process(); it calls
// onEvent with:
//   {type: 'onset', sample, detectedAt, flux}           -- as soon as an attack is seen
//   {type: 'pitch', sample, detectedAt, f0, midi, cents, clarity}  -- a few tens of ms later
//   {type: 'frame', sample, flux, thr, db, floorDb}     -- per hop, only if debug is set
// All sample positions are absolute sample indices (see `pos`).
//
// Onsets: log-magnitude spectral flux against the spectrum a couple of hops
// back, with an adaptive threshold and a noise-floor gate. Flux is what catches
// legato note changes; a parallel frame-energy-rise test catches soft notes in
// broadband noise, where per-bin noise fluctuation swamps the flux. The reported onset
// sample is refined by looking for the jump in high-frequency energy.
// Pitch: McLeod pitch method (NSDF) over a window starting just after the onset.
// When the previous note is still sounding, instead: subtract the spectrum
// just before the attack from the one just after, and pick the note whose
// harmonics best explain the new energy (harmonic salience, Klapuri-style
// weights so sub-octaves score lower).

export const DEFAULTS = {
  fftSize: 512,
  hop: 128,
  fluxLag: 2, // compare against the spectrum this many hops back
  thresholdK: 5, // adaptive threshold: mean + K * std of recent flux
  minFlux: 8,
  riseK: 5, // energy-rise path: rise (dB over fluxLag hops) > mean + K * std
  minRiseDb: 4,
  // Base the rise threshold's statistics on upward jumps only. Otherwise the
  // sharp drops when dampers land (real pianos) inflate it to 15-20 dB and
  // the next quick note can't clear it.
  riseOneSided: true,
  // Normalize spectral flux by the recent loudest level, so it doesn't
  // depend on how loud the mic hears the piano.
  fluxNormalize: true,
  fluxRefFloor: 0.03, // limits how much quiet input gets amplified
  refractoryMs: 60,
  gateDb: 10, // frame must be this far above the tracked noise floor
  lowCutHz: 150, // ignore rumble/hum below this for onset purposes
  pitchWindows: [1024, 2048], // at 48 kHz; scaled for other rates
  pitchSkip: 64, // skip the first bit of hammer noise
  minF0: 60,
  maxF0: 2200,
  clarity: 0.85,
  // If the note before is still ringing (energy before the attack within this
  // many dB of after), plain autocorrelation can lock onto the mixture; with
  // overlapAware, a spectral "what's new" estimate over a longer window may
  // override it. Tuned on synthesized audio only, and suspected of hurting
  // on a real piano, so it's off by default until tuned on recordings.
  overlapAware: false,
  overlapDb: -17,
  specWindow: 2048, // at 48 kHz
  debug: false,
};

const GAMMA = 1000; // log compression: log(1 + GAMMA * |X|), |X| = 1 for a full-scale sine

export class PianoDetector {
  constructor(sampleRate, opts = {}) {
    Object.assign(this, DEFAULTS, opts);
    this.sr = sampleRate;
    const s = sampleRate / 48000;
    this.pitchWindows = this.pitchWindows.map((w) => Math.round(w * s));
    this.specWindow = Math.round(this.specWindow * s);
    this.bufSize = 16384;
    this.mask = this.bufSize - 1;
    this.buf = new Float32Array(this.bufSize);
    this.pos = 0; // absolute index of the next sample to be written
    this.sinceHop = 0;

    const N = this.fftSize;
    this.win = new Float32Array(N);
    let wsum = 0;
    for (let i = 0; i < N; i++) wsum += this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    this.magScale = 2 / wsum;
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.fft = makeFFT(N);
    this.nb = N / 2;
    this.k0 = Math.max(1, Math.round((this.lowCutHz * N) / sampleRate));
    this.hist = Array.from({ length: this.fluxLag + 1 }, () => new Float32Array(this.nb));
    this.frames = 0;

    this.fluxRef = 1;
    this.peakDecay = 10 ** (-6 / 20 * (this.hop / sampleRate));
    this.fMean = 0;
    this.fVar = 0;
    this.rMean = 0;
    this.rVar = 0;
    this.dbHist = new Float32Array(this.fluxLag + 1);
    this.statAlpha = 1 - Math.exp(-this.hop / (0.3 * sampleRate));
    this.floorDb = null;
    this.floorRise = (3 * this.hop) / sampleRate; // dB per hop (3 dB/s)
    this.lastOnset = -Infinity;
    this.refractory = Math.round((this.refractoryMs / 1000) * sampleRate);
    this.jobs = [];
    this.pwin = new Float32Array(Math.max(...this.pitchWindows));
    this.nsdf = new Float32Array(Math.max(...this.pitchWindows));
    this.hp = biquadHighpass(80, sampleRate);
    this.specN = 4096;
    this.specFFT = makeFFT(this.specN);
    this.specRe = new Float32Array(this.specN);
    this.specIm = new Float32Array(this.specN);
    this.specPre = new Float32Array(this.specN / 2);
    this.specPost = new Float32Array(this.specN / 2);
    this.specWin = new Float32Array(this.specWindow);
    for (let i = 0; i < this.specWindow; i++) this.specWin[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.specWindow);
    this.onEvent = () => {};
  }

  process(x) {
    const { buf, mask, hop } = this;
    for (let i = 0; i < x.length; i++) {
      buf[this.pos & mask] = x[i];
      this.pos++;
      if (++this.sinceHop === hop) {
        this.sinceHop = 0;
        this._frame();
        if (this.jobs.length) this._runJobs();
      }
    }
  }

  _frame() {
    const { fftSize: N, buf, mask, re, im, win, nb } = this;
    const end = this.pos;
    for (let i = 0; i < N; i++) {
      re[i] = buf[(end - N + i) & mask] * win[i];
      im[i] = 0;
    }
    this.fft(re, im);

    const cur = this.hist[this.frames % this.hist.length];
    const prev = this.hist[(this.frames + 1) % this.hist.length]; // fluxLag frames ago
    let energy = 0;
    let flux = 0;
    for (let k = this.k0; k < nb; k++) {
      const m2 = re[k] * re[k] + im[k] * im[k];
      energy += m2;
      const lm = Math.log(1 + (GAMMA * this.magScale * Math.sqrt(m2)) / this.fluxRef);
      cur[k] = lm;
      const d = lm - prev[k];
      if (d > 0) flux += d;
    }
    const db = 10 * Math.log10(energy * this.magScale * this.magScale + 1e-12);
    if (this.fluxNormalize) {
      // Track the recent loudest frame (peak hold, decaying 6 dB/s) as the
      // reference level for the next frame's flux.
      const amp = Math.sqrt(energy) * this.magScale;
      this.peakAmp = Math.max(amp, (this.peakAmp ?? amp) * this.peakDecay);
      this.fluxRef = Math.min(1, Math.max(this.fluxRefFloor, this.peakAmp / 0.3)); // only ever boost quiet input
    }
    this.dbHist[this.frames % this.dbHist.length] = db;
    const rise = db - this.dbHist[(this.frames + 1) % this.dbHist.length];
    this.frames++;

    if (this.floorDb === null) this.floorDb = db;
    else if (db < this.floorDb) this.floorDb = db;
    else this.floorDb += this.floorRise;

    const thr = Math.max(this.minFlux, this.fMean + this.thresholdK * Math.sqrt(this.fVar));
    const rThr = Math.max(this.minRiseDb, this.rMean + this.riseK * Math.sqrt(this.rVar));
    // Let the adaptive statistics and level reference settle before
    // reporting attacks (a quarter second).
    const warm = this.frames > Math.max(this.hist.length + 4, (0.25 * this.sr) / this.hop);
    if (warm && (flux > thr || rise > rThr) && db > this.floorDb + this.gateDb && end - this.lastOnset > this.refractory) {
      const onset = this._refineOnset(end);
      this.lastOnset = end;
      this.onEvent({ type: 'onset', sample: onset, detectedAt: end, flux });
      this.jobs.push({ onset, w: 0 });
    }
    if (this.debug) this.onEvent({ type: 'frame', sample: end, flux, thr, rise, rThr, db, floorDb: this.floorDb });

    // Update stats, clamping so an attack doesn't blow up the thresholds.
    const a = this.statAlpha;
    let d = Math.min(flux, thr) - this.fMean;
    this.fMean += a * d;
    this.fVar = (1 - a) * (this.fVar + a * d * d);
    d = (this.riseOneSided ? Math.min(Math.max(rise, 0), rThr) : Math.max(-rThr, Math.min(rise, rThr))) - this.rMean;
    this.rMean += a * d;
    this.rVar = (1 - a) * (this.rVar + a * d * d);
  }

  // Find where the high-frequency energy jumps in the recent past.
  _refineOnset(end) {
    const { buf, mask } = this;
    const B = 32;
    const span = this.fftSize + this.hop * this.fluxLag;
    const nBlocks = Math.floor(span / B);
    const start = end - nBlocks * B;
    const e = new Float32Array(nBlocks);
    let peak = 0, peakAt = 0;
    for (let b = 0; b < nBlocks; b++) {
      let s = 0;
      for (let i = 0; i < B; i++) {
        const n = start + b * B + i;
        const d = buf[n & mask] - buf[(n - 1) & mask];
        s += d * d;
      }
      e[b] = s;
      if (s > peak) { peak = s; peakAt = b; }
    }
    if (peakAt === 0) return start;
    // Baseline = median before the peak (robust to a still-ringing note), then
    // walk back from the peak through the contiguous rise.
    const pre = Array.from(e.subarray(0, peakAt)).sort((x, y) => x - y);
    const base = pre[pre.length >> 1];
    const lvl = base + 0.15 * (peak - base);
    let b = peakAt;
    while (b > 0 && e[b - 1] >= lvl) b--;
    return start + b * B;
  }

  _runJobs() {
    for (let j = 0; j < this.jobs.length; j++) {
      const job = this.jobs[j];
      const from = job.onset + this.pitchSkip;
      if (!job.r1) {
        const W = this.pitchWindows[job.w];
        if (this.pos < from + W) continue;
        if (job.old === undefined && this.overlapAware) {
          // Is the previous note still ringing? If so, remember its pitch.
          const W0 = this.pitchWindows[0];
          const ringing = this._energy(job.onset - 32 - W0, W0) > this._energy(from, W0) * 10 ** (this.overlapDb / 10);
          const r0 = ringing ? this._pitch(job.onset - 32 - this.pitchWindows[1], this.pitchWindows[1]) : null;
          job.ringing = ringing;
          job.old = r0 && r0.clarity >= 0.8 ? r0 : null;
        }
        const res = this._pitch(from, W);
        const last = job.w === this.pitchWindows.length - 1;
        if (res && (res.clarity >= this.clarity || last)) job.r1 = res;
        else if (last) job.r1 = { f0: 0, midi: null, cents: 0, clarity: 0 };
        else { job.w++; continue; }
      }
      let out = job.r1;
      // Arbitrate when a note is still ringing: always if we know its pitch,
      // and otherwise when r1 looks like a mixture's low common period.
      if (this.overlapAware && job.r1.midi != null && (job.old || (job.ringing && job.r1.midi < 48))) {
        if (this.pos < from + this.specWindow) continue; // need the longer window
        const sp = this._spectralPitch(job.onset);
        const { sal, ...picked } = this._arbitrate(job.r1, job.old, sp);
        out = { ...picked, why: { r1: job.r1.midi, old: job.old?.midi, sp: sp?.midi } };
      }
      this.onEvent({ type: 'pitch', sample: job.onset, detectedAt: this.pos, ...out });
      this.jobs.splice(j--, 1);
    }
  }

  // With the previous note still ringing, autocorrelation (r1) can report the
  // old note or a common sub-harmonic of both; the spectral estimate (sp)
  // can report an overtone on a re-strike. Decide between them.
  _arbitrate(r1, old, sp) {
    if (!sp) return r1;
    const pc = (m) => ((m % 12) + 12) % 12;
    const harmonic = (hi, lo) => { const r = hi / lo; return r > 1.5 && r < 8.5 && Math.abs(r - Math.round(r)) < 0.03 * Math.round(r); };
    // r1 is the common period of the old and new notes (e.g. C3 under G4 + C5).
    const commonPeriod = old && harmonic(old.f0, r1.f0);
    if (pc(sp.midi) === pc(r1.midi)) return commonPeriod && sp.f0 > r1.f0 * 1.5 ? sp : r1; // agree; pick the octave
    if (old && pc(r1.midi) === pc(old.midi)) {
      // r1 heard the old note. If the new energy still fits the old note well
      // (or sp is one of its overtones), the same key was struck again;
      // otherwise a new, quieter note came in under it.
      const restrike = harmonic(sp.f0, old.f0) || (sp.sal[old.midi] ?? 0) >= 0.5 * sp.sal[sp.midi];
      return restrike ? r1 : sp;
    }
    if (commonPeriod) return sp;
    // sp is an overtone of r1, or r1 a phantom sub-harmonic of sp. If r1 is
    // real, the new energy explains it nearly as well as sp (it includes r1's
    // own fundamental); a phantom scores far lower.
    if (harmonic(sp.f0, r1.f0)) return (sp.sal[r1.midi] ?? 0) >= 0.6 * sp.sal[sp.midi] ? r1 : sp;
    return r1.clarity >= 0.9 ? r1 : sp;
  }

  _energy(from, W) {
    let e = 0;
    for (let i = 0; i < W; i++) { const v = this.buf[(from + i) & this.mask]; e += v * v; }
    return e;
  }

  // Magnitude spectrum of buf[from, from + specWindow), Hann, zero-padded.
  _spectrum(from, out) {
    const { specRe: re, specIm: im, specWin: win, buf, mask } = this;
    re.fill(0); im.fill(0);
    for (let i = 0; i < win.length; i++) re[i] = buf[(from + i) & mask] * win[i];
    this.specFFT(re, im);
    for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k], im[k]);
    return out;
  }

  _spectralPitch(onset) {
    const W = this.specWindow;
    const post = this._spectrum(onset + this.pitchSkip, this.specPost);
    const pre = this._spectrum(onset - 32 - W, this.specPre);
    let eNew = 0, ePost = 0;
    for (let k = 0; k < post.length; k++) {
      const d = post[k] - pre[k];
      pre[k] = d > 0 ? d : 0; // reuse as the "new energy" spectrum
      eNew += pre[k] * pre[k];
      ePost += post[k] * post[k];
    }
    // A re-strike of the same key barely changes the spectrum's shape; then
    // the whole post-attack spectrum is the best evidence.
    const spec = eNew > 0.02 * ePost ? pre : post;
    for (let k = 0; k < spec.length; k++) spec[k] = Math.sqrt(spec[k]);
    const binHz = this.sr / this.specN;
    let best = -1, bestS = 0;
    const salience = this.salience ??= new Float32Array(128);
    salience.fill(0);
    for (let m = 33; m <= 100; m++) {
      const f = 440 * 2 ** ((m - 69) / 12);
      if (f < this.minF0 || f > this.maxF0) continue;
      let sal = 0;
      for (let hh = 1; hh <= 12; hh++) {
        const fh = hh * f * Math.sqrt(1 + 0.0004 * hh * hh);
        if (fh > 5000) break;
        const lo = Math.floor((fh * 0.97) / binHz), hi = Math.min(spec.length - 1, Math.ceil((fh * 1.03) / binHz));
        let mx = 0;
        for (let k = lo; k <= hi; k++) if (spec[k] > mx) mx = spec[k];
        sal += (mx * (f + 27)) / (hh * f + 320);
      }
      salience[m] = sal;
      if (sal > bestS) { bestS = sal; best = m; }
    }
    if (best < 0) return null;
    // If a note an octave, twelfth, ... below explains the new energy almost
    // as well, the winner was probably one of its overtones.
    let fund = best;
    for (const hh of [2, 3, 4, 5]) {
      const m = Math.round(best - 12 * Math.log2(hh));
      if (m >= 33 && salience[m] >= 0.75 * bestS && salience[m] > salience[fund] * (fund === best ? 0 : 1)) fund = m;
    }
    best = fund;
    return { f0: 440 * 2 ** ((best - 69) / 12), midi: best, cents: 0, clarity: 0.8, method: 'spectral', sal: salience };
  }

  // McLeod pitch method on buf[from, from + W).
  _pitch(from, W) {
    const x = this.pwin, n = this.nsdf, { buf, mask, sr } = this;
    // 2nd-order Butterworth high-pass at ~80 Hz to keep hum/rumble out.
    const { b0, b1, b2, a1, a2 } = this.hp;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < W; i++) {
      const v = buf[(from + i) & mask];
      const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      x[i] = y;
    }
    const minLag = Math.max(2, Math.floor(sr / this.maxF0));
    const maxLag = Math.min(Math.floor(W / 2), Math.ceil(sr / this.minF0));
    let m = 0;
    for (let i = 0; i < W; i++) m += 2 * x[i] * x[i];
    for (let tau = 0; tau <= maxLag; tau++) {
      if (tau > 0) m -= x[tau - 1] * x[tau - 1] + x[W - tau] * x[W - tau];
      let acf = 0;
      for (let i = 0; i < W - tau; i++) acf += x[i] * x[i + tau];
      n[tau] = m > 0 ? (2 * acf) / m : 0;
    }
    // Key maxima: highest point in each positive lobe after the first zero crossing.
    const peaks = [];
    let tau = 1;
    while (tau < maxLag && n[tau] > 0) tau++;
    let best = -1, bestV = -Infinity, inLobe = false;
    for (; tau < maxLag; tau++) {
      if (n[tau] > 0) {
        inLobe = true;
        if (n[tau] > bestV) { bestV = n[tau]; best = tau; }
      } else if (inLobe) {
        if (best >= minLag) peaks.push(best);
        inLobe = false; best = -1; bestV = -Infinity;
      }
    }
    if (inLobe && best >= minLag && best < maxLag) peaks.push(best);
    if (!peaks.length) return null;
    let top = 0;
    for (const p of peaks) top = Math.max(top, n[p]);
    const pick = peaks.find((p) => n[p] >= 0.9 * top);
    const a = n[pick - 1], b = n[pick], c = n[pick + 1];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const f0 = sr / (pick + shift);
    const midiF = 69 + 12 * Math.log2(f0 / 440);
    const midi = Math.round(midiF);
    return { f0, midi, cents: Math.round((midiF - midi) * 100), clarity: b - 0.25 * (a - c) * shift };
  }
}

function biquadHighpass(fc, sr) {
  const w = (2 * Math.PI * fc) / sr, q = Math.SQRT1_2;
  const alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

// In-place iterative radix-2 complex FFT.
function makeFFT(N) {
  const levels = Math.log2(N);
  const rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float32Array(N / 2), sin = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / N);
    sin[i] = Math.sin((2 * Math.PI * i) / N);
  }
  return (re, im) => {
    for (let i = 0; i < N; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cos[k] + im[b] * sin[k];
          const ti = -re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}
