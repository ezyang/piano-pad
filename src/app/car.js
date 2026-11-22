// Honky's beat game (2026-11-22, pedagogy + parent; before Driving,
// adventure.js CAR_BEFORE). It replaced the honk count of 11-21. The point:
// she rushes half notes (the next note comes on beat 2), and nothing in
// the app checks her against a steady beat. So: a steady beat she can see
// and hear, before any reading.
//
// A click track at BPM (an unpitched tick on every beat, a lower "tock" on
// the count-in and the honk beats; instruments.js renderBeat). Honky
// drives: the road scrolls steadily and Honky bobs on every beat. Count-in
// "1, 2", then the half-note pattern from Driving, HONK on beat 1 and hold
// through beat 2 ("HONK - 2"), HALF_N times, then a bar's rest ("Now hold
// it longer!") and whole notes, "HONK - 2 - 3 - 4", WHOLE_N times. About
// 45 s at 80 bpm (pedagogy: 60 would be under half her natural speed). The hold is something she sees: under Honky the beat
// boxes (HONK, 2, 3, 4) light one by one as the beat moves through them,
// gold when she honked on time.
//
// Any key counts (a chord or a bounce, notes within CHORD_S, is one
// strike). A strike within EARLY_TOL before to LATE_TOL after a honk beat
// is ON TIME: Honky zooms forward, the progress light turns gold. Earlier
// than that (rushing: the hold isn't over) is EARLY: Honky stays put and a
// calm "wait for it…" shows. Never red, never "wrong"; a missed honk just
// stays a dim light. Honky joins the band at the end however it went.
//
// Times: a strike's `time` (the attack, on the audio clock) is compared
// with the click's scheduled time plus the output latency (when she hears
// it). With the mic off (mic switch) or dead (mic-health), or if it won't
// start: she taps the car on the beat (the tap's time, same rules). The
// grown-up's TWO-FINGER TAP (→) finishes it (a touch that began after the
// moment opened). Logged by the caller (adventure.js `car()`): the finish
// carries bpm, latency (ms), and every strike { ms (since the start),
// midi?, pattern: 'half' | 'whole', k (honk beat index), off (ms from that
// honk beat, negative = early), grade: 'on' | 'early' | 'late' }, plus
// per pattern how many honk beats she honked (honked: on time or late)
// and how many on time (onTime), each { half, whole }, of { half, whole }.
import { h, flash, sparkle } from './dom.js';
import { carUrl } from './pixels.js';
import { engine } from './engine.js';
import { renderBeat } from './instruments.js';
import { heard, micOff, onMicToggle } from './mic-off.js';
import { deadSince } from './mic-health.js';
import { grownupGestures } from './grownup.js';

export const BPM = 80; // the written tempo; fixed, never following her (she speeds up: 89 → 141 in one evening)
export const HALF_N = 12, WHOLE_N = 6;
const COUNT_IN = 2;
const CHORD_S = 0.15;
const EARLY_TOL = 0.2, LATE_TOL = 0.45; // in beats
const JOIN_MS = 2600;
const INTRO_MS = 1800;

// The game's beats: [{ beat, pattern, len }] honk beats (len: beats held),
// and the total beats of the click track.
export function plan() {
  const honks = [];
  let b = COUNT_IN;
  for (let i = 0; i < HALF_N; i++, b += 2) honks.push({ beat: b, pattern: 'half', len: 2 });
  const rest = b; b += 4; // a bar to switch: "Now hold it longer!"
  for (let i = 0; i < WHOLE_N; i++, b += 4) honks.push({ beat: b, pattern: 'whole', len: 4 });
  return { honks, rest, beats: b };
}

// Which honk beat a strike at `beat` (in beats from the first click) is
// for, and how far off (beats). The first honk beat not yet over: a strike
// up to LATE_TOL after one counts for it, else for the next one.
export function judgeStrike(honks, beat) {
  const k = honks.findIndex((x) => beat <= x.beat + LATE_TOL);
  if (k < 0) return null; // after the last
  const off = beat - honks[k].beat;
  return { k, off, grade: off < -EARLY_TOL ? 'early' : off > EARLY_TOL ? 'late' : 'on' };
}

export function carMoment(parent, { start, finish, joins, then }) {
  const t0 = Date.now(), opened = performance.now();
  const { honks, rest, beats } = plan();
  const beatS = 60 / BPM;

  const car = h('img', { class: 'car-sprite', src: carUrl(), alt: '' });
  const carWrap = h('div', { class: 'car-wrap' }, car);
  const road = h('div', { class: 'car-road' });
  const text = h('div', { class: 'lion-text' }, 'Drive with Honky!');
  const sub = h('div', { class: 'lion-sub' }, 'Honk on the big beat, then hold it: HONK - 2');
  const hint = h('div', { class: 'lion-hint car-hint' });
  const count = h('div', { class: 'car-count' });
  const boxes = [0, 1, 2, 3].map((i) => h('span', { class: 'car-beat' }, i ? String(i + 1) : 'HONK'));
  const meter = h('div', { class: 'car-meter' }, boxes);
  const lights = honks.map((x) => h('span', { class: 'car-light ' + x.pattern }));
  const scene = h('div', { class: 'car-scene' }, road, carWrap, hint, count);
  const box = h('div', { class: 'lion-moment car-moment' }, text, sub, scene, meter, h('div', { class: 'car-lights' }, lights));
  parent.append(box);

  let state = 'opening', mode = null, why = null, off = null, raf = 0, timer = 0, hintTimer = 0;
  let t0Beat = null; // audio-clock time of beat 0 as she hears it
  let lastStrike = -Infinity, lastBeatShown = -1;
  const strikes = [], hit = honks.map(() => false);
  const clock = () => (engine.ctx ? engine.now() : performance.now() / 1000);
  const latency = () => (engine.ctx ? (engine.ctx.outputLatency || engine.ctx.baseLatency || 0) : 0);
  const info = () => ({ mode, bpm: BPM, ...(why ? { why } : {}) });
  // Per pattern: honk beats she honked (on time or a little late), and on time.
  const nOf = (pat, grade) => strikes.filter((r) => r.pattern === pat && !r.again && (grade ? r.grade === grade : r.grade !== 'early')).length;
  const tally = (grade) => ({ half: nOf('half', grade), whole: nOf('whole', grade) });
  const stats = () => ({ ms: Date.now() - t0, bpm: BPM, latency: Math.round(latency() * 1000), strikes, honked: tally(null), onTime: tally('on'), of: { half: HALF_N, whole: WHOLE_N }, mode, ...(why ? { why } : {}) });

  const tapMode = (reason) => {
    if (state === 'over' || state === 'arriving') return;
    off?.(); off = null;
    const first = mode == null;
    mode = 'tap'; why = reason;
    if (first) start(info());
    box.classList.add('tap');
    sub.textContent = 'Tap Honky on the big beat, then hold: HONK - 2';
    if (state === 'opening') { state = 'intro'; timer = setTimeout(go, INTRO_MS); }
  };
  box.addEventListener('pointerdown', (e) => { if (e.isPrimary && mode === 'tap' && state === 'playing') strike(clock(), null); });

  const offToggle = onMicToggle((isOff) => { if (isOff) tapMode('mic-off'); });
  const deadPoll = setInterval(() => { if (mode === 'mic' && deadSince()) tapMode('mic-dead'); }, 1000);
  const offGrownup = grownupGestures(parent, { step: ({ since: s }) => { if (s >= opened) arrive('grownup'); } });

  (async () => {
    if (micOff()) return tapMode('mic-off');
    if (deadSince()) return tapMode('mic-dead');
    let ok = false;
    try { ok = await Promise.race([engine.listen(true).then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))]); } catch { ok = false; }
    if (state !== 'opening') return;
    if (!ok || engine.ctx?.state !== 'running') return tapMode('no-mic');
    mode = 'mic';
    start(info());
    off = engine.onNote(heard(onNote));
    state = 'intro';
    timer = setTimeout(go, INTRO_MS);
  })();

  // Start the beat: the click track, and the clock it sets.
  function go() {
    if (state !== 'intro') return;
    state = 'playing';
    if (engine.ctx) {
      const strong = (b) => b < COUNT_IN || honks.some((x) => x.beat === b);
      const { audio, lead } = renderBeat(engine.ctx.sampleRate, BPM, beats, strong);
      const { startTime } = engine.play(audio);
      t0Beat = startTime + lead + latency();
    } else t0Beat = clock() + 0.3;
    box.dataset.t0 = String(t0Beat); // beat 0 on the audio clock (tests line up sim notes with it)
    text.textContent = 'Ready…';
    sub.textContent = '';
    tick();
  }

  function onNote(n) {
    if (n.voice || n.midi < 36 || n.midi > 84) return; // not a piano key near her hands
    strike(n.time, n.midi);
  }
  function strike(time, midi) {
    if (state !== 'playing' || t0Beat == null) return;
    if (time - lastStrike < CHORD_S) return; // the same strike (a chord, a bounce)
    lastStrike = time;
    const beat = (time - t0Beat) / beatS;
    const j = judgeStrike(honks, beat);
    if (!j || beat < COUNT_IN - 1) return; // during the count-in's first beat, or after the end
    const x = honks[j.k];
    const rec = { ms: Date.now() - t0, ...(midi != null ? { midi } : {}), pattern: x.pattern, k: j.k, off: Math.round(j.off * beatS * 1000), grade: j.grade };
    if (j.grade === 'early') {
      strikes.push(rec);
      say('wait for it…', 'calm');
      flash(meter, 'car-wait', 500);
      return;
    }
    if (hit[j.k]) { strikes.push({ ...rec, again: true }); return; } // a second honk on the same beat
    strikes.push(rec);
    hit[j.k] = true;
    lights[j.k].classList.add('on');
    flash(lights[j.k], 'pop', 400);
    flash(carWrap, 'car-zoom', 600);
    say(['HONK!', 'Beep!', 'Yes!', 'HONK!', 'Vroom!'][j.k % 5]);
    const r = carWrap.getBoundingClientRect(), b = box.getBoundingClientRect();
    sparkle(box, r.right - b.left - r.width * 0.1, r.top - b.top + r.height * 0.4, ['#ffd84a', '#a6e01e', '#ffffff'], 10);
  }

  // Every frame: the road, the beat (bob + count + the hold boxes).
  function tick() {
    if (state !== 'playing') return;
    const beat = (clock() - t0Beat) / beatS;
    road.style.backgroundPositionX = `${-((beat * 60) % 50)}px`;
    const b = Math.floor(beat);
    if (b !== lastBeatShown && beat >= 0) {
      lastBeatShown = b;
      onBeat(b);
    }
    if (beat >= beats + 0.2) { arrive('done'); return; }
    raf = requestAnimationFrame(tick);
  }
  function onBeat(b) {
    flash(car, 'car-bob', 250);
    if (b < COUNT_IN) { count.textContent = String(b + 1); flash(count, 'pop', 300); text.textContent = 'Ready…'; return; }
    count.textContent = '';
    if (b >= rest && b < rest + 4) {
      text.textContent = 'Now hold it longer!';
      sub.textContent = 'HONK - 2 - 3 - 4';
      boxes.forEach((x, i) => { x.className = 'car-beat' + (i === b - rest ? ' now' : ''); });
      return;
    }
    // The honk this beat belongs to, and which of its beats this is.
    const k = honks.findIndex((x) => b >= x.beat && b < x.beat + x.len);
    if (k < 0) return;
    const x = honks[k], i = b - x.beat;
    if (i === 0) {
      text.textContent = x.pattern === 'half' ? 'HONK - 2' : 'HONK - 2 - 3 - 4';
      sub.textContent = '';
    }
    boxes.forEach((el, n) => {
      el.className = 'car-beat' + (n >= x.len ? ' off' : '') + (n <= i ? ' lit' : '') + (n === i ? ' now' : '') + (n <= i && hit[k] ? ' gold' : '');
    });
    // A honk that came just after the click lights its boxes late; catch up.
    if (i === 0) setTimeout(() => { if (hit[k]) boxes[0].classList.add('gold'); }, LATE_TOL * beatS * 1000);
  }

  function say(t, cls = '') {
    hint.textContent = t;
    hint.className = 'lion-hint car-hint show' + (cls ? ' ' + cls : '');
    flash(hint, 'pop', 300);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 900);
  }

  function cleanup() {
    off?.(); off = null;
    offToggle();
    offGrownup();
    clearInterval(deadPoll);
    clearTimeout(hintTimer);
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  }

  function arrive(by) {
    if (state === 'arriving' || state === 'over') return;
    if (mode == null) { mode = 'none'; start(info()); }
    const played = state === 'playing';
    state = 'arriving';
    cleanup();
    if (played) engine.stopAll?.(); // the click track, if a grown-up ended it early
    finish({ by, ...stats() });
    hint.className = 'lion-hint car-hint';
    count.textContent = '';
    const n = hit.filter(Boolean).length;
    text.textContent = joins ? 'Honky joined your band!' : 'Beep beep! Great driving!';
    sub.textContent = n ? `${n} honks right on the beat!` : 'Honk honk!';
    box.classList.add('arriving');
    const r = scene.getBoundingClientRect(), b = box.getBoundingClientRect();
    for (let i = 0; i < 4; i++) setTimeout(() => box.isConnected && sparkle(box, r.left - b.left + r.width * (0.2 + 0.6 * Math.random()), r.top - b.top + r.height * (0.2 + 0.5 * Math.random()), ['#ffd84a', '#a6e01e', '#ff8fb3', '#ffffff'], 14), i * 220);
    timer = setTimeout(done, JOIN_MS);
  }
  function done() { state = 'over'; box.remove(); then(); }

  return {
    quit() {
      const was = state;
      if (was !== 'arriving' && was !== 'over') { cleanup(); if (was === 'playing') engine.stopAll?.(); }
      clearTimeout(timer);
      box.remove();
      state = 'over';
      return was === 'arriving' || was === 'over' ? null : stats();
    },
  };
}
