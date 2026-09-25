// Headless detector benchmark: synthesize scenarios under various conditions,
// run the detector, and print accuracy/latency.
//   node test/bench.mjs [scenario...] [--verbose]
import { renderSequence, addReverb, addNoise, scale, midiName } from '../src/synth.js';
import { PianoDetector } from '../src/detector.js';
import { evaluate } from '../src/evaluate.js';
import { SCENARIOS } from '../src/scenarios.js';

const SR = 48000;
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const picked = args.filter((a) => !a.startsWith('--'));
const names = picked.length ? picked : Object.keys(SCENARIOS);

const CONDITIONS = [
  { name: 'clean', noise: -120, reverb: 0, gain: 0 },
  { name: 'quiet room', noise: -60, reverb: 0.2, gain: -6 },
  { name: 'noisy+reverb', noise: -45, reverb: 0.35, gain: -6 },
  { name: 'far mic', noise: -55, reverb: 0.4, gain: -20 },
];

export function runDetector(audio, sr, opts) {
  const det = new PianoDetector(sr, opts);
  const onsets = new Map();
  det.onEvent = (e) => {
    if (e.type === 'onset') onsets.set(e.sample, { time: e.sample / sr, detectedAt: e.detectedAt / sr });
    else if (e.type === 'pitch') {
      const o = onsets.get(e.sample);
      if (o) Object.assign(o, { midi: e.midi, pitchAt: e.detectedAt / sr, f0: e.f0, clarity: e.clarity });
    }
  };
  for (let i = 0; i < audio.length; i += 128) det.process(audio.subarray(i, i + 128));
  return [...onsets.values()];
}

const ms = (x) => (Number.isNaN(x) ? '   -' : (x * 1000).toFixed(1).padStart(5));
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);

let worst = 1;
console.log('scenario'.padEnd(12), 'condition'.padEnd(13), 'recall prec pitch | onsetErr p50/p95 | detLat p50/p95 | pitchLat p50/p95 (ms)');
for (const name of names) {
  const events = SCENARIOS[name].make();
  for (const c of CONDITIONS) {
    const audio = renderSequence(events, { sr: SR });
    addReverb(audio, SR, c.reverb);
    scale(audio, c.gain);
    addNoise(audio, SR, c.noise);
    const dets = runDetector(audio, SR);
    const r = evaluate(events, dets);
    worst = Math.min(worst, r.recall, r.precision, r.pitchAcc);
    console.log(
      name.padEnd(12), c.name.padEnd(13),
      pct(r.recall), ' ', pct(r.precision), pct(r.pitchAcc), ' |',
      ms(r.onsetErr.p50), ms(r.onsetErr.p95), '    |',
      ms(r.latency.p50), ms(r.latency.p95), '  |',
      ms(r.pitchLatency.p50), ms(r.pitchLatency.p95),
    );
    if (verbose) {
      for (const m of r.missed) console.log('    MISSED', midiName(m.midi), m.time.toFixed(3));
      for (const d of r.extra) console.log('    EXTRA ', d.time.toFixed(3), d.midi != null ? midiName(d.midi) : '?');
      for (const m of r.matches) if (m.det.midi !== m.truth.midi)
        console.log('    PITCH ', midiName(m.truth.midi), '->', m.det.midi != null ? midiName(m.det.midi) : '?', m.det.f0?.toFixed(1), 'clarity', m.det.clarity?.toFixed(2));
    }
  }
}
console.log(`\nworst metric: ${pct(worst)}`);
