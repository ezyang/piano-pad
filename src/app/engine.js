// Audio engine for the app: one AudioContext, the detector worklet, the mic,
// playback, and simulated notes (computer keyboard) for testing without a piano.
//
// Listeners get notes as {time (s, AudioContext clock), midi, clarity}. They
// fire when the pitch is known (~25 ms after the attack); `time` is the attack.
import { createDetectorNode } from '../detector-node.js';
import { renderNote } from '../synth.js';

class Engine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.stream = null;
    this.mic = null;
    this.listening = false;
    this.listeners = new Set();
    this.rawListeners = new Set();
    this.simListeners = new Set(); // pretend key presses (test keyboard / computer keys)
    this.levelStats = { min: Infinity, max: -Infinity, sum: 0, n: 0 };
    this.level = -100; // latest input level, dB
    this.sources = new Set();
    this.starting = null;
    this.stale = false;
    this.acquiring = false;
    // Output routes are fixed when the context starts (plugging in headphones
    // later keeps playing on the speaker), so rebuild after device changes.
    // Only mark it here: a context made outside a user gesture stays suspended
    // on iOS, and granting mic permission itself fires devicechange. The
    // rebuild happens on the next tap (see start()).
    navigator.mediaDevices?.addEventListener?.('devicechange', () => { this.stale = true; });
    // iOS suspends audio when the app is backgrounded; resume on return so
    // listening keeps working without needing another tap.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    });
  }

  // Call from user gestures (any tap does, see main.js). Must not await
  // before creating a context, so creation stays inside the gesture.
  async start() {
    if (!this.ctx) this.starting ??= this._create();
    else if (this.stale && !this.listening && !this.acquiring && !this.sources.size) {
      this.stale = false;
      const old = this.ctx;
      this.starting = this._create().then(() => old.close());
    }
    await this.starting;
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  // Build a context + detector, then swap it in (the old one stays usable
  // until the new one is ready).
  async _create() {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const node = await createDetectorNode(ctx, { debug: true });
    const onsets = new Map();
    node.port.onmessage = ({ data: e }) => {
      if (e.type === 'frames') {
        this.level = e.frames[e.frames.length - 1].db;
        const L = this.levelStats;
        for (const f of e.frames) { L.min = Math.min(L.min, f.db); L.max = Math.max(L.max, f.db); L.sum += f.db; L.n++; }
        return;
      }
      if (e.type === 'onset') {
        onsets.set(e.sample, e);
        if (onsets.size > 50) onsets.delete(onsets.keys().next().value);
      }
      const accepted = e.type === 'pitch' && e.midi != null && e.clarity > 0.6;
      // Everything the detector says, for the practice log.
      for (const fn of this.rawListeners) fn({ ...e, time: e.sample / ctx.sampleRate, detectedTime: e.detectedAt / ctx.sampleRate, accepted });
      if (accepted) {
        const note = { time: e.sample / ctx.sampleRate, midi: e.midi, clarity: e.clarity };
        for (const fn of this.listeners) fn(note);
      }
    };
    this.ctx = ctx;
    this.node = node;
    this._attachMic();
  }

  // (Re)connect the mic stream to the current context's detector.
  _attachMic() {
    if (!this.stream) return;
    if (!this.mic || this.mic.context !== this.ctx) this.mic = this.ctx.createMediaStreamSource(this.stream);
    this.mic.disconnect();
    if (this.listening) this.mic.connect(this.node);
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  onNote(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Raw detector events (onsets, pitches including rejected ones).
  onRaw(fn) {
    this.rawListeners.add(fn);
    return () => this.rawListeners.delete(fn);
  }

  // Input level summary (dB) since the last call.
  takeLevelStats() {
    const L = this.levelStats;
    this.levelStats = { min: Infinity, max: -Infinity, sum: 0, n: 0 };
    return L.n ? { min: +L.min.toFixed(1), max: +L.max.toFixed(1), mean: +(L.sum / L.n).toFixed(1) } : null;
  }

  async listen(on) {
    await this.start();
    if (on && !this.stream) {
      this.acquiring = true;
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } finally {
        this.acquiring = false;
      }
    }
    this.listening = on;
    this._attachMic();
    // iOS can interrupt the context when the mic starts.
    if (on && this.ctx.state !== 'running') await this.ctx.resume();
  }

  // Play a Float32Array. Returns {source, startTime}.
  play(audio, { when = 0, toDetector = false, audible = true } = {}) {
    const { ctx } = this;
    const buf = ctx.createBuffer(1, audio.length, ctx.sampleRate);
    buf.copyToChannel(audio, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (audible) src.connect(ctx.destination);
    if (toDetector) src.connect(this.node);
    const startTime = Math.max(when, ctx.currentTime + 0.02);
    src.start(startTime);
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    return { source: src, startTime };
  }

  stopAll() {
    for (const s of this.sources) s.stop();
    this.sources.clear();
  }

  // Pretend a piano key was struck: synthesize it straight into the detector.
  async simulate(midi, { audible = !this.listening } = {}) {
    await this.start();
    for (const fn of this.simListeners) fn(midi);
    const sr = this.ctx.sampleRate;
    const audio = new Float32Array(Math.round(1.0 * sr));
    renderNote(audio, 0, { midi, vel: 0.7, dur: 0.5 }, sr, Math.random);
    // Quiet by default while the mic is on, or the mic would hear it twice.
    this.play(audio, { toDetector: true, audible });
  }
}

export const engine = new Engine();

// Computer keyboard as a piano, for testing: A..K = C4..C5, W E T Y U = sharps.
const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };
addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const m = KEYMAP[e.key.toLowerCase()];
  if (m != null) engine.simulate(m);
});
