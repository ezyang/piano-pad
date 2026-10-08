// Is the mic actually hearing anything? (2026-10-06: a whole evening of
// homework on the iPad came in as exact digital silence, -120 dB from the
// first second, with a live "iPad Microphone" track and a running context.
// Even the MediaRecorder copy of the raw track was silent, so iOS handed us
// a dead input; nobody noticed until the logs.)
//
// While a screen is listening, every 0.5 s: the input is dead if the track
// has ended, the audio context isn't running, the track is muted, or the
// detector's input level has been exactly -120 dB (all zeros; a real mic in
// a quiet room is around -70..-90) for SILENT_MS. Dead for SILENT_MS → try
// to recover on our own: resume the context if that's the problem, else
// get the mic again (engine.restartMic: new getUserMedia stream and a new
// input node), then start over like a reload (engine.reopen: new context,
// detector and mic; restarting the app is what cured it that evening).
// Still dead after AUTO_TRIES → a small grown-up badge
// "🎤✕ not hearing · tap to retry" (a tap retries; it doesn't cover or block
// anything else). Quiet retries continue in the background with backoff.
// Every check that changes something is logged in the current session as a
// `mic` event { state, muted, readyState, ctxState, action, ok, by, n }.
import { h } from './dom.js';
import { engine } from './engine.js';
import { event } from './telemetry.js';
import { micOff } from './mic-off.js';

const TICK_MS = 500;
const SILENT_MS = 3000;
const AUTO_TRIES = 2;            // failed automatic tries before the badge
const BACKOFF_MS = [0, 1000, 15000, 60000]; // wait after the nth failure (last repeats)
const SETTLE_MS = 3000;          // after an attempt, how long to wait for sound

let badSince = 0;                // when the input started looking dead
let dead = false;                // reported dead (an attempt was made)
let tries = 0;                   // attempts since it was last healthy
let nextTry = 0;
let busy = false;
let badge = null;

const ZERO_DB = -119.9;

// What the track and context say right now.
export function micStatus() {
  const t = engine.stream?.getAudioTracks?.()[0];
  return { muted: !!t?.muted, readyState: t?.readyState ?? 'none', ctxState: engine.ctx?.state ?? 'none' };
}

function classify(s, silentFor) {
  if (s.readyState !== 'live') return 'ended';
  if (s.ctxState !== 'running') return 'suspended';
  if (s.muted) return 'muted';
  if (silentFor >= SILENT_MS) return 'silent';
  return 'ok';
}

const log = (state, action, ok, extra = {}) => event('mic', { state, ...micStatus(), action, ok, ...extra });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms) => Promise.race([Promise.resolve(p).then(() => true, () => false), sleep(ms).then(() => false)]);

// After an attempt: does the input come alive (any level above zero) within SETTLE_MS?
async function settles() {
  const until = performance.now() + SETTLE_MS;
  // engine.level holds the last frame's level; it only means something once
  // frames from the new input have arrived, so wait for a non-zero one.
  while (performance.now() < until) {
    await sleep(100);
    const s = micStatus();
    if (s.readyState === 'live' && s.ctxState === 'running' && !s.muted && engine.level > ZERO_DB) return true;
  }
  return false;
}

// One recovery attempt. by: 'auto' | 'tap'.
async function recover(state, by) {
  if (busy || micOff()) return;
  busy = true;
  tries++;
  showBadge(true);
  let action = 'resume', ok = false, err;
  try {
    // A suspended context with a good track: resuming is enough (and cheap).
    // Otherwise get the mic again; then start over like a reload (new
    // context + mic, what fixed it on 2026-10-06), alternating after that.
    // A tap always starts over (a tap is when iOS lets a new context run).
    if (state === 'suspended' && tries === 1 && by === 'auto') {
      await within(engine.ctx?.resume(), 1500);
    } else if (by === 'auto' && tries % 2 === 1) {
      action = 'reacquire';
      if (engine.ctx && engine.ctx.state !== 'running') await within(engine.ctx.resume(), 1500);
      await within(engine.restartMic(), 5000);
      if (engine.ctx && engine.ctx.state !== 'running') await within(engine.ctx.resume(), 1500);
    } else {
      action = 'reopen';
      if (!(await within(engine.reopen(), 6000))) err = 'reopen failed or timed out';
    }
    if (!engine.stream) err = 'no stream';
    ok = await settles();
  } catch (e) { err = String(e?.message ?? e).slice(0, 200); }
  log(state, action, ok, { by, n: tries, ...(err ? { err } : {}) });
  busy = false;
  if (ok) healthy();
  else {
    nextTry = performance.now() + BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)];
    showBadge(false);
  }
}

function healthy() {
  badSince = 0;
  dead = false;
  tries = 0;
  nextTry = 0;
  hideBadge();
}

let zeroSince = 0;
function tick() {
  if (busy) return;
  if (!engine.listening || !engine.stream || micOff()) {
    // Nobody is listening (or the grown-ups switched the mic off,
    // mic-off.js): nothing to warn about. Start over next time.
    zeroSince = 0; badSince = 0;
    if (!dead) hideBadge();
    else { dead = false; tries = 0; hideBadge(); }
    return;
  }
  const now = performance.now();
  zeroSince = engine.level <= ZERO_DB ? (zeroSince || now) : 0;
  const s = micStatus();
  const state = classify(s, zeroSince ? now - zeroSince : 0);
  if (state === 'ok') {
    if (dead) log('ok', 'none', true); // came back by itself
    if (dead || badge) healthy();
    badSince = 0;
    return;
  }
  badSince ||= now;
  if (now - badSince < (state === 'silent' ? 0 : SILENT_MS)) return; // 'silent' already waited
  if (!dead) { dead = true; log(state, 'detected', false); }
  if (now >= nextTry) recover(state, 'auto');
}

function showBadge(trying) {
  if (!trying && tries < AUTO_TRIES) return;
  if (!badge) {
    if (trying) return; // don't flash the badge for a quick automatic fix
    badge = h('button', { class: 'mic-badge', type: 'button', onclick: (e) => { e.stopPropagation(); retryTap(); } });
    badge.addEventListener('pointerdown', (e) => e.stopPropagation());
    badge.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    document.body.append(badge);
  }
  badge.classList.toggle('trying', trying);
  badge.textContent = trying ? '🎤 trying…' : '🎤✕ not hearing · tap to retry';
}

function hideBadge() { badge?.remove(); badge = null; }

function retryTap() {
  if (busy) return;
  const s = micStatus();
  // A tap is a user gesture: the best moment for resume() / getUserMedia on iOS.
  recover(classify(s, SILENT_MS), 'tap');
}

setInterval(tick, TICK_MS);
// For testing in a browser console.
window.__micHealth = { micStatus, tick, get state() { return { dead, tries, busy, badge: !!badge }; } };
