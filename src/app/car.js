// The honk car (2026-11-21): a moment before Driving (adventure.js
// CAR_BEFORE; the parent picked it to replace the sleeping lion). A little
// car rolls in: "Honk the horn! Play C and G together!" Every strike she
// plays (any key; a chord or a bounce, notes within CHORD_S, is one)
// makes it honk and bounce and lights one of HONKS horns. All lit: "Honky
// joined your band!" and the car drives off to the band, where it honks
// the chords' roots in the party (instruments.js 'honk'). No timer, no
// failure: every note counts.
//
// The honk comes out of the speaker, so notes are ignored for DEAF_S after
// each one (the mic would hear it). With the mic off (mic switch) or dead
// (mic-health), or if it won't start, a tap honks instead ("Tap the car!").
// A grown-up's TWO-FINGER TAP (→) finishes it (a touch that began after the
// moment opened). Logged by the caller (adventure.js `car()`).
import { h, flash, sparkle } from './dom.js';
import { carUrl } from './pixels.js';
import { engine } from './engine.js';
import { renderHonk } from './instruments.js';
import { heard, micOff, onMicToggle } from './mic-off.js';
import { deadSince } from './mic-health.js';
import { grownupGestures } from './grownup.js';

export const HONKS = 5;
const CHORD_S = 0.15;
const DEAF_S = 0.55;
const JOIN_MS = 2400;

// carMoment(parent, { start(info), finish(stats), joins, then }): like the
// lion's. start({ mode, why? }) once it knows whether it's listening;
// finish({ by: 'notes' | 'tap' | 'grownup', ms, notes: [{ms, midi}], honks,
// mode, why? }) when the last horn lights; then() after the car drives off.
// quit() for leaving first: the stats so far (null once finished).
export function carMoment(parent, { start, finish, joins, then }) {
  const t0 = Date.now(), opened = performance.now();
  const car = h('img', { class: 'car-sprite', src: carUrl(), alt: '' });
  const horns = Array.from({ length: HONKS }, () => h('span', { class: 'car-horn' }, '📯'));
  const text = h('div', { class: 'lion-text' }, 'Honk the horn!');
  const sub = h('div', { class: 'lion-sub' }, 'Play C and G together: beep!');
  const hint = h('div', { class: 'lion-hint' });
  const scene = h('div', { class: 'car-scene' }, h('div', { class: 'car-road' }), h('div', { class: 'car-wrap' }, car), hint);
  const box = h('div', { class: 'lion-moment car-moment' }, text, sub, scene, h('div', { class: 'lion-paws' }, horns));
  parent.append(box);
  let state = 'opening', mode = null, why = null, since = Infinity, off = null, lastT = -Infinity, deafUntil = -Infinity, honks = 0, timer = 0, hintTimer = 0;
  const notes = [];
  const info = () => ({ mode, ...(why ? { why } : {}) });
  const stats = () => ({ ms: Date.now() - t0, notes, honks, mode, ...(why ? { why } : {}) });

  const tapMode = (reason) => {
    if (state !== 'listening' && state !== 'opening') return;
    off?.(); off = null;
    const was = state;
    state = 'tap'; mode = mode ?? 'tap'; why = reason;
    if (was === 'opening') start(info());
    box.classList.add('tap');
    text.textContent = 'Tap the car to honk!';
    sub.textContent = '';
  };
  box.addEventListener('pointerdown', (e) => { if (e.isPrimary && state === 'tap') honk(); });

  const offToggle = onMicToggle((isOff) => { if (isOff) tapMode('mic-off'); });
  const deadPoll = setInterval(() => { if (state === 'listening' && deadSince()) tapMode('mic-dead'); }, 1000);
  const offGrownup = grownupGestures(parent, { step: ({ since: s }) => { if (s >= opened) arrive('grownup'); } });

  (async () => {
    if (micOff()) return tapMode('mic-off');
    if (deadSince()) return tapMode('mic-dead');
    let ok = false;
    try { ok = await Promise.race([engine.listen(true).then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))]); } catch { ok = false; }
    if (state !== 'opening') return;
    if (!ok || engine.ctx?.state !== 'running') return tapMode('no-mic');
    since = engine.now();
    state = 'listening'; mode = 'mic';
    start(info());
    off = engine.onNote(heard(onNote));
  })();

  function onNote(n) {
    if (state !== 'listening' || n.time < since || n.voice) return;
    if (n.time - lastT < CHORD_S) return; // the same strike (a chord, a bounce)
    if (n.time < deafUntil) return; // the horn itself
    lastT = n.time;
    notes.push({ ms: Date.now() - t0, midi: n.midi });
    honk();
  }
  function honk() {
    if (state !== 'listening' && state !== 'tap') return;
    honks++;
    if (engine.ctx) {
      deafUntil = engine.now() + DEAF_S;
      engine.play(renderHonk(engine.ctx.sampleRate));
    }
    const horn = horns[honks - 1];
    horn.classList.add('on');
    flash(horn, 'pop', 400);
    flash(car, 'car-bounce', 450);
    const r = horn.getBoundingClientRect(), b = box.getBoundingClientRect();
    sparkle(box, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, ['#ffd84a', '#a6e01e', '#ffffff'], 10);
    say(['Beep!', 'Honk!', 'Beep beep!', 'HONK!', ''][honks - 1] ?? '');
    if (honks >= HONKS) arrive(state === 'tap' ? 'tap' : 'notes');
  }
  function say(t) {
    hint.textContent = t;
    hint.classList.toggle('show', !!t);
    if (t) flash(hint, 'pop', 300);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 1000);
  }

  function cleanup() {
    off?.(); off = null;
    offToggle();
    offGrownup();
    clearInterval(deadPoll);
    clearTimeout(hintTimer);
  }

  function arrive(by) {
    if (state === 'arriving' || state === 'over') return;
    if (state === 'opening') { mode = 'none'; start(info()); }
    state = 'arriving';
    cleanup();
    finish({ by, ...stats() });
    for (const x of horns) x.classList.add('on');
    hint.classList.remove('show');
    text.textContent = joins ? 'Honky joined your band!' : 'Beep beep! Off we go!';
    sub.textContent = joins ? 'Honk honk!' : '';
    box.classList.add('arriving');
    const r = scene.getBoundingClientRect(), b = box.getBoundingClientRect();
    for (let i = 0; i < 4; i++) setTimeout(() => box.isConnected && sparkle(box, r.left - b.left + r.width * (0.2 + 0.6 * Math.random()), r.top - b.top + r.height * (0.2 + 0.5 * Math.random()), ['#ffd84a', '#a6e01e', '#ff8fb3', '#ffffff'], 14), i * 220);
    timer = setTimeout(done, JOIN_MS);
  }
  function done() { state = 'over'; box.remove(); then(); }

  return {
    quit() {
      const was = state;
      if (was !== 'arriving' && was !== 'over') cleanup();
      clearTimeout(timer);
      box.remove();
      state = 'over';
      return was === 'arriving' || was === 'over' ? null : stats();
    },
  };
}
