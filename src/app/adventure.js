// Today's adventure: a short practice with a beginning and an end.
//   warm-up (a Build! blueprint or Copy me) → homework (the whole piece) → party
// Each finished step brings in a band member; only the homework brings the
// headliner, and the party waits for it. "Finished" means she got to the
// end, never how well she played.
//
// Nothing is saved: the adventure and its band live in memory, and a new one
// starts after a reload or an hour away. Its log is one session of kind
// 'adventure' (step start / finish / quit events), rewritten as it goes; the
// step screens log their own sessions tagged with `adventure: <id>`.
import * as log from './telemetry.js';

export const JOINS = { warmup: 'bot', homework: 'slime' }; // who each step brings in
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

export function finishStep(step) {
  const a = current();
  if (a.active === step) a.active = null;
  const first = !a.done.has(step);
  a.done.add(step);
  const m = JOINS[step];
  if (first && m && !a.band.includes(m)) { a.band.push(m); a.joined = m; }
  event('finish', { step });
}

// Left a step before finishing it (no-op once it's finished).
export function quitStep(step) {
  if (!adv || adv.active !== step) return;
  adv.active = null;
  event('quit', { step });
}
