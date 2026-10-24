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
// input node). Still dead after AUTO_TRIES → a grown-up badge (top right)
// "The microphone isn't hearing anything. Close the app fully (swipe it away)
// or restart the iPad. Tap here to try again." A tap starts over like a
// reload (engine.reopen: new context, detector and mic). Only a tap does
// that: on iOS an automatic reopen nearly always failed (the new context
// stays suspended without a gesture, "no stream", ~10 s with no input).
// Quiet reacquire retries continue in the background with backoff.
//
// A DEAD MIC IS REMEMBERED ACROSS LOADS (2026-10-23: 10/16-10/19, 27 homework
// sessions over 5 app loads came in as exact silence; the grown-up running
// practice never noticed and tapped every note through, and the in-piece badge
// got one tap). Giving up (the badge) sets localStorage DEAD_KEY = when; while
// it's set, the home screen and the adventure map show a plain grown-up note
// "The microphone hasn't heard anything since <day>. Close the app fully
// (swipe it away) or restart the iPad.", and the badge comes up at once
// inside a piece. On those two screens, after the first tap, the mic is
// opened (engine.restartMic) just to check it. The first real input (a
// changing level above zero, listening or not) clears it, and the note says
// "The microphone is hearing again" for a few seconds.
//
// Every check that changes something is logged in the current session as a
// `mic` event { state, muted, readyState, ctxState, action, ok, by, n }
// (action 'gave-up' { since } when the flag is set, 'cleared' { since } when
// real input clears it; the session header carries `micDeadSince` while set).
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
const DEAD_KEY = 'pianopad.micDead'; // ISO time the mic was last given up on (see top)
const AGAIN_MS = 4000;          // "hearing again" shows this long

export function deadSince() { try { return localStorage.getItem(DEAD_KEY); } catch { return null; } }
function setDead(state) {
  if (deadSince()) return;
  const since = new Date().toISOString();
  try { localStorage.setItem(DEAD_KEY, since); } catch { /* storage unavailable */ }
  event('mic', { state, action: 'gave-up', since });
  drawWarn();
}
function clearDead() {
  const since = deadSince();
  if (!since) return;
  try { localStorage.removeItem(DEAD_KEY); } catch {}
  event('mic', { state: 'ok', action: 'cleared', since });
  againUntil = performance.now() + AGAIN_MS;
  drawWarn();
}

// Real input: the level is above zero and moving. engine.level starts at a
// placeholder (-100) and keeps the last frame's value, so an input that sends
// no frames at all looks like a frozen level; a real mic's level changes
// every frame.
let lastLevel = null, liveTicks = 0;
function realInput() {
  const L = engine.level;
  const moving = lastLevel !== null && L !== lastLevel;
  lastLevel = L;
  liveTicks = moving && L > ZERO_DB && engine.stream ? liveTicks + 1 : 0;
  return liveTicks >= 2;
}

// What the track and context say right now.
export function micStatus() {
  const t = engine.stream?.getAudioTracks?.()[0];
  return { muted: !!t?.muted, readyState: t?.readyState ?? 'none', ctxState: engine.ctx?.state ?? 'none' };
}

function classify(s, silentFor) {
  // silentFor: exact zeros, or a level that hasn't moved at all (no frames).
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
    // Otherwise get the mic again. Starting over like a reload (new
    // context + mic) only from a grown-up's tap: iOS lets a new context
    // run only in a gesture (automatic reopens failed nearly every time).
    if (state === 'suspended' && tries === 1 && by === 'auto') {
      await within(engine.ctx?.resume(), 1500);
    } else if (by === 'auto') {
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
    if (tries >= AUTO_TRIES) setDead(state); // given up: remember it across loads
  }
}

function healthy() {
  badSince = 0;
  dead = false;
  tries = 0;
  nextTry = 0;
  hideBadge();
}

let zeroSince = 0, stuckSince = 0;
function tick() {
  if (busy) return;
  const live = realInput();
  if (live) clearDead();
  drawWarn();
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
  stuckSince = engine.level === lastStuck ? (stuckSince || now) : 0;
  lastStuck = engine.level;
  const s = micStatus();
  const quietSince = zeroSince || stuckSince;
  const state = classify(s, quietSince ? now - quietSince : 0);
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

let lastStuck = null;

function showBadge(trying) {
  // Known dead since an earlier load (or earlier today): no need to wait.
  if (!trying && tries < AUTO_TRIES && !deadSince()) return;
  if (!badge) {
    if (trying) return; // don't flash the badge for a quick automatic fix
    badge = h('button', { class: 'mic-badge', type: 'button', onclick: (e) => { e.stopPropagation(); retryTap(); } });
    badge.addEventListener('pointerdown', (e) => e.stopPropagation());
    badge.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    document.body.append(badge);
  }
  badge.classList.toggle('trying', trying);
  badge.replaceChildren(...(trying ? ['🎤 Trying…'] : [
    h('b', {}, "🎤✕ The microphone isn't hearing anything."), ' ',
    h('span', {}, 'Close the app fully (swipe it away) or restart the iPad. Tap here to try again.'),
  ]));
}

function hideBadge() { badge?.remove(); badge = null; }

function retryTap() {
  if (busy) return;
  const s = micStatus();
  // A tap is a user gesture: the best moment for resume() / getUserMedia on iOS.
  recover(classify(s, SILENT_MS), 'tap');
}

// --- the grown-up note on the home screen and the adventure map ---

let warn = null, againUntil = 0;
const onWarnScreen = () => {
  const r = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return r === '' ? 'home' : r === 'adventure' ? 'map' : null;
};

// "today" / "since yesterday" / "since Friday" / "since Oct 16"
export function sinceText(iso, now = new Date()) {
  const d = new Date(iso);
  if (isNaN(d)) return 'for a while';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'since yesterday';
  if (days < 7) return 'since ' + d.toLocaleDateString('en-US', { weekday: 'long' });
  return 'since ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function drawWarn() {
  const where = onWarnScreen();
  const since = deadSince();
  const again = !since && performance.now() < againUntil;
  if (!where || (!since && !again)) { warn?.remove(); warn = null; return; }
  const text = again ? '🎤 The microphone is hearing again.'
    : `🎤 Grown-ups: the microphone hasn't heard anything ${sinceText(since)}. Close the app fully (swipe it away) or restart the iPad.`;
  if (!warn) { warn = h('div', { class: 'mic-warn', role: 'status' }); document.body.append(warn); }
  warn.className = `mic-warn at-${where}${again ? ' again' : ''}`;
  if (warn.textContent !== text) warn.textContent = text;
}

// On the home screen / map with a dead mic remembered: once a tap has
// started audio (main.js), open the mic just to check it (nobody listens to
// it; the level alone tells, see realInput).
addEventListener('pointerdown', () => {
  if (!deadSince() || !onWarnScreen()) return;
  setTimeout(async () => {
    try { await engine.starting; } catch { return; }
    if (deadSince() && engine.ctx && !engine.stream && !engine.acquiring && !engine.listening) engine.restartMic();
  }, 0);
});
addEventListener('hashchange', () => setTimeout(drawWarn, 0));
drawWarn();

setInterval(tick, TICK_MS);
// For testing in a browser console.
window.__micHealth = { micStatus, tick, deadSince, sinceText, get state() { return { dead, tries, busy, badge: !!badge, warn: warn?.textContent ?? null }; } };
