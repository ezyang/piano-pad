// Today's adventure: a short practice with a beginning and an end.
//   warm-up (a Build! blueprint, Copy me, or the G piece) → homework (the
//   piece she picks, played whole) → party
// Each finished step brings in a band member: after the warm-up she picks
// who joins (Froggy, Beep Bot or Buzzy); the homework brings the headliner
// (Blobby), and the party waits for it. "Finished" means she got to the
// end, never how well she played.
//
// Nothing is saved: the adventure and its band live in memory, and a new one
// starts after a reload or an hour away. Its log is one session of kind
// 'adventure' (step start / finish / quit events), rewritten as it goes; the
// step screens log their own sessions tagged with `adventure: <id>`.
import * as log from './telemetry.js';

export const HEADLINER = 'slime'; // the homework brings Blobby
export const PICKS = ['frog', 'bot', 'bee']; // the warm-up lets her choose one
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
      active: null, // step in progress
      joined: null, // band member to welcome on the map
    };
    adv.log = { ...log.sessionHeader('adventure', adv.id), events: [] };
    event('open');
  }
  adv.touched = Date.now();
  return adv;
}

function event(what, data = {}) {
  adv.log.events.push([Date.now() - adv.t0, 'step', { what, ...data }]);
  adv.log.done = [...adv.done];
  adv.log.band = adv.band;
  log.record(adv.log);
}

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
  if (info.piece) a.piece = info.piece; // the party plays the homework she picked
  const first = !a.done.has(step);
  a.done.add(step);
  if (first && step === 'homework' && !a.band.includes(HEADLINER)) { a.band.push(HEADLINER); a.joined = HEADLINER; }
  event('finish', { step, ...info });
}

// Waiting for her to pick the warm-up's band member (the map asks).
export const pickPending = (a) => a.done.has('warmup') && !a.band.some((id) => PICKS.includes(id));

export function pick(id) {
  const a = current();
  if (!pickPending(a) || !PICKS.includes(id)) return;
  a.band.splice(1, 0, id); // lineup: her, her pick, the headliner
  a.joined = id;
  event('pick', { member: id });
}

// Left a step before finishing it (no-op once it's finished).
export function quitStep(step) {
  if (!adv || adv.active !== step) return;
  adv.active = null;
  event('quit', { step });
}
