import { renderSequence, renderNote, addReverb, addNoise, scale, midiName, mulberry32 } from './synth.js';
import { SCENARIOS } from './scenarios.js';
import { parseRhythm, rhythmToEvents } from './rhythm.js';
import { evaluate } from './evaluate.js';
import { DEFAULTS } from './detector.js';
import { createDetectorNode } from './detector-node.js';

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- controls ----------

const fmt = {
  bpm: (v) => `${v}`, jitter: (v) => `±${v} ms`, velSpread: (v) => `±${v}`,
  noise: (v) => (v <= -90 ? 'off' : `${v} dB`), reverb: (v) => `${v}`, gain: (v) => `${v} dB`,
  thresholdK: (v) => v, minFlux: (v) => v, minRiseDb: (v) => `${v} dB`, gateDb: (v) => `${v} dB`, clarity: (v) => v,
};
const DET_KEYS = ['thresholdK', 'minFlux', 'minRiseDb', 'gateDb', 'clarity'];
for (const k of DET_KEYS) $(k).value = DEFAULTS[k];
for (const k of Object.keys(fmt)) {
  const upd = () => ($(k + 'V').textContent = fmt[k]($(k).value));
  $(k).addEventListener('input', upd);
  upd();
}
for (const k of DET_KEYS) $(k).addEventListener('change', () => node?.port.postMessage({ type: 'config', opts: detOpts() }));
const detOpts = () => Object.fromEntries(DET_KEYS.map((k) => [k, +$(k).value]));

$('scenario').innerHTML = `<option value="custom">Custom (rhythm + notes below)</option>` +
  Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
$('scenario').addEventListener('change', () => {
  const custom = $('scenario').value === 'custom';
  for (const id of ['rhythm', 'notes', 'bpm']) $(id).disabled = !custom;
});

function parseNote(s) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s.trim());
  if (!m) throw new Error(`bad note: ${s}`);
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  return base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1);
}

function buildEvents(seed) {
  const sc = $('scenario').value;
  let events = sc === 'custom'
    ? rhythmToEvents(parseRhythm($('rhythm').value), {
        bpm: +$('bpm').value, pitches: $('notes').value.split(/[\s,]+/).filter(Boolean).map(parseNote),
      })
    : SCENARIOS[sc].make();
  const rng = mulberry32(seed);
  const jit = +$('jitter').value / 1000, vs = +$('velSpread').value;
  events = events.map((e) => ({
    ...e,
    time: Math.max(0.3, e.time + (rng() * 2 - 1) * jit),
    vel: Math.min(1, Math.max(0.05, e.vel + (rng() * 2 - 1) * vs)),
  }));
  return events;
}

// ---------- audio ----------

let ctx, node, micSource, micOn = false;
const rec = { truth: [], dets: new Map(), frames: [] };
let view = null; // {t0, t1} while showing a run; null = live scrolling
let run = null;
let result = null;

async function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    node = await createDetectorNode(ctx, { debug: true, ...detOpts() });
    node.port.onmessage = onDetector;
    $('sr').textContent = `${ctx.sampleRate} Hz · base latency ${(ctx.baseLatency * 1000).toFixed(1)} ms`;
    requestAnimationFrame(draw);
  }
  await ctx.resume();
}

async function setMic(on) {
  if (on && !micSource) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    micSource = ctx.createMediaStreamSource(stream);
  }
  if (on && !micOn) micSource.connect(node);
  if (!on && micOn) micSource.disconnect(node);
  micOn = on;
  $('listen').classList.toggle('on', on);
  $('listen').textContent = on ? '■ Stop listening' : '🎤 Listen live';
}

function onDetector({ data: e }) {
  const sr = ctx.sampleRate;
  if (e.type === 'frames') {
    for (const f of e.frames) rec.frames.push({ ...f, t: f.sample / sr });
    const cutoff = ctx.currentTime - 40;
    while (rec.frames.length && rec.frames[0].t < cutoff) rec.frames.shift();
  } else if (e.type === 'onset') {
    rec.dets.set(e.sample, { time: e.sample / sr, detectedAt: e.detectedAt / sr, flux: e.flux });
  } else if (e.type === 'pitch') {
    const d = rec.dets.get(e.sample);
    if (d) Object.assign(d, { midi: e.midi, f0: e.f0, cents: e.cents, clarity: e.clarity, pitchAt: e.detectedAt / sr });
  }
}

// Route a synthesized buffer: into the detector directly, or out the speakers
// when we're listening through the mic.
function play(audio, when) {
  const buf = ctx.createBuffer(1, audio.length, ctx.sampleRate);
  buf.copyToChannel(audio, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const direct = run ? run.path === 'direct' : !micOn;
  if (direct) {
    src.connect(node);
    if ($('monitor').checked) src.connect(ctx.destination);
  } else {
    src.connect(ctx.destination);
  }
  src.start(when);
  return src;
}

async function runScenario() {
  await ensureAudio();
  const path = $('path').value;
  await setMic(path === 'mic');
  const seed = (Math.random() * 1e9) | 0;
  let events;
  try { events = buildEvents(seed); } catch (err) { $('stats').textContent = err.message; return; }
  const sr = ctx.sampleRate;
  const audio = renderSequence(events, { sr, seed });
  addReverb(audio, sr, +$('reverb').value);
  scale(audio, +$('gain').value);
  addNoise(audio, sr, +$('noise').value <= -90 ? -200 : +$('noise').value, seed + 1);

  const t0 = ctx.currentTime + 0.3;
  run = { t0, end: t0 + audio.length / sr, path };
  rec.truth = events.map((e) => ({ ...e, time: e.time + t0 }));
  rec.dets.clear();
  result = null;
  view = { t0: t0 - 0.05, t1: run.end };
  $('stats').textContent = 'Running…';
  $('notes-table').innerHTML = '';
  const src = play(audio, t0);
  src.onended = () => setTimeout(finishRun, 400);
}

function finishRun() {
  // Ignore anything before the first note (e.g. synthetic noise switching on).
  const first = Math.min(...rec.truth.map((e) => e.time)) - 0.2;
  const dets = [...rec.dets.values()].filter((d) => d.time >= first && d.time <= run.end);
  result = evaluate(rec.truth, dets, { autoOffset: run.path === 'mic' });
  showResult(result, run.path);
  run = null;
  if (micOn) setMic(false);
}

const ms = (x) => (Number.isNaN(x) ? '   -' : (x * 1000).toFixed(1).padStart(6));
function showResult(r, path) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  $('stats').textContent =
    `recall ${pct(r.recall)}   precision ${pct(r.precision)}   pitch ${pct(r.pitchAcc)}` +
    (path === 'mic' ? `   (speaker→mic offset removed: ${(r.offset * 1000).toFixed(1)} ms)` : '') + '\n' +
    `onset time error   p50 ${ms(r.onsetErr.p50)}  p95 ${ms(r.onsetErr.p95)} ms\n` +
    `detection latency  p50 ${ms(r.latency.p50)}  p95 ${ms(r.latency.p95)}  max ${ms(r.latency.max)} ms\n` +
    `pitch latency      p50 ${ms(r.pitchLatency.p50)}  p95 ${ms(r.pitchLatency.p95)}  max ${ms(r.pitchLatency.max)} ms`;
  const rows = rec.truth.map((t) => {
    const m = r.matches.find((m) => m.truth === t);
    if (!m) return `<tr><td>${midiName(t.midi)}</td><td>${t.time.toFixed(3)}</td><td colspan=5 style="color:var(--bad)">missed</td></tr>`;
    const d = m.det, ok = d.midi === t.midi;
    return `<tr><td>${midiName(t.midi)}</td><td>${t.time.toFixed(3)}</td><td>${ms(d.time - r.offset - t.time)}</td>` +
      `<td>${ms(d.detectedAt - r.offset - t.time)}</td><td style="color:var(${ok ? '--ok' : '--warn'})">${d.midi != null ? midiName(d.midi) : '?'}</td>` +
      `<td>${d.f0 ? d.f0.toFixed(1) : '-'}</td><td>${d.clarity?.toFixed(2) ?? '-'}</td></tr>`;
  });
  for (const d of r.extra) rows.push(`<tr><td style="color:var(--bad)">extra</td><td>${d.time.toFixed(3)}</td><td></td><td></td><td>${d.midi != null ? midiName(d.midi) : '?'}</td><td>${d.f0?.toFixed(1) ?? '-'}</td><td>${d.clarity?.toFixed(2) ?? '-'}</td></tr>`);
  $('notes-table').innerHTML = '<tr><th>note</th><th>time</th><th>onset err ms</th><th>latency ms</th><th>heard</th><th>f0</th><th>clarity</th></tr>' + rows.join('');
}

// ---------- live keyboard ----------

const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };

async function liveNote(midi) {
  await ensureAudio();
  if (run) return;
  if (view) { view = null; rec.truth = []; rec.dets.clear(); result = null; }
  const sr = ctx.sampleRate, dur = 0.45;
  const audio = new Float32Array(Math.ceil((dur + 0.5) * sr));
  renderNote(audio, 0, { midi, vel: 0.7, dur }, sr, Math.random);
  const when = ctx.currentTime + 0.01;
  rec.truth.push({ time: when, midi, dur });
  play(audio, when);
}

addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
  const m = KEYMAP[e.key.toLowerCase()];
  if (m != null) liveNote(m);
});
$('keys').innerHTML = Array.from({ length: 13 }, (_, i) => 60 + i)
  .map((m) => `<button data-m="${m}" class="${[1, 3, 6, 8, 10].includes(m % 12) ? 'black' : ''}">${midiName(m)}</button>`).join('');
$('keys').addEventListener('pointerdown', (e) => { const m = e.target.dataset?.m; if (m) liveNote(+m); });

$('run').addEventListener('click', runScenario);
$('listen').addEventListener('click', async () => {
  await ensureAudio();
  if (run) return;
  view = null; rec.truth = []; rec.dets.clear(); result = null;
  await setMic(!micOn);
});

// ---------- drawing ----------

const canvas = $('view');
function draw() {
  requestAnimationFrame(draw);
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  const now = ctx.currentTime;
  const [t0, t1] = view ? [view.t0, view.t1] : [now - 8, now + 0.3];
  const X = (t) => ((t - t0) / (t1 - t0)) * W;
  const C = { ink: css('--ink'), muted: css('--muted'), line: css('--line'), ok: css('--ok'), warn: css('--warn'), bad: css('--bad'),
    truth: css('--truth'), flux: css('--flux'), rise: css('--rise'), level: css('--level'), accent: css('--accent') };
  g.font = '11px -apple-system, system-ui, sans-serif';

  // Lanes: piano roll | flux | rise | level
  const lanes = { roll: [0, 150], flux: [155, 225], rise: [230, 295], level: [300, H] };
  g.strokeStyle = C.line;
  for (const [, [, y1]] of Object.entries(lanes)) { g.beginPath(); g.moveTo(0, y1 + 2); g.lineTo(W, y1 + 2); g.stroke(); }

  const dets = [...rec.dets.values()].filter((d) => d.time > t0 - 1 && d.time < t1);
  const truth = rec.truth.filter((e) => e.time + e.dur > t0 && e.time < t1);
  const ms_ = [...truth.map((e) => e.midi), ...dets.filter((d) => d.midi != null).map((d) => d.midi)];
  let lo = Math.min(58, ...ms_) - 2, hi = Math.max(74, ...ms_) + 2;
  const [ry0, ry1] = lanes.roll;
  const Y = (m) => ry1 - 8 - ((m - lo) / (hi - lo)) * (ry1 - ry0 - 16);
  const rowH = Math.max(4, (ry1 - ry0 - 16) / (hi - lo) - 1);

  const matchOf = new Map(), status = new Map();
  if (result) {
    for (const m of result.matches) { matchOf.set(m.truth, m); status.set(m.det, m.det.midi === m.truth.midi ? 'ok' : 'warn'); }
    for (const d of result.extra) status.set(d, 'bad');
  }
  for (const e of truth) {
    g.fillStyle = C.truth;
    g.fillRect(X(e.time), Y(e.midi) - rowH / 2, Math.max(2, X(e.time + e.dur) - X(e.time)), rowH);
    if (result && !matchOf.has(e)) { g.strokeStyle = C.bad; g.lineWidth = 2; g.strokeRect(X(e.time), Y(e.midi) - rowH / 2, X(e.time + e.dur) - X(e.time), rowH); g.lineWidth = 1; }
    g.fillStyle = C.muted;
    g.fillText(midiName(e.midi), X(e.time) + 2, Y(e.midi) - rowH / 2 - 2);
  }
  const off = result?.offset ?? 0;
  for (const d of dets) {
    const col = C[status.get(d) ?? 'accent'];
    const x = X(d.time - off);
    g.strokeStyle = col;
    g.beginPath(); g.moveTo(x, ry0); g.lineTo(x, H); g.stroke();
    if (d.midi != null) {
      g.fillStyle = col;
      g.beginPath(); g.arc(x, Y(Math.min(hi, Math.max(lo, d.midi))), 4, 0, 2 * Math.PI); g.fill();
      g.fillText(midiName(d.midi), x + 5, Y(Math.min(hi, Math.max(lo, d.midi))) + 12);
    }
  }

  // Detector internals.
  const frames = rec.frames.filter((f) => f.t >= t0 && f.t <= t1);
  const plot = (key, lane, lo, hi, color, dash = []) => {
    const [y0, y1] = lane;
    g.strokeStyle = color; g.setLineDash(dash); g.beginPath();
    frames.forEach((f, i) => {
      const v = Math.min(hi, Math.max(lo, f[key]));
      const y = y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
      i ? g.lineTo(X(f.t - off), y) : g.moveTo(X(f.t - off), y);
    });
    g.stroke(); g.setLineDash([]);
  };
  const fluxMax = Math.max(30, ...frames.map((f) => f.thr * 3));
  plot('flux', lanes.flux, 0, fluxMax, C.flux);
  plot('thr', lanes.flux, 0, fluxMax, C.flux, [4, 3]);
  plot('rise', lanes.rise, -10, 20, C.rise);
  plot('rThr', lanes.rise, -10, 20, C.rise, [4, 3]);
  plot('db', lanes.level, -100, 0, C.level);
  plot('floorDb', lanes.level, -100, 0, C.level, [4, 3]);
  g.fillStyle = C.muted;
  g.fillText('flux', 4, lanes.flux[0] + 10);
  g.fillText('energy rise (dB)', 4, lanes.rise[0] + 10);
  g.fillText('level (dB)', 4, lanes.level[0] + 10);
  const last = rec.frames[rec.frames.length - 1];
  if (last && !view) g.fillText(`${last.db.toFixed(1)} dB`, W - 60, lanes.level[0] + 10);
}
