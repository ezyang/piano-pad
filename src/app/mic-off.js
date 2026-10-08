// The grown-ups' mic switch (2026-10-08, parent: a small sibling plinks on
// the piano, or a second instrument nearby, while she practices, and the app
// judged those notes as hers). A small 🎤 button, bottom right while a screen is
// listening. A DOUBLE TAP turns listening off (a crossed-out mic) and back
// on; a single tap does nothing but flash "double tap", so neither child
// flips it by accident.
//
// While off: every note is dropped before the screen sees it (screens
// subscribe through `heard(fn)`), test-keyboard presses included. The mic
// itself stays connected (reconnecting makes the detector hear the jump as a
// note) and the detector keeps running, so its log events go on, marked
// `micOff: true`. mic-health.js treats off as "nobody is listening" (no
// recovery, no warning badge). The grown-up step still moves pieces on.
// Turning it back on drops any note whose attack came before the switch, and
// tells screens (onMicToggle) so they can drop half-heard state (a rhythm
// bar's timings).
//
// Off lasts until the switch or a reload (memory only): it's for one
// practice, and a mic left off by mistake after a reload would look like a
// broken app.
//
// Log: `mic` events { off: true | false, at (ms, audio clock, like detector
// events), by: 'double-tap' } in the current session; a session that starts
// while off begins with { off: true, at, by: 'start' }. An audio recording
// keeps going (the times line up with it), so the off stretches are these
// marks.
import { h } from './dom.js';
import { engine } from './engine.js';
import { event, ctxMs } from './telemetry.js';

const DOUBLE_MS = 450;     // two taps within this = a double tap
const TICK_MS = 300;

let off = false;
let onAt = 0, onCtx = null; // audio-clock time listening last came back on (on that context's clock)
let lastTap = 0;
let btn = null, hint = null, hintTimer = 0;
const toggles = new Set();

export const micOff = () => off;

// Wrap a note listener: notes go through only while the mic is on, and none
// from before it came back on.
export const heard = (fn) => (n) => { if (!off && !(engine.ctx === onCtx && n.time < onAt)) fn(n); };

// fn(off) after every switch.
export function onMicToggle(fn) { toggles.add(fn); return () => toggles.delete(fn); }

export function setMicOff(v, by = 'double-tap') {
  v = !!v;
  if (v === off) return;
  off = v;
  if (!off) { onAt = engine.now(); onCtx = engine.ctx; }
  event('mic', { off, at: ctxMs(engine.now()), by });
  draw();
  for (const fn of toggles) { try { fn(off); } catch (e) { console.error(e); } }
}

function tap(e) {
  e.preventDefault();
  e.stopPropagation();
  const t = performance.now();
  if (t - lastTap < DOUBLE_MS) { lastTap = 0; clearTimeout(hintTimer); hint.classList.remove('show'); setMicOff(!off); return; }
  lastTap = t;
  showHint();
}

function showHint() {
  hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint?.classList.remove('show'), 1200);
}

function draw() {
  if (!btn) return;
  btn.classList.toggle('off', off);
  btn.setAttribute('aria-label', off ? 'Microphone off (double tap to turn on)' : 'Microphone on (double tap to turn off)');
  document.body.classList.toggle('mic-off', off);
}

// Shown while a screen is listening (not on calibration, audio's grown-up
// tool, which needs the mic).
const wanted = () => engine.listening && !/^#\/?calibrate/.test(location.hash);

function tick() {
  if (wanted()) {
    if (!btn) {
      hint = h('span', { class: 'mic-switch-hint' }, 'double tap');
      btn = h('button', { class: 'mic-switch', type: 'button' }, h('span', { class: 'mic-switch-icon' }, h('span', { class: 'mic-switch-glyph' }, '🎤')), hint);
      // Taps here are the grown-up's, not hers: keep them from the screen
      // (e.g. "tap anywhere" panels).
      btn.addEventListener('pointerdown', tap);
      for (const t of ['click', 'touchstart', 'touchend', 'pointerup']) btn.addEventListener(t, (e) => e.stopPropagation(), { passive: t !== 'click' });
      document.body.append(btn);
      draw();
    }
  } else if (btn) { btn.remove(); btn = hint = null; }
}

setInterval(tick, TICK_MS);
addEventListener('hashchange', () => setTimeout(tick, 0));

// For testing in a browser console.
window.__micOff = { set: setMicOff, get off() { return off; }, tick };
