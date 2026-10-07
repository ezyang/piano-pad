// Today's adventure: a short practice with a beginning and an end, the same
// path every day so she does all the material (the parent's call). This
// week's homework, easiest melody first:
//   Zebra → Sea → Ode → party
// (Zebra → Train → Ode 2026-09-30..10-07; Train is in the party now, with
// the other earlier homework.)
// Each step unlocks the next. Finishing Zebra and then Sea each lets her
// pick a band member (Froggy, Beep Bot or Buzzy); Ode brings the headliner,
// a surprise guest (Blobby, Kitty, Sparky or Waddles: GUESTS), and the party
// waits for it. "Finished"
// means she got to the end, never how well she played. Build! and Copy me
// are free play, outside the adventure.
//
// After each homework piece she gets a pair of jewels (jewels.js): two
// shiny pixels to place on her character, about ten seconds. Replaying a
// finished piece earns another pair, on purpose (more homework, willingly).
// (A drawing turn after every piece until 2026-10-05, then one right before
// the party until 2026-10-06; drawing is in the Me screen now.)
//
// Nothing is saved: the adventure and its band live in memory (her
// character is saved by the editor as always), and a new one
// starts after a reload or an hour away. Its log is one session of kind
// 'adventure' (step start / finish / quit and pick events), rewritten as it
// goes; the pieces log their own sessions tagged with `adventure: <id>`.
// The guest: session `guest` and open { guest } (drawn; before 2026-10-06
// always Blobby, 'slime'), and the finish of Ode that brings it has
// joined: <id>.
import * as log from './telemetry.js';

export const STEPS = ['zebra', 'sea', 'ode', 'party'];
export const PICKING = ['zebra', 'sea']; // finishing these earns a pick
// The last piece brings a surprise guest, a different one from the last
// adventure's (2026-10-06: she asked why it was always Blobby). Drawn when
// the adventure starts, kept secret on the map (⭐) until it joins; the one
// she met is remembered in LAST_GUEST (lost on a clean slate, which is fine).
export const GUESTS = ['slime', 'cat', 'dragon', 'penguin'];
const LAST_GUEST = 'pianopad.lastGuest';
const HEADLINING = 'ode';
function drawGuest() {
  let last = null;
  try { last = localStorage.getItem(LAST_GUEST); } catch { /* none */ }
  const pool = GUESTS.filter((id) => id !== last);
  return pool[Math.floor(Math.random() * pool.length)];
}
export const PICKS = ['frog', 'bot', 'bee'];
const STALE_MS = 60 * 60 * 1000;

let adv = null;

// The adventure in progress, without starting one (null if none).
export const peek = () => (adv && Date.now() - adv.touched <= STALE_MS ? adv : null);

export function current() {
  if (!adv || Date.now() - adv.touched > STALE_MS) {
    const t0 = Date.now();
    adv = {
      id: 'a' + t0.toString(36) + Math.random().toString(36).slice(2, 6),
      t0, touched: t0,
      done: new Set(),
      band: ['piano'],
      guest: drawGuest(), // the headliner, a secret until Ode is done
      active: null, // step in progress
      joined: null, // band member to welcome on the map
      jewels: {}, // piece → jewels earned after it (jewels.js; two a turn)
      pairs: {}, // piece → jewel turns that earned any
      jeweling: null, // jewel turn in progress: { after, color, turn }
    };
    adv.log = { ...log.sessionHeader('adventure', adv.id), guest: adv.guest, events: [] };
    event('open', { guest: adv.guest });
  }
  adv.touched = Date.now();
  return adv;
}

function event(what, data = {}) {
  adv.log.events.push([Date.now() - adv.t0, 'step', { what, ...data }]);
  adv.log.done = [...adv.done];
  adv.log.band = adv.band;
  adv.log.jewels = { ...adv.jewels };
  log.record(adv.log);
}

// A step is open once the one before it is done (done ones stay open).
export const unlocked = (a, step) => STEPS.indexOf(step) === 0 || a.done.has(STEPS[STEPS.indexOf(step) - 1]);
export const nextStep = (a) => STEPS.find((s) => !a.done.has(s)) ?? 'party';

export function startStep(step, info = {}) {
  const a = current();
  if (a.active && a.active !== step) quitStep(a.active);
  a.active = step;
  event('start', { step, ...info });
  return a.id;
}

export function finishStep(step, info = {}) {
  const a = current();
  if (a.active === step) a.active = null;
  const first = !a.done.has(step);
  a.done.add(step);
  let joined;
  if (first && step === HEADLINING && !a.band.includes(a.guest)) {
    a.band.push(a.guest);
    a.joined = joined = a.guest;
    try { localStorage.setItem(LAST_GUEST, a.guest); } catch { /* storage unavailable */ }
  }
  event('finish', { step, ...info, ...(joined ? { joined } : {}) });
}

// Picks earned (one per finished picking step) but not yet made.
const picked = (a) => a.band.filter((id) => PICKS.includes(id));
export const pickPending = (a) => PICKING.filter((s) => a.done.has(s)).length > picked(a).length;
export const pickable = (a) => PICKS.filter((id) => !a.band.includes(id));

export function pick(id) {
  const a = current();
  if (!pickPending(a) || !pickable(a).includes(id)) return;
  a.band.splice(1 + picked(a).length, 0, id); // lineup: her, her picks, the headliner
  a.joined = id;
  event('pick', { member: id });
}

// Jewels (jewels.js): after a homework piece (every time she finishes it,
// replays too) she places a pair of jewels on her character. Logged as step
// events with step 'jewel' (never in `done`): start { after, color, turn },
// then finish { after, color, turn, cells, ms, moves, by? } (✓; by:
// 'grownup' for a grown-up's step, which places any she hadn't), or quit
// with the same fields if she leaves (a null in cells: not placed, not
// kept). color: the gem name (pixels.js GEMS: gold, ruby, diamond, emerald,
// amethyst, sapphire; logs before the gems have a Build block name:
// planks, stone ...); cells: [first, second], indexes in her 10x14 grid
// (logs before 2026-10-06 have one `cell`); moves: times she moved one
// after placing it. turn: 1, 2, ... per piece. The session carries
// jewels: { piece: jewels earned } (two per turn now). Logs up to
// 2026-10-06 also have step 'draw' turns and `drawn: { piece: n }`.
export const jewelsAfter = (a, step) => a.jewels[step] ?? 0;
export const pairsAfter = (a, step) => a.pairs[step] ?? 0;
export function startJewel(after, color) {
  const a = current();
  const turn = (a.jewelTurns ??= {})[after] = (a.jewelTurns[after] ?? 0) + 1;
  a.jeweling = { after, color, turn };
  event('start', { step: 'jewel', after, color, turn });
}
export function endJewel(how, stats) {
  if (!adv?.jeweling) return;
  const { after, color, turn } = adv.jeweling;
  adv.jeweling = null;
  adv.touched = Date.now();
  const got = stats.cells.filter((i) => i != null).length;
  if (got) { adv.jewels[after] = jewelsAfter(adv, after) + got; adv.pairs[after] = pairsAfter(adv, after) + 1; }
  event(how === 'finish' ? 'finish' : 'quit', { step: 'jewel', after, color, turn, ...stats });
}

// Anything else worth a line in the adventure's log (e.g. a skip).
export function note(what, data = {}) { current(); event(what, data); }

// Left a step before finishing it (no-op once it's finished).
export function quitStep(step) {
  if (!adv || adv.active !== step) return;
  adv.active = null;
  event('quit', { step });
}
