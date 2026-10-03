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
  fluxRefDecayDb: 6, // how fast (dB/s) the loud-level reference relaxes after a loud note
  fluxRefTarget: 0.3, // the reference level maps to this amplitude
  // Confirmation before a note is announced (we wait for the pitch anyway):
  // the sound must get this many dB louder within confirmMs after the attack
  // (key releases and noise don't), and the same note re-triggering within
  // doubleMs is dropped (nobody restrikes a key that fast). 0 disables.
  confirmRiseDb: 0,
  confirmMs: 25,
  // 100 (2026-09-29): drops a classic trigger 60 ms after a real C3 in the
  // labeled Stairs session; nothing real lost anywhere (150 lost one).
  doubleMs: 100,
  refractoryMs: 60,
  gateDb: 10, // frame must be this far above the tracked noise floor
  lowCutHz: 150, // ignore rumble/hum below this for onset purposes
  pitchWindows: [1024, 2048], // at 48 kHz; scaled for other rates
  pitchSkip: 64, // skip the first bit of hammer noise
  minF0: 60,
  maxF0: 2200,
  clarity: 0.85,
  // If no window at the onset gives a clear pitch, retry this many ms later.
  pitchRetryMs: [], // e.g. [20, 40, 60]: calibration takes +8 right, +11 false; off pending labeled kid data
  retryRiseDb: 6, // ...and only if that pitch got this much louder than before the onset
  // McLeod's "k": take the shortest period whose NSDF peak is within this
  // fraction of the best one. Lower values favor octave-up errors.
  mpmK: 0.9,
  // Detected notes that should drop an octave when the lower period fits at
  // least as well and there's real energy at the lower fundamental (within
  // octaveDownDb). For keys whose fundamental is too weak on a particular
  // piano and mic; set by the piano profile (src/piano-profile.json).
  octaveDown: [],
  // How sharp (cents) each key reads at the attack on this piano, from the
  // piano profile. Rounding to keys centers on these.
  tuning: {},
  octaveDownDb: 30,
  // If the note before is still ringing (energy before the attack within this
  // many dB of after), plain autocorrelation can lock onto the mixture; with
  // overlapAware, a spectral "what's new" estimate over a longer window may
  // override it. Tuned on synthesized audio only, and suspected of hurting
  // on a real piano, so it's off by default until tuned on recordings.
  overlapAware: false,
  overlapDb: -17,
  specWindow: 2048, // at 48 kHz
  // Adult speech shows up as low "notes" (~120-180 Hz). A voice's pitch
  // wanders; a piano's holds. For notes below voiceBelow (midi), track the
  // pitch over the first ~45 ms after the attack and mark the note `voice`
  // if it moves more than voiceCents. On real recordings: real piano notes
  // at C3-G3 moved <= 25 cents; about half of the low detections moved more
  // than 40. Costs those notes ~20 ms of extra latency. 0 disables.
  voiceBelow: 60,
  voiceCents: 40,
  // Onset detection: 'dsp' (spectral flux + energy rise), 'templates' (NMF
  // with per-key spectral templates of this piano, see TemplateOnsets),
  // 'net' (a small network trained on her recordings, see NetOnsets), or
  // 'both' (dsp + templates). Profile-based modes need `templates` / `net`.
  onsets: 'dsp',
  templates: null,
  net: null, // onsets: 'net' — see NetOnsets
  netThr: 0.8,
  netAgg: 'max', // 'max': one key's score over netThr; 'any': the chance any key was struck;
  // 'both': 'max', plus weak onsets where only the chance any key was struck
  // passed netAnyThr (a strike split across a key and its harmonics); weak
  // onsets' notes must pass the attack-jump test (minJump) like classic ones.
  netAnyThr: 0.8,
  // With profile-based onsets, still run the dsp onsets and split the range:
  // notes below this (midi) come from dsp, the rest from the profile, which
  // has seen few low notes so far. One strike read by both paths becomes one
  // note (the first accepted wins). 0: profile only.
  lowDspBelow: 57,
  // ...but a dsp low note also needs the network to see some low-key
  // activity (max probability over keys below lowDspBelow) within
  // lowNetSpanMs of it (15 ms: as good as 30 in CV, and low notes then arrive
  // no later than the voice check allows, ~45 ms). Key and damper thumps just before an attack otherwise read as low
  // notes (seen in calibration takes).
  // Tuned on the parent's labels (2026-09-27): the real notes the network
  // missed were loud (-32..-48 dBFS over the first 40 ms, clarity 0.68-0.85);
  // the classic detector's junk was quiet (-57..-73). Absolute level: it's
  // her iPad in its usual place; if the iPad moves much closer, re-check.
  // Validated elsewhere: calibration takes 72/12/9 -> 73/11/11 (right/missed/
  // extra), loud D4s today 23 -> 83 of 134 (classic 82).
  dspFallbackClarity: 0.65, // 1: no fallback
  dspFallbackWaitMs: 100,
  dspFallbackMinDb: -50, // ...and at least this loud (RMS dBFS over 40 ms from the onset)
  // Reject a note whose pitch didn't get this much louder (dB) at its onset.
  // Parent's runs + calibration takes: real notes rose >= 6 dB (27/27 below
  // A3, 112/114 above); extras mostly didn't (median 3 dB).
  minToneRise: -99, // for classic-path notes (below A3 in net mode; all in classic mode)
  minToneRiseNet: -99, // for the network's notes
  // Reject a classic-path note (below A3, the loud fallback, classic mode)
  // unless its upper partials jumped at the onset (see _attackJump): the
  // classic onsets fire on noise while a note rings and re-read that note.
  // Parent-labeled whole session (Sep 28 Stairs): re-reads jumped <= 8 dB,
  // real strikes >= 16. 10 (2026-09-29): false notes there 24 -> 9,
  // calibration extras 11 -> 5, grown-up runs 6 -> 3, no real note lost.
  minJump: 10,
  // The verifier: a small learned model (tools/verifier/) that asks of each
  // candidate note "is there a new piano strike of this pitch here?" from the
  // spectrum around it (vPreMs before .. vPostMs after the onset). Needs the
  // network's spectrum (onsets 'net'). verifierRescue: rejection reasons the
  // verifier may overrule (it can always reject).
  verifier: null, // a Verifier, or a decoded model (see decodeVerifier)
  // Or: the profile's model (detector-node passes it to every detector) and
  // a switch, so only engines that ask for it turn it on.
  verifierModel: null,
  useVerifier: false,
  verifierThr: 0.5,
  vPreMs: 200,
  vPostMs: 15, // the model's own vPostMs wins
  verifierRescue: [],
  heavyPerBlock: 1, // see process(): Oct 1 replay, max block 5.5 -> 2.2 ms, +6 ms median latency
  jumpMs: 20, // look this long after the onset for the jump's peak
  lowNetMin: 0, // was 0.2; OFF (2026-09-27): it rejected her real D3 re-strikes (see charter)
  lowNetSpanMs: 15,
  // Tuned 2026-09-26 against Kong references, on recordings the templates
  // weren't learned from (tools/nn/nmf_proto.py, tools/ref-audit.mjs).
  tplIters: 5, // NMF iterations per frame (warm-started)
  tplRise: 0.22, // key activation jump, relative to the recent peak total
  tplShare: 0.15, // the key's share of all key activation at the attack
  tplFloorDb: -70,
  tplRefractoryMs: 100, // one strike can re-fire ~75 ms later; nobody plays 10 notes/s
  // When the app says which note it's waiting for (setExpect): the network,
  // if the profile has one, also watches just the expected key(s) with this
  // much lower bar, and readings of the expected letter skip the voice check
  // (they're marked `expected`; the engine accepts them at lower clarity).
  expectNetThr: 2, // >1: off. 0.3 caught more but added many false notes on the calibration takes
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

    const N = this.fftSize, hop = this.hop;
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
    this.dbHist = new Float32Array(1024); // recent frame energies, for confirmation
    this.endHist = new Float64Array(1024);
    this.lastNote = null; // { sample, midi } of the last confirmed note
    this.peakDecay = 10 ** ((-this.fluxRefDecayDb / 20) * (this.hop / sampleRate));
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
    this.voiceWin = Math.round(1024 * s);
    this.voiceStep = Math.round(256 * s);
    this.voiceSpan = this.voiceWin + 4 * this.voiceStep;
    this.driftN = new Float32Array(Math.ceil((1.25 * sampleRate) / this.minF0) + 4);
    this.specWin = new Float32Array(this.specWindow);
    for (let i = 0; i < this.specWindow; i++) this.specWin[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.specWindow);
    this.lastOnsetSample = -Infinity;
    if (this.useVerifier && this.verifierModel && !this.verifier) this.verifier = this.verifierModel;
    if (this.verifier && !(this.verifier instanceof Verifier)) this.verifier = new Verifier(this.verifier);
    if (this.verifier?.m.vPostMs) this.vPostMs = this.verifier.m.vPostMs;
    if (this.onsets === 'net' && this.net) this.tpl = new NetOnsets(this.net, sampleRate, this);
    else if (this.templates && (this.onsets === 'templates' || this.onsets === 'both')) this.tpl = new TemplateOnsets(this.templates, sampleRate, this);
    if (this.tpl) this.tplEvery = Math.max(1, Math.round(this.tpl.hop / hop));
    this.dspRole = !this.tpl || this.onsets === 'dsp' || this.onsets === 'both' ? 'all' : this.lowDspBelow > 0 ? 'low' : 'off';
    // The network as a helper for expected notes (in any onset mode).
    this.helper = this.expectNetThr > 1 ? null : this.tpl instanceof NetOnsets ? this.tpl : this.net ? new NetOnsets(this.net, sampleRate, this) : null;
    if (this.helper) this.helperEvery = Math.max(1, Math.round(this.helper.hop / hop));
    this.expect = null;
    this.lastExpSample = -Infinity;
    this.lastAcc = { sample: -Infinity, pc: -1 };
    this.lastTplSample = -Infinity;
    this.lastAcceptedNet = -Infinity;
    this.onEvent = () => {};
  }

  process(x) {
    const { buf, mask, hop } = this;
    for (let i = 0; i < x.length; i++) {
      buf[this.pos & mask] = x[i];
      this.pos++;
      if (++this.sinceHop === hop) {
        this.sinceHop = 0;
        // Heavy per-note steps (voice drift, attack jump, each verifier model)
        // done so far this hop: at most heavyPerBlock, so one audio block
        // never carries several. Late blocks on the iPad can lose input (Oct 1:
        // notes read a semitone sharp, the live clock fell behind the recording).
        this.heavy = 0;
        this._frame();
        if (this.jobs.length) this._runJobs();
      }
    }
  }

  // The note(s) the app is waiting for (midi numbers), or null.
  setExpect(midis) {
    const was = this.expect;
    this.expect = midis?.length ? { midis, pcs: new Set(midis.map((m) => ((m % 12) + 12) % 12)) } : null;
    if (!this.helper) return;
    // A helper that only runs while expecting starts from a clean context.
    if (!was && this.expect && this.helper !== this.tpl) this.helper.reset();
    this.helper.setExpect(this.expect ? midis.flatMap((m) => [m - 12, m, m + 12]) : null);
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
      this.fluxRef = Math.min(1, Math.max(this.fluxRefFloor, this.peakAmp / this.fluxRefTarget)); // only ever boost quiet input
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
    if (warm && this.dspRole !== 'off' && (flux > thr || rise > rThr) && db > this.floorDb + this.gateDb && end - this.lastOnset > this.refractory) {
      const onset = this._refineOnset(end);
      this.lastOnset = end;
      this.lastOnsetSample = onset;
      this.onEvent({ type: 'onset', sample: onset, detectedAt: end, flux });
      this.jobs.push({ onset, w: 0, via: 'dsp' });
    }
    if (this.tpl && this.frames % this.tplEvery === 0) {
      const found = this.tpl.frame(this.buf, this.mask, end);
      const since = found ? found.onset - (this.dspRole === 'all' ? Math.max(this.lastOnsetSample, this.lastTplSample) : this.lastTplSample) : 0;
      if (found && warm && since > (this.tplRefractoryMs / 1000) * this.sr) {
        const onset = found.onset;
        this.lastTplSample = onset;
        this.onEvent({ type: 'onset', sample: onset, detectedAt: end, flux: 0, via: this.onsets, key: found.key, ...(found.weak ? { weak: true } : {}) });
        this.jobs.push({ onset, w: 0, key: found.key, via: this.onsets, weak: found.weak });
      }
    }
    if (this.helper && this.expect && this.helper !== this.tpl && this.frames % this.helperEvery === 0) this.helper.frame(this.buf, this.mask, end);
    const ef = this.helper?.expFound;
    if (ef) {
      this.helper.expFound = null;
      const near = 0.06 * this.sr, refr = (this.tplRefractoryMs / 1000) * this.sr;
      if (warm && this.expect && ef.onset - this.lastExpSample > refr && Math.abs(ef.onset - this.lastOnsetSample) > near && Math.abs(ef.onset - this.lastTplSample) > near) {
        this.lastExpSample = ef.onset;
        this.onEvent({ type: 'onset', sample: ef.onset, detectedAt: end, flux: 0, via: 'expect', key: ef.key });
        this.jobs.push({ onset: ef.onset, w: 0, key: ef.key, via: 'expect' });
      }
    }
    this.dbHist[this.frames % this.dbHist.length] = db;
    this.endHist[this.frames % this.endHist.length] = end;
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
      let from = job.onset + this.pitchSkip;
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
        if (res && (res.clarity >= this.clarity || (last && !this.pitchRetryMs.length))) job.r1 = res;
        else if (!last) { job.w++; continue; }
        else {
          // No clear pitch yet: the onset may have fired on the finger/key
          // noise before the string sounds (~30 ms early on loud notes here).
          // Look again a little later before giving up.
          job.best = res && res.clarity > (job.best?.clarity ?? -1) ? res : job.best;
          job.retry ??= 0;
          const r = job.retry < this.pitchRetryMs.length ? Math.round((this.pitchRetryMs[job.retry] / 1000) * this.sr) : null;
          if (r != null) {
            const W0 = this.pitchWindows[0];
            if (this.pos < from + r + W0) continue;
            let again = this._pitch(from + r, W0);
            job.retry++;
            // Only a tone that started after the onset counts, not the previous
            // note still ringing (the onset may have been a key release).
            if (again && this._rawLevel(from + r, W0, again.f0) - this._rawLevel(job.onset - 32 - W0, W0, again.f0) < this.retryRiseDb) again = null;
            if (again && again.clarity > (job.best?.clarity ?? -1)) { job.best = again; job.bestFrom = from + r; }
            if (!(again && again.clarity >= this.clarity)) continue;
          }
          job.r1 = job.best ?? { f0: 0, midi: null, cents: 0, clarity: 0 };
          if (job.bestFrom != null && job.r1 === job.best) job.from = job.bestFrom;
        }
      }
      if (job.from != null) from = job.from; // pitch was found later in the note
      let out = job.r1;
      // Arbitrate when a note is still ringing: always if we know its pitch,
      // and otherwise when r1 looks like a mixture's low common period.
      if (this.overlapAware && job.r1.midi != null && (job.old || (job.ringing && job.r1.midi < 48))) {
        if (this.pos < from + this.specWindow) continue; // need the longer window
        const sp = this._spectralPitch(job.onset);
        const { sal, ...picked } = this._arbitrate(job.r1, job.old, sp);
        out = { ...picked, why: { r1: job.r1.midi, old: job.old?.midi, sp: sp?.midi } };
      }
      if (this.confirmRiseDb > 0 && this.pos < job.onset + (this.confirmMs / 1000) * this.sr) continue; // not yet
      const expected = !!(this.expect && out.midi != null && this.expect.pcs.has(((out.midi % 12) + 12) % 12));
      let voice;
      const C = (job.c ??= {}); // results kept while the job waits for its turn
      // (Expected notes used to skip this check: talking then advanced
      // homework whenever a vowel read as the expected note. 2026-09-28.)
      if (out.midi != null && out.midi < this.voiceBelow && out.f0 > 0) {
        if (this.pos < from + this.voiceSpan) continue; // need the longer look
        if (C.voice === undefined) {
          if (this.heavy >= this.heavyPerBlock) continue;
          C.voice = this._drift(from, out.f0) > this.voiceCents; this.heavy++;
        }
        voice = C.voice;
      }
      const lowDsp = this.dspRole === 'low' && job.via === 'dsp' && out.midi != null && out.midi < this.lowDspBelow;
      // A confident classic reading above lowDspBelow is a fallback for strikes
      // the network misses (her repeated D4s): wait for the network, then
      // keep it if the network registered nothing for this strike.
      const level = (C.level ??= this._rms(job.onset, Math.round(0.04 * this.sr)));
      // How much the detected pitch got louder at this onset (a new tone vs a
      // note still ringing from before).
      const W0 = this.pitchWindows[0];
      const toneRise = (C.toneRise ??= out.midi != null && out.f0 > 0 ? this._rawLevel(from, W0, out.f0) - this._rawLevel(job.onset - 32 - W0, W0, out.f0) : 0);
      const fallback = this.dspRole === 'low' && job.via === 'dsp' && out.midi != null && out.midi >= this.lowDspBelow &&
        out.clarity >= this.dspFallbackClarity && level >= this.dspFallbackMinDb;
      if (fallback && this.pos < job.onset + (this.dspFallbackWaitMs / 1000) * this.sr) continue;
      const span = (this.lowNetSpanMs / 1000) * this.sr;
      if (lowDsp && this.tpl.lowActivity && this.pos < job.onset + 1024 + span + this.tpl.hop) continue; // wait for the network's view
      let reject = this._confirm(job.onset, out.midi);
      // A note is a new tone: its pitch must get louder at the onset. Onsets on
      // key/action noise just before a strike (or a damper landing) re-read a
      // note that's still ringing, and that doesn't rise.
      if (!reject && out.midi != null && toneRise < (lowDsp || this.dspRole === 'all' ? this.minToneRise : this.minToneRiseNet)) reject = 'no-rise';
      const needV = (this.verifier || this.onCandidate) && out.midi != null && out.f0 > 0 && this.tpl instanceof NetOnsets;
      if (needV && this.tpl.hLastEnd < job.onset + Math.round((this.vPostMs / 1000) * this.sr) + this.tpl.spec.N / 2) continue;
      let jump;
      if (out.midi != null && out.f0 > 0 && this.minJump > -99 && (lowDsp || fallback || job.weak || this.dspRole === 'all')) {
        const need = job.onset + Math.round((this.jumpMs / 1000) * this.sr) + 1024;
        if (this.pos < need) continue; // wait for the window after the onset
        if (C.jump === undefined) {
          if (this.heavy >= this.heavyPerBlock) continue;
          C.jump = this._attackJump(job.onset, out.f0); this.heavy++;
        }
        jump = C.jump;
        if (!reject && jump < this.minJump) reject = 'no-jump';
      }
      const win = (this.tplRefractoryMs / 1000) * this.sr, pcOut = out.midi != null ? ((out.midi % 12) + 12) % 12 : -1;
      if (!reject && job.via === 'expect' && !expected) reject = 'unexpected'; // the helper only adds expected notes
      if (!reject && out.midi != null && job.via === 'expect' && pcOut === this.lastAcc.pc && Math.abs(job.onset - this.lastAcc.sample) < win) reject = 'dup';
      if (!reject && out.midi != null && this.dspRole === 'low') {
        const win = (this.tplRefractoryMs / 1000) * this.sr;
        if (fallback) { if (Math.abs(job.onset - this.lastAcceptedNet) < win) reject = 'dup'; }
        else if (job.via === 'dsp' && out.midi >= this.lowDspBelow) reject = 'high'; // the profile's range
        else if (job.via !== 'dsp' && out.midi < this.lowDspBelow) reject = 'low'; // dsp's range
        else if (lowDsp && Math.abs(job.onset - this.lastAcceptedNet) < win) reject = 'dup'; // the network already has it
        else if (lowDsp && this.tpl.lowActivity && this.tpl.lowActivity(job.onset, span) < this.lowNetMin) reject = 'no-net';
      }
      let vp;
      if (needV) {
        const f = (C.f ??= this._vfeat(job.onset, out.midi, [(out.midi - 60) / 12, out.clarity, job.via === 'dsp' ? 1 : 0, job.via === 'net' && !job.weak ? 1 : 0, job.weak ? 1 : 0, toneRise / 20, level / 20 + 3]));
        if (f && this.verifier) {
          // One model of the ensemble per heavy step.
          const ms = this.verifier.members ?? [this.verifier];
          C.vk ??= 0; C.vs ??= 0;
          while (C.vk < ms.length && this.heavy < this.heavyPerBlock) { C.vs += ms[C.vk++].run(f.x, f.s); this.heavy++; }
          if (C.vk < ms.length) continue;
          vp = C.vs / ms.length;
          if (!reject || this.verifierRescue.includes(reject)) reject = vp >= this.verifierThr ? null : 'verifier';
          if (!reject && voice && this.verifierRescue.includes('voice')) voice = false;
        }
        if (f && this.onCandidate) this.onCandidate({ onset: job.onset, midi: out.midi, f0: out.f0, clarity: out.clarity, via: job.via, key: job.key, weak: !!job.weak, reject: reject ?? null, voice: !!voice, level, toneRise, jump, vp, x: f.x, s: f.s });
      }
      if (!reject && out.midi != null) {
        this.lastNote = { sample: job.onset, midi: out.midi };
        if (out.clarity > 0.6) this.lastAcc = { sample: job.onset, pc: pcOut };
        if (out.clarity > 0.6 && job.via !== 'dsp') this.lastAcceptedNet = job.onset; // as the engine accepts notes
      }
      this.onEvent({ type: 'pitch', sample: job.onset, detectedAt: this.pos, ...out, ...(voice !== undefined ? { voice } : {}), ...(job.key != null ? { key: job.key } : {}), ...(job.via ? { via: job.via } : {}), ...(job.weak ? { weak: true } : {}), level: Math.round(level), toneRise: Math.round(toneRise), ...(jump !== undefined ? { jump: Math.round(jump) } : {}), ...(vp !== undefined ? { vp: +vp.toFixed(3) } : {}), ...(expected ? { expected } : {}), ...(reject ? { reject } : {}) });
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

  // Returns a rejection reason, or null if the note stands.
  _confirm(onset, midi) {
    if (this.doubleMs > 0 && midi != null && this.lastNote && this.lastNote.midi === midi &&
        onset - this.lastNote.sample < (this.doubleMs / 1000) * this.sr) return 'double';
    if (this.confirmRiseDb > 0) {
      const sr = this.sr, n = this.dbHist.length;
      let before = Infinity, after = -Infinity;
      for (let i = 0; i < Math.min(n, this.frames); i++) {
        const f = this.frames - 1 - i, end = this.endHist[f % n], db = this.dbHist[f % n];
        if (end < onset - 0.04 * sr) break;
        if (end <= onset - 0.002 * sr) before = Math.min(before, db);
        else if (end >= onset && end <= onset + (this.confirmMs / 1000) * sr) after = Math.max(after, db);
      }
      if (isFinite(before) && isFinite(after) && after - before < this.confirmRiseDb) return 'no-rise';
    }
    return null;
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

  // How far (cents) the pitch moves over buf[from, from + voiceSpan): NSDF
  // peaks near f0 in five overlapping windows, largest distance from the first.
  _drift(from, f0) {
    const { buf, mask, sr, voiceWin: W, voiceStep } = this;
    const lag = sr / f0, lo = Math.max(2, Math.floor(lag * 0.8)), hi = Math.ceil(lag * 1.25);
    const n = this.driftN;
    let first = 0, most = 0;
    for (let k = 0; k < 5; k++) {
      const s = from + k * voiceStep;
      for (let tau = lo - 1; tau <= hi + 1; tau++) {
        let acf = 0, m = 0;
        for (let i = 0; i < W - tau; i++) {
          const a = buf[(s + i) & mask], b = buf[(s + i + tau) & mask];
          acf += a * b; m += a * a + b * b;
        }
        n[tau] = m > 0 ? (2 * acf) / m : 0;
      }
      let best = lo;
      for (let tau = lo; tau <= hi; tau++) if (n[tau] > n[best]) best = tau;
      const a = n[best - 1], b = n[best], c = n[best + 1], den = a - 2 * b + c;
      const cents = 1200 * Math.log2(sr / (best + (den ? (0.5 * (a - c)) / den : 0)) / 440);
      if (k === 0) first = cents;
      else most = Math.max(most, Math.abs(cents - first));
    }
    return most;
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
    const pick = peaks.find((p) => n[p] >= this.mpmK * top);
    let res = this._peak(pick);
    // Piano profile: keys whose fundamental is so weak that they read an
    // octave high. If the period one octave down fits at least as well, take it.
    // A perfectly periodic note also repeats at twice its period, so require
    // real energy at the lower fundamental too.
    if (this.octaveDown.includes(res.midi)) {
      const lo = Math.floor(2 * pick * 0.97), hi = Math.min(maxLag - 1, Math.ceil(2 * pick * 1.03));
      let p2 = lo;
      for (let t = lo; t <= hi; t++) if (n[t] > n[p2]) p2 = t;
      if (n[p2] >= n[pick] && this._level(x, W, res.f0 / 2) > this._level(x, W, res.f0) - this.octaveDownDb) res = this._peak(p2);
    }
    return res;
  }

  // Loudness (dBFS, RMS) of buf[from, from + W).
  // The verifier's input for a candidate note at `onset` read as `midi`:
  // channels x frames of the network's log-frequency spectrum around the
  // onset (vPreMs before .. vPostMs after), in dB relative to the running
  // peak level: harmonics 1-8 of the note, the octave below and the two
  // neighbouring keys, 36 two-semitone bands, the frame total and the
  // spectral flux; plus scalars (`s0`, then the reference level).
  _vfeat(onset, midi, s0) {
    const net = this.tpl, K = net.hK, B = net.B, N = net.spec.N;
    const P = Math.round((this.vPreMs / 1000) * this.sr / net.hop), Q = Math.round((this.vPostMs / 1000) * this.sr / net.hop), T = P + Q + 1;
    let t0 = -1, best = Infinity;
    for (let t = net.t - 1; t >= Math.max(0, net.t - K); t--) {
      const d = Math.abs(net.hEnd[t % K] - N / 2 - onset);
      if (d < best) { best = d; t0 = t; } else break;
    }
    if (t0 < 0 || best > net.hop) return null;
    const C = VCHANNELS, x = new Float32Array(C * T), refDb = 20 * Math.log10(net.hRef[t0 % K] + 1e-9);
    const b0 = 3 * (midi - 40), cols = [];
    for (let h = 1; h <= 8; h++) cols.push(Math.round(b0 + 36 * Math.log2(h)));
    cols.push(b0 - 36, b0 - 3, b0 + 3);
    const db = new Float32Array(B), prev = new Float32Array(B);
    const n = (v) => Math.max(-5, Math.min(1, (v - refDb) / 20));
    for (let i = -1; i < T; i++) {
      const t = t0 - P + i, ok = t >= 0 && t > net.t - 1 - K && t < net.t;
      prev.set(db);
      for (let b = 0; b < B; b++) db[b] = ok ? 20 * Math.log10(net.hV[(t % K) * B + b] + 1e-7) : -140;
      if (i < 0) continue;
      let c = 0;
      for (const bc of cols) {
        let m = -140;
        for (let b = bc - 1; b <= bc + 1; b++) if (b >= 0 && b < B && db[b] > m) m = db[b];
        x[c++ * T + i] = n(m);
      }
      for (let k = 0; k < 36; k++) {
        let m = -140;
        for (let b = 6 * k; b < 6 * k + 6; b++) if (db[b] > m) m = db[b];
        x[c++ * T + i] = n(m);
      }
      x[c++ * T + i] = ok ? n(20 * Math.log10(net.hTot[t % K] + 1e-9)) : -5;
      let fl = 0;
      if (ok && i > 0) for (let b = 0; b < B; b++) { const d = db[b] - prev[b]; if (d > 0) fl += d; }
      x[c++ * T + i] = Math.min(5, fl / B / 2);
    }
    return { x, s: Float32Array.from([...s0, refDb / 20 + 3]) };
  }

  // How much the upper partials (harmonics 2-8 of f) jumped near an onset:
  // the largest rise from a trough before to a peak between 30 ms before and
  // jumpMs after it (the onset time can be off either way). A note that is
  // still ringing doesn't jump; a new strike does, even a re-strike of the
  // same key or one right after a neighbouring key (a short window can't
  // tell neighbouring fundamentals apart, but harmonics 2+ are farther).
  _attackJump(onset, f) {
    const W = 1024, hop = 240;
    const first = onset - Math.round(0.12 * this.sr), last = onset + Math.round((this.jumpMs / 1000) * this.sr);
    const peakFrom = onset - Math.round(0.03 * this.sr);
    const x = this.lvlBuf ??= new Float32Array(this.bufSize), L = [];
    if (!this.hann1024) { this.hann1024 = new Float32Array(W); for (let i = 0; i < W; i++) this.hann1024[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W); }
    const hann = this.hann1024, cs = [];
    for (let h = 2; h <= 8 && f * h < this.sr / 2; h++) cs.push(2 * Math.cos((2 * Math.PI * f * h) / this.sr));
    for (let t = first; t <= last; t += hop) {
      for (let i = 0; i < W; i++) x[i] = this.buf[(t + i) & this.mask] * hann[i];
      let e = 1e-20;
      for (const c of cs) { // Goertzel
        let s1 = 0, s2 = 0;
        for (let i = 0; i < W; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
        e += s1 * s1 + s2 * s2 - c * s1 * s2;
      }
      L.push(10 * Math.log10(e));
    }
    let best = -99, lo = Infinity, j = 0;
    for (let k = 0; k < L.length; k++) {
      const t = first + k * hop;
      while (j < L.length && first + j * hop + W <= t) lo = Math.min(lo, L[j++]); // windows wholly before this one
      if (t >= peakFrom && lo < Infinity) best = Math.max(best, L[k] - lo);
    }
    return best;
  }

  _rms(from, W) {
    let e = 0;
    for (let i = 0; i < W; i++) { const v = this.buf[(from + i) & this.mask]; e += v * v; }
    return 10 * Math.log10(e / W + 1e-12);
  }

  // Level (dB) of frequency f in buf[from, from + W), Hann-windowed.
  _rawLevel(from, W, f) {
    const x = this.lvlBuf ??= new Float32Array(this.bufSize);
    for (let i = 0; i < W; i++) x[i] = this.buf[(from + i) & this.mask];
    return this._level(x, W, f);
  }

  // Level (dB) of frequency f in x[0, W), Hann-windowed (Goertzel).
  _level(x, W, f) {
    const c = 2 * Math.cos((2 * Math.PI * f) / this.sr);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < W; i++) {
      const s0 = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W)) + c * s1 - s2;
      s2 = s1; s1 = s0;
    }
    return 10 * Math.log10(s1 * s1 + s2 * s2 - c * s1 * s2 + 1e-20);
  }

  // Pitch from the NSDF peak at lag p (parabolic interpolation).
  _peak(p) {
    const n = this.nsdf;
    const a = n[p - 1], b = n[p], c = n[p + 1];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const f0 = this.sr / (p + shift);
    const midiF = 69 + 12 * Math.log2(f0 / 440);
    let midi = Math.round(midiF);
    // Round to the nearest key as this piano reads (tuning: key -> cents).
    let best = Infinity;
    for (let k = midi - 1; k <= midi + 1; k++) {
      const d = Math.abs(midiF - k - (this.tuning[k] ?? 0) / 100);
      if (d < best) { best = d; midi = k; }
    }
    return { f0, midi, cents: Math.round((midiF - midi) * 100), clarity: b - 0.25 * (a - c) * shift };
  }
}

// Front end shared by the profile-based onset detectors: a 2048-point
// spectrum every `hop` samples, pooled into log-frequency bins (bps per
// semitone from MIDI lo to hi), so a profile learned at 48 kHz works at any
// sample rate. Must match tools/nn/nmf_proto.py.
class LogSpectrum {
  constructor({ lo, hi, bps, hop }, sr, detHop) {
    this.N = 2048;
    this.hop = Math.max(1, Math.round((hop * sr) / 48000 / detHop)) * detHop;
    this.B = (hi - lo) * bps;
    const N = this.N;
    this.win = new Float64Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    this.re = new Float32Array(N); this.im = new Float32Array(N);
    this.fft = makeFFT(N);
    // Triangles in log frequency, or linear interpolation where a log bin is
    // narrower than a linear one.
    const nb = N / 2 + 1, binHz = sr / N;
    this.lf = [];
    for (let i = 0; i < this.B; i++) {
      const c = 440 * 2 ** ((lo + i / bps - 69) / 12), half = 1 / (12 * bps);
      const idx = [], w = [];
      for (let k = 1; k < nb; k++) {
        const d = 1 - Math.abs(Math.log2((k * binHz) / c)) / half;
        if (d > 0) { idx.push(k); w.push(d); }
      }
      if (!idx.length) { const j = Math.ceil(c / binHz), t = (c - (j - 1) * binHz) / binHz; idx.push(j - 1, j); w.push(1 - t, t); }
      const sum = w.reduce((a, b) => a + b, 0);
      this.lf.push({ idx: Int32Array.from(idx), w: Float64Array.from(w.map((x) => x / sum)) });
    }
    this.v = new Float64Array(this.B);
  }

  // Spectrum of buf[end - N, end) into this.v; returns the total.
  frame(buf, mask, end) {
    const { N, re, im, win, v, B } = this;
    for (let i = 0; i < N; i++) { re[i] = buf[(end - N + i) & mask] * win[i]; im[i] = 0; }
    this.fft(re, im);
    let total = 0;
    for (let i = 0; i < B; i++) {
      const { idx, w } = this.lf[i];
      let m = 0;
      for (let j = 0; j < idx.length; j++) { const k = idx[j]; m += w[j] * Math.hypot(re[k], im[k]); }
      v[i] = m; total += m;
    }
    return total;
  }
}

// Onsets from a piano profile: a spectral template for each key of this
// piano (learned offline by tools/nn/nmf_proto.py from her recordings,
// labeled by a neural transcriber). Each frame is explained as a
// non-negative mix of key templates plus a few background ones (speech,
// noise); an attack is a sudden jump in one key's activation. That still
// works while earlier notes ring, where plain energy rise and flux don't.
class TemplateOnsets {
  constructor(profile, sr, o) {
    this.spec = new LogSpectrum(profile, sr, o.hop);
    this.hop = this.spec.hop;
    const { keys, W } = profile;
    this.keys = keys;
    this.K = keys.length; // key templates; the rest are background
    this.J = W.length;
    this.B = this.spec.B;
    this.W = W.map((c) => Float64Array.from(c));
    this.iters = o.tplIters; this.thrRise = o.tplRise; this.share = o.tplShare; this.floorDb = o.tplFloorDb;
    this.wh = new Float64Array(this.B); this.r = new Float64Array(this.B);
    this.h = new Float64Array(this.J).fill(1e-6);
    this.L = 3; // rise over this many frames
    this.hist = Array.from({ length: this.L + 1 }, () => new Float64Array(this.K));
    this.rise = Array.from({ length: 3 }, () => new Float64Array(this.K)); // t-2, t-1, t
    this.meta = Array.from({ length: 3 }, () => ({ start: 0, loud: -200, sum: 0, act: new Float64Array(this.K) }));
    this.ref = 1e-9;
    this.t = 0;
  }

  // Analyze the frame ending at `end`; returns {onset, key} for an attack
  // found one frame back (it has to be a local peak), or null.
  frame(buf, mask, end) {
    const { wh, r, h, W, K, J, B } = this;
    const total = this.spec.frame(buf, mask, end), v = this.spec.v, N = this.spec.N;
    // KL-NMF with fixed templates (columns sum to 1), warm-started.
    const floor = (total / J) * 1e-3;
    for (let j = 0; j < J; j++) if (h[j] < floor) h[j] = floor;
    for (let it = 0; it < this.iters; it++) {
      wh.fill(1e-12);
      for (let j = 0; j < J; j++) { const c = W[j], hj = h[j]; for (let i = 0; i < B; i++) wh[i] += c[i] * hj; }
      for (let i = 0; i < B; i++) r[i] = v[i] / wh[i];
      for (let j = 0; j < J; j++) { const c = W[j]; let s = 0; for (let i = 0; i < B; i++) s += c[i] * r[i]; h[j] *= s; }
    }
    let tot = 0, keySum = 0;
    for (let j = 0; j < J; j++) tot += h[j];
    for (let k = 0; k < K; k++) keySum += h[k];
    this.ref = Math.max(tot, this.ref * 0.995);
    // Rise of each key's activation over L frames, relative to the recent peak.
    const t = this.t++, cur = this.hist[t % this.hist.length], old = this.hist[(t + 1) % this.hist.length];
    cur.set(h.subarray(0, K));
    const [r2, r1, r0] = [this.rise[(t + 1) % 3], this.rise[(t + 2) % 3], this.rise[t % 3]]; // t-2, t-1, t
    for (let k = 0; k < K; k++) r0[k] = t >= this.L ? (cur[k] - old[k]) / this.ref : 0;
    const m0 = this.meta[t % 3];
    m0.start = end - N; m0.loud = 20 * Math.log10(total + 1e-12); m0.sum = keySum; m0.act.set(cur);
    if (t < 2) return null;
    // Decide about frame t-1.
    const m1 = this.meta[(t + 2) % 3];
    let k = 0;
    for (let q = 1; q < K; q++) if (r1[q] > r1[k]) k = q;
    const val = r1[k];
    if (val < this.thrRise || m1.loud < this.floorDb) return null;
    if (val < r2[k] || val < r0[k]) return null;
    if (m1.act[k] < this.share * m1.sum) return null;
    return { onset: m1.start + N / 2, key: this.keys[k] };
  }
}

// Onsets from a small network trained on her recordings (tools/nn/onset_mlp.py,
// labels from a neural transcriber): the last `ctx` log-spectrum frames ->
// one hidden layer -> per key, the chance it was just struck. Weights are
// int8 with one scale per unit (decodeNet turns the base64 into arrays).
class NetOnsets {
  constructor(net, sr, o) {
    this.spec = new LogSpectrum(net, sr, o.hop);
    this.hop = this.spec.hop;
    const B = this.spec.B;
    Object.assign(this, { B, ctx: net.ctx, H: net.hidden, keys: net.keys, K: net.keys.length, thr: o.netThr, anyThr: o.netAnyThr, floorDb: o.tplFloorDb });
    const d = decodeNet(net);
    this.W1 = d.W1; this.s1 = Float64Array.from(net.s1); this.b1 = Float64Array.from(net.b1);
    this.W2 = d.W2; this.s2 = Float64Array.from(net.s2); this.b2 = Float64Array.from(net.b2);
    this.x = new Float64Array(this.ctx * B); // oldest frame first
    this.hid = new Float64Array(this.H);
    this.p = Array.from({ length: 3 }, () => new Float64Array(this.K)); // t-2, t-1, t
    this.meta = Array.from({ length: 3 }, () => ({ start: 0, loud: -200 }));
    this.ref = 1e-9;
    this.t = 0;
    this.lowK = net.keys.filter((k) => k < o.lowDspBelow).length; // keys are ascending
    this.expThr = o.expectNetThr;
    this.agg = o.netAgg; this.any = new Float64Array(3);
    this.expK = null; // indices of expected keys, see setExpect
    this.expFound = null;
    this.lowHist = Array.from({ length: 16 }, () => ({ center: -Infinity, max: 0 }));
    // Recent spectra, for the verifier (PianoDetector._vfeat).
    this.hK = 128;
    this.hV = new Float32Array(this.hK * B);
    this.hEnd = new Float64Array(this.hK); this.hRef = new Float64Array(this.hK); this.hTot = new Float64Array(this.hK);
    this.hLastEnd = -Infinity;
  }

  setExpect(midis) {
    this.expK = midis ? midis.map((m) => this.keys.indexOf(m)).filter((k) => k >= 0) : null;
  }

  reset() {
    this.t = 0; this.ref = 1e-9; this.expFound = null;
    for (const p of this.p) p.fill(0);
  }

  // Highest probability of any key below lowDspBelow in frames centered
  // within `span` samples of `at`.
  lowActivity(at, span) {
    let m = 0;
    for (const f of this.lowHist) if (Math.abs(f.center - at) <= span && f.max > m) m = f.max;
    return m;
  }

  frame(buf, mask, end) {
    const { B, ctx, H, K, x, hid, W1, s1, b1, W2, s2, b2 } = this;
    const total = this.spec.frame(buf, mask, end), v = this.spec.v, N = this.spec.N;
    this.ref = Math.max(total, this.ref * 0.995);
    const t = this.t++;
    const slot = t % this.hK;
    this.hV.set(v, slot * B); this.hEnd[slot] = end; this.hRef[slot] = this.ref; this.hTot[slot] = total; this.hLastEnd = end;
    // Shift the context window and append log(1 + 1000 v / ref).
    if (t === 0) for (let c = 0; c < ctx - 1; c++) for (let i = 0; i < B; i++) x[c * B + i] = Math.log1p((1000 * v[i]) / (this.ref + 1e-9));
    x.copyWithin(0, B);
    for (let i = 0; i < B; i++) x[(ctx - 1) * B + i] = Math.log1p((1000 * v[i]) / (this.ref + 1e-9));
    const IN = ctx * B;
    for (let j = 0; j < H; j++) {
      let s = 0;
      const row = j * IN;
      for (let i = 0; i < IN; i++) s += W1[row + i] * x[i];
      s = s * s1[j] + b1[j];
      hid[j] = s > 0 ? s : 0;
    }
    const p0 = this.p[t % 3];
    for (let k = 0; k < K; k++) {
      let s = 0;
      const row = k * H;
      for (let j = 0; j < H; j++) s += W2[row + j] * hid[j];
      p0[k] = 1 / (1 + Math.exp(-(s * s2[k] + b2[k])));
    }
    const m0 = this.meta[t % 3];
    m0.start = end - N; m0.loud = 20 * Math.log10(total + 1e-12);
    const lh = this.lowHist[t % this.lowHist.length];
    lh.center = end - N / 2; lh.max = 0;
    for (let k = 0; k < this.lowK; k++) if (p0[k] > lh.max) lh.max = p0[k];
    // Key-agnostic attack score: the chance that at least one key was struck
    // (the network tends to split a strike across a key and its harmonics).
    let miss = 1;
    for (let k = 0; k < K; k++) miss *= 1 - p0[k];
    this.any[t % 3] = 1 - miss;
    if (t < 2) return null;
    const p2 = this.p[(t + 1) % 3], p1 = this.p[(t + 2) % 3], m1 = this.meta[(t + 2) % 3];
    // An expected key peaking one frame back, with a much lower bar.
    if (this.expK && m1.loud >= this.floorDb) {
      let bestK = -1;
      for (const q of this.expK) if (p1[q] >= this.expThr && p1[q] >= p2[q] && p1[q] >= p0[q] && (bestK < 0 || p1[q] > p1[bestK])) bestK = q;
      if (bestK >= 0) this.expFound = { onset: m1.start + N / 2, key: this.keys[bestK] };
    }
    let k = 0;
    for (let q = 1; q < K; q++) if (p1[q] > p1[k]) k = q;
    if (m1.loud < this.floorDb) return null;
    const anyPeak = (thr) => { const a0 = this.any[t % 3], a1 = this.any[(t + 2) % 3], a2 = this.any[(t + 1) % 3]; return a1 >= thr && a1 >= a2 && a1 >= a0; };
    if (this.agg === 'any') {
      if (!anyPeak(this.thr)) return null;
    } else if (p1[k] < this.thr || p1[k] < p2[k] || p1[k] < p0[k]) {
      if (this.agg === 'both' && anyPeak(this.anyThr)) return { onset: m1.start + N / 2, key: this.keys[k], weak: true };
      return null;
    }
    return { onset: m1.start + N / 2, key: this.keys[k] };
  }
}

const VCHANNELS = 8 + 3 + 36 + 2;

// The verifier network (trained by tools/verifier/train.py): three dilated
// 1-D convolutions over time (valid padding, ReLU), then the flattened
// result plus the scalars -> a hidden layer (ReLU) -> two logits: [a new
// piano strike here, a new strike of this pitch]. run() gives the chance of
// the second. Weights are plain float arrays.
export class Verifier {
  constructor(m) {
    this.m = m;
    // An ensemble ({ ensemble: [models] }) averages its members' chances.
    if (m.ensemble) { this.members = m.ensemble.map((x) => new Verifier(x)); return; }
    this.convs = m.convs.map((c) => ({ ...c, w: Float32Array.from(c.w), b: Float32Array.from(c.b) }));
    this.W1 = Float32Array.from(m.W1); this.b1 = Float32Array.from(m.b1);
    this.W2 = Float32Array.from(m.W2); this.b2 = Float32Array.from(m.b2);
  }

  run(x, s) {
    if (this.members) return this.members.reduce((a, v) => a + v.run(x, s), 0) / this.members.length;
    let a = x, C = this.m.C, T = this.m.T;
    for (const { cin, cout, k, dil, w, b } of this.convs) {
      const To = T - dil * (k - 1), y = new Float32Array(cout * To);
      for (let o = 0; o < cout; o++) {
        const yo = o * To;
        for (let t = 0; t < To; t++) y[yo + t] = b[o];
        for (let i = 0; i < cin; i++) for (let j = 0; j < k; j++) {
          const wv = w[(o * cin + i) * k + j], off = i * T + j * dil;
          for (let t = 0; t < To; t++) y[yo + t] += wv * a[off + t];
        }
        for (let t = 0; t < To; t++) if (y[yo + t] < 0) y[yo + t] = 0;
      }
      a = y; C = cout; T = To;
    }
    const F = C * T, S = s.length, H = this.b1.length, h = new Float32Array(H);
    for (let j = 0; j < H; j++) {
      let z = this.b1[j];
      const r = j * (F + S);
      for (let i = 0; i < F; i++) z += this.W1[r + i] * a[i];
      for (let i = 0; i < S; i++) z += this.W1[r + F + i] * s[i];
      h[j] = z > 0 ? z : 0;
    }
    let z = this.b2[1];
    for (let j = 0; j < H; j++) z += this.W2[H + j] * h[j];
    return 1 / (1 + Math.exp(-z));
  }
}

// A packed verifier (tools/verifier/pack.mjs: base64 int8 rows with scales)
// -> float arrays. Done on the main thread, like decodeNet.
export function decodeVerifier(m) {
  if (!m) return m;
  if (m.ensemble) return { ...m, ensemble: m.ensemble.map(decodeVerifier) };
  const dq = (w) => {
    if (!w || !w.q) return w;
    const q = Int8Array.from(atob(w.q), (c) => (c.charCodeAt(0) << 24) >> 24), n = q.length / w.s.length, out = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) out[i] = q[i] * w.s[Math.floor(i / n)];
    return out;
  };
  return { ...m, convs: m.convs.map((c) => ({ ...c, w: dq(c.w) })), W1: dq(m.W1), W2: dq(m.W2) };
}

// Base64 int8 weights -> Int8Arrays (already-decoded nets pass through).
// Done on the main thread by detector-node.js: worklets may lack atob.
export function decodeNet(net) {
  const dec = (w) => (typeof w === 'string' ? Int8Array.from(atob(w), (c) => (c.charCodeAt(0) << 24) >> 24) : w);
  return { ...net, W1: dec(net.W1), W2: dec(net.W2) };
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
