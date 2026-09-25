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
      }
    };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!this.det) {
      this.det = new PianoDetector(sampleRate, this.opts);
      this.det.pos = currentFrame; // report positions on the AudioContext clock
      this.det.onEvent = (e) => {
        if (e.type !== 'frame') return this.port.postMessage(e);
        this.frames.push(e);
        if (this.frames.length >= 16) {
          this.port.postMessage({ type: 'frames', frames: this.frames });
          this.frames = [];
        }
      };
    }
    this.det.process(ch || this.zero);
    return true;
  }
}

registerProcessor('piano-detector', DetectorProcessor);
