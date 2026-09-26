// Create an AudioWorkletNode running PianoDetector. detector.js (with `export`
// stripped) and the worklet wrapper are loaded as one classic script, which
// sidesteps uneven module support in worklets.
//
// These files plus piano-profile.json are the audio package. Keep it
// self-contained and backward compatible: createDetectorNode(ctx, opts), the
// options old engines pass (overlapAware, debug), the worklet's 'config'
// message and the events it posts (onset, pitch, frames), so a newer package
// can be dropped into an older app version.
const loaded = new WeakSet();

import { decodeNet } from './detector.js';

// The piano profile (how this piano sounds through her iPad): octave fixes,
// and the onset network, which is the default onset detector when present
// (engines that predate it get it too). Weights are decoded here because
// worklets may lack atob.
let profile;
const loadProfile = () => (profile ??= fetch(new URL('./piano-profile.json', import.meta.url))
  .then((r) => (r.ok ? r.json() : null))
  .then((p) => (p?.net ? { ...p, net: decodeNet(p.net) } : p))
  .catch(() => null));

export async function createDetectorNode(ctx, opts = {}) {
  const p = await loadProfile();
  if (p) opts = { octaveDown: p.octaveDown, templates: p.templates, net: p.net, onsets: p.net ? 'net' : 'dsp', ...opts };
  if (!loaded.has(ctx)) {
    const srcs = ['./detector.js', './detector-worklet.js'].map((p) => new URL(p, import.meta.url));
    const [a, b] = await Promise.all(srcs.map((u) => fetch(u).then((r) => r.text())));
    const url = URL.createObjectURL(new Blob([a.replace(/^export /gm, '') + '\n' + b], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    loaded.add(ctx);
  }
  const node = new AudioWorkletNode(ctx, 'piano-detector', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: opts,
  });
  // The node has to be pulled by the graph to run; route it to a muted sink.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  node.connect(sink).connect(ctx.destination);
  return node;
}
