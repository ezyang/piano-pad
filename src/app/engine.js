// Audio engine for the app: one AudioContext, the detector worklet, the mic,
// playback, and simulated notes (computer keyboard) for testing without a piano.
//
// This file is the contract between the detector (owned by piano-audio) and
// the app (piano-app); see CLAUDE.md. The app may rely on:
//   onNote(fn) -> off   fn({time, midi, clarity, voice}) for each accepted
//                       note. It fires when the pitch is known (~27 ms after
//                       the attack; ~45 ms below C4); `time` is the attack, in
//                       seconds on now()'s clock. `voice` is true when the
//                       pitch wandered like speech rather than holding like a
//                       piano string. It's only checked below C4 (midi 60),
//                       where adult voices land, and is always false from C4 up.
//   onRaw(fn) -> off    every detector event, for logging/debugging:
//                       {type, time, detectedTime, accepted, ...detector fields}.
//                       The shape may change; don't build features on it.
//   start(), listen(on) open the audio context / mic (start() only from a tap)
//   now()               current audio clock (s)
//   micDevices(), useMic(deviceId|null)   list / pick the microphone (grown-up tools)
//   startCapture(), stopCapture()         exact detector input + live events (diagnostics)
//   play(audio, opts), stopAll()
//   simulate(midi)      a pretend key press: onNote fires right away (the
//                       detector isn't involved)
//   configure()         re-apply detectorOptions() after settings change
//   expect(midis|null)  the note(s) the app is waiting for next (homework
//                       targets); pitch events are marked `expected` (no
//                       leniency for now). null: nothing in particular
//   level, takeLevelStats()   input level (dB)
//   restartMic()        get the mic stream again (new getUserMedia + input node)
//   reopen()            start over like a reload: new context + detector and
//                       a new mic stream (app's mic-health.js, when the input
//                       has gone dead; best called from a tap on iOS)
// Changes to these need a heads-up to piano-app before they ship.
import { createDetectorNode } from '../detector-node.js';
import { renderNote } from '../synth.js';
import { getState } from './store.js';

// Detector options chosen in the grown-ups menu. detector:
//   'simple' (default), 'net', 'verified'
//                       onsets from the profile's network (A3 and up),
//                       classic below A3, and classic readings the network
//                       missed if they're loud; then the profile's verifier,
//                       a learned last check on each note (fewer false notes
//                       from voices and ringing notes; ~10 ms later). Default
//                       since 2026-09-29: on her parent-labeled Stairs it
//                       caught the same 32/47 presses, false notes 18 -> 3.
//   'unverified'        the same without the verifier (the older default)
//   'classic'           the classic detector alone (spectral flux + energy rise)
//   'overlap'           classic, with the experimental overlapping-note pitch
//   'profile'           experimental: onsets from per-key spectral templates
// See src/piano-profile.json; without a profile everything is classic.
const MIC_KEY = 'pianopad.micLabel'; // the grown-up's chosen microphone, by name

export const detectorOptions = () => {
  const d = getState().detector;
  // Default: the network with the loud-classic fallback (parent-labeled
  // evaluation, 2026-09-27). 'classic' keeps the older detector.
  const onsets = { classic: 'dsp', overlap: 'dsp', profile: 'templates' }[d] ?? 'net';
  return { overlapAware: d === 'overlap', onsets, useVerifier: onsets === 'net' && d !== 'unverified' };
};

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
    this.wdStats = { min: Infinity, max: -Infinity, sum: 0, n: 0 };
    setInterval(() => this._watchdog(), 1000);
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
    const node = await createDetectorNode(ctx, { debug: true, ...detectorOptions() });
    const onsets = new Map();
    node.port.onmessage = ({ data: e }) => {
      if (e.type === 'pcm') { this.capture?.pcm.push(e.data); return; }
      if (e.type === 'pcm-end') { this.capture?.done({ start: e.start, expects: e.expects }); return; }
      if (this.capture && (e.type === 'onset' || e.type === 'pitch')) this.capture.events.push(e);
      if (e.type === 'frames') {
        if (e.skips !== undefined) this.skips = e.skips;
        this.level = e.frames[e.frames.length - 1].db;
        for (const L of [this.levelStats, this.wdStats]) {
          for (const f of e.frames) { L.min = Math.min(L.min, f.db); L.max = Math.max(L.max, f.db); L.sum += f.db; L.n++; }
        }
        return;
      }
      if (e.type === 'onset') {
        onsets.set(e.sample, e);
        if (onsets.size > 50) onsets.delete(onsets.keys().next().value);
      }
      // Expected notes get no leniency here (a lower bar let speech advance
      // homework, 2026-09-28).
      const accepted = e.type === 'pitch' && e.midi != null && e.clarity > 0.6 && !e.reject;
      // Everything the detector says, for the practice log.
      for (const fn of this.rawListeners) fn({ ...e, time: e.sample / ctx.sampleRate, detectedTime: e.detectedAt / ctx.sampleRate, accepted });
      if (accepted) {
        const note = { time: e.sample / ctx.sampleRate, midi: e.midi, clarity: e.clarity, voice: !!e.voice };
        for (const fn of this.listeners) fn(note);
      }
    };
    this.ctx = ctx;
    this.t0 = { wall: performance.now() / 1000, ctx: ctx.currentTime };
    this.node = node;
    if (this.expected) node.port.postMessage({ type: 'expect', midis: this.expected });
    this._attachMic();
  }

  // Connect the mic stream to the current context's detector. Once granted,
  // the mic stays connected: reconnecting after silence made the detector
  // hear the jump as an attack (a phantom note at the start of every run).
  // `listening` only says whether a screen wants notes right now.
  _attachMic() {
    if (!this.stream) return;
    if (this.mic?.context === this.ctx && this.micStream === this.stream) return;
    this.mic?.disconnect();
    this.mic = this.ctx.createMediaStreamSource(this.stream);
    this.micStream = this.stream;
    this.mic.connect(this.node);
  }

  async _openMic() {
    this.acquiring = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(this.micDeviceId ? { deviceId: { exact: this.micDeviceId } } : {}) },
      });
    } finally {
      this.acquiring = false;
    }
  }

  // iOS occasionally freezes the mic input, replaying the same audio over and
  // over (seen in a practice log: identical "notes" every 100 ms and identical
  // level statistics each second). If the level statistics repeat exactly
  // with sound present, reopen the mic.
  _watchdog() {
    const L = this.wdStats;
    this.wdStats = { min: Infinity, max: -Infinity, sum: 0, n: 0 };
    if (!this.stream || !L.n || L.max < -100) { this.wdSame = 0; return; }
    const key = `${L.min.toFixed(2)}|${L.max.toFixed(2)}|${(L.sum / L.n).toFixed(2)}`;
    this.wdSame = key === this.wdLast ? (this.wdSame ?? 0) + 1 : 0;
    this.wdLast = key;
    if (this.wdSame >= 2 && !this.acquiring) this.restartMic();
  }

  async restartMic() {
    this.wdSame = 0;
    for (const fn of this.rawListeners) fn({ type: 'mic-restart' });
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    try { await this._openMic(); this._attachMic(); } catch { /* permission lost; the next listen() asks again */ }
  }

  // Start over the way reloading the app does (2026-10-06: an evening of
  // exact-silence input on the iPad was cured by restarting the app): stop
  // the mic, build a fresh context + detector, then ask for the mic again.
  async reopen() {
    // A diagnostic capture can't span two detectors: drop it (stopCapture()
    // then resolves to null instead of waiting on the old one).
    this.capture = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.stopAll();
    const old = this.ctx;
    this.stale = false;
    this.starting = this._create();
    await this.starting;
    if (old && old !== this.ctx) old.close().catch(() => {});
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    await this._openMic();
    this._attachMic();
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }

  // Diagnostic capture (grown-up tools): a fresh detector starts and the
  // exact audio it processes is kept, with its live events (sample indices)
  // and when expect() took effect, so tools/parity.mjs can replay it and
  // check the live events are reproduced. stopCapture() resolves to
  // {sampleRate, start, pcm: Float32Array, events, expects, opts}.
  startCapture() {
    if (!this.node) return false;
    this.capture = { pcm: [], events: [], opts: detectorOptions() };
    this.node.port.postMessage({ type: 'capture', on: true });
    return true;
  }

  stopCapture() {
    const cap = this.capture;
    if (!cap || !this.node) return Promise.resolve(null);
    return new Promise((resolve) => {
      cap.done = ({ start, expects }) => {
        this.capture = null;
        const n = cap.pcm.reduce((a, c) => a + c.length, 0), pcm = new Float32Array(n);
        let o = 0; for (const c of cap.pcm) { pcm.set(c, o); o += c.length; }
        // Drop events the previous detector emitted before the fresh one took over.
        const events = cap.events.filter((e) => e.detectedAt >= start);
        resolve({ sampleRate: this.ctx.sampleRate, start, pcm, events, expects, opts: cap.opts });
      };
      this.node.port.postMessage({ type: 'capture', on: false });
    });
  }

  // Microphones the browser can see ({deviceId, label}; labels need mic
  // permission first), and switching to one (null: the default). Grown-up
  // tools only; the choice lasts until the page reloads.
  async micDevices() {
    const all = await navigator.mediaDevices?.enumerateDevices?.() ?? [];
    return all.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label }));
  }

  async useMic(deviceId) {
    this.micDeviceId = deviceId || null;
    // Remember the choice by name (device ids can change between visits).
    const label = deviceId ? (await this.micDevices()).find((d) => d.deviceId === deviceId)?.label : null;
    try { if (label) localStorage.setItem(MIC_KEY, label); else localStorage.removeItem(MIC_KEY); } catch {}
    await this.restartMic();
  }

  // After the mic opens: if a grown-up picked a mic before and it's plugged
  // in, switch to it (names are only visible once the mic is allowed).
  async _preferSavedMic() {
    let want = null;
    try { want = localStorage.getItem(MIC_KEY); } catch {}
    if (!want || this.micDeviceId) return;
    const track = this.stream?.getAudioTracks?.()[0];
    if (track?.label === want) return;
    const dev = (await this.micDevices()).find((d) => d.label === want);
    if (dev) { this.micDeviceId = dev.deviceId; await this.restartMic(); }
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // The note(s) the app is waiting for (midi numbers), or null when it isn't
  // waiting for anything in particular. The detector listens harder for
  // those notes and is less strict about accepting them.
  expect(midis) {
    this.expected = midis?.length ? [...midis] : null;
    this.node?.port.postMessage({ type: 'expect', midis: this.expected });
  }

  onNote(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Apply changed detector options to the running detector.
  configure() {
    this.node?.port.postMessage({ type: 'config', opts: detectorOptions() });
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
    // (This used to start another watchdog interval on every call, piling up
    // one per second of practice; the constructor's single one is enough.)
    if (!L.n) return null;
    // Audio health: how far the audio clock is behind the wall clock since
    // the context started (ms; grows if the device drops audio), and render
    // quanta the worklet saw skipped (both diagnose lost input, Oct 2026).
    const lag = this.ctx && this.t0 ? Math.round(1000 * ((performance.now() / 1000 - this.t0.wall) - (this.ctx.currentTime - this.t0.ctx))) : undefined;
    return { min: +L.min.toFixed(1), max: +L.max.toFixed(1), mean: +(L.sum / L.n).toFixed(1), ...(lag !== undefined ? { lag } : {}), ...(this.skips ? { skips: this.skips } : {}) };
  }

  async listen(on) {
    await this.start();
    if (on && !this.stream) { await this._openMic(); await this._preferSavedMic().catch(() => {}); }
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

  // Pretend a piano key was struck (test keyboard, computer keys): the note
  // goes straight to onNote listeners. It used to be synthesized into the
  // detector, but the default detector is trained on her piano and misses
  // most synth notes; the detector has its own tests (jig, bench).
  async simulate(midi, { audible = !this.listening } = {}) {
    await this.start();
    for (const fn of this.simListeners) fn(midi);
    let time = this.ctx.currentTime;
    // Quiet by default while the mic is on, or the mic could hear it too.
    if (audible) {
      const sr = this.ctx.sampleRate;
      const audio = new Float32Array(Math.round(1.0 * sr));
      renderNote(audio, 0, { midi, vel: 0.7, dur: 0.5 }, sr, Math.random);
      time = this.play(audio).startTime;
    }
    const note = { time, midi, clarity: 1, voice: false };
    for (const fn of this.listeners) fn(note);
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
