// AudioWorklet wrapper around PianoDetector. The jig concatenates detector.js
// (with `export` stripped) in front of this file and loads the result as one
// classic script, which sidesteps uneven module support in worklets.
/* global PianoDetector, sampleRate, currentFrame */

class DetectorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.opts = options.processorOptions || {};
    this.det = null;
    this.frames = [];
    this.zero = new Float32Array(128);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'config') {
        Object.assign(this.opts, data.opts);
        this.det = null; // rebuild with new options on the next block
      } else if (data.type === 'expect') {
        // Applied at the start of the next block, so a capture can record
        // exactly where it took effect.
        this.pendingExpect = data.midis;
      } else if (data.type === 'capture') {
        // Diagnostic capture: a fresh detector plus the exact input it sees,
        // so a replay can reproduce the live events (see engine.startCapture).
        if (data.on) { this.capture = { start: null, chunks: [], expects: [] }; this.det = null; }
        else if (this.capture) { this.flushCapture(); this.port.postMessage({ type: 'pcm-end', start: this.capture.start, expects: this.capture.expects }); this.capture = null; }
      }
    };
  }

  flushCapture() {
    const { chunks } = this.capture;
    if (!chunks.length) return;
    const data = new Float32Array(chunks.length * 128);
    chunks.forEach((c, k) => data.set(c, k * 128));
    this.port.postMessage({ type: 'pcm', data }, [data.buffer]);
    this.capture.chunks = [];
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    const x = ch || this.zero;
    if (this.pendingExpect !== undefined) {
      this.expect = this.pendingExpect;
      this.pendingExpect = undefined;
      this.det?.setExpect?.(this.expect);
      this.capture?.expects.push({ frame: currentFrame, midis: this.expect });
    }
    if (!this.det) {
      this.det = new PianoDetector(sampleRate, this.opts);
      this.det.pos = currentFrame; // report positions on the AudioContext clock
      if (this.expect) this.det.setExpect(this.expect);
      if (this.capture && this.capture.start == null) this.capture.start = currentFrame;
      this.det.onEvent = (e) => {
        if (e.type !== 'frame') return this.port.postMessage(e);
        this.frames.push(e);
        if (this.frames.length >= 16) {
          this.port.postMessage({ type: 'frames', frames: this.frames });
          this.frames = [];
        }
      };
    }
    this.det.process(x);
    if (this.capture) {
      this.capture.chunks.push(x.slice());
      if (this.capture.chunks.length >= 375) this.flushCapture(); // ~1 s at 48 kHz
    }
    return true;
  }
}

registerProcessor('piano-detector', DetectorProcessor);
