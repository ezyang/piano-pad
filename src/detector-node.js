// Create an AudioWorkletNode running PianoDetector. detector.js (with `export`
// stripped) and the worklet wrapper are loaded as one classic script, which
// sidesteps uneven module support in worklets.
const loaded = new WeakSet();

export async function createDetectorNode(ctx, opts = {}) {
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
