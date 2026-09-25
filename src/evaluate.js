// Match detections against ground truth. Times in seconds.
//   truth:      [{time, midi}]
//   detections: [{time, detectedAt, midi, pitchAt}]  (midi/pitchAt may be missing)
// If autoOffset is set, a constant offset (e.g. speaker->mic latency) is
// estimated from a loose first pass and removed before the strict match.

export function evaluate(truth, detections, { tol = 0.05, autoOffset = false } = {}) {
  let offset = 0;
  if (autoOffset) {
    const loose = match(truth, detections, 0, 0.3);
    const errs = loose.matches.map((m) => m.det.time - m.truth.time).sort((a, b) => a - b);
    if (errs.length) offset = errs[errs.length >> 1];
  }
  const r = match(truth, detections, offset, tol);
  const onsetErr = r.matches.map((m) => m.det.time - offset - m.truth.time);
  const latency = r.matches.map((m) => m.det.detectedAt - offset - m.truth.time);
  const withPitch = r.matches.filter((m) => m.det.midi != null);
  const pitchOk = withPitch.filter((m) => m.det.midi === m.truth.midi);
  const pitchLatency = withPitch.map((m) => m.det.pitchAt - offset - m.truth.time);
  return {
    ...r,
    offset,
    recall: r.matches.length / Math.max(1, truth.length),
    precision: r.matches.length / Math.max(1, detections.length),
    onsetErr: summarize(onsetErr),
    latency: summarize(latency),
    pitchAcc: pitchOk.length / Math.max(1, r.matches.length),
    pitchLatency: summarize(pitchLatency),
  };
}

// Greedy nearest match in time order.
function match(truth, dets, offset, tol) {
  const used = new Set();
  const matches = [];
  const missed = [];
  for (const t of truth) {
    let best = -1, bestErr = Infinity;
    dets.forEach((d, i) => {
      if (used.has(i)) return;
      const err = Math.abs(d.time - offset - t.time);
      if (err <= tol && err < bestErr) { best = i; bestErr = err; }
    });
    if (best >= 0) { used.add(best); matches.push({ truth: t, det: dets[best] }); }
    else missed.push(t);
  }
  const extra = dets.filter((_, i) => !used.has(i));
  return { matches, missed, extra };
}

function summarize(xs) {
  if (!xs.length) return { n: 0, mean: NaN, p50: NaN, p95: NaN, max: NaN };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
