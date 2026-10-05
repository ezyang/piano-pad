// Today's adventure: a short practice with a beginning and an end, the same
// path every day so she does all the material (the parent's call). This
// week's homework, easiest melody first:
//   Zebra → Train → Ode → party
// Each step unlocks the next. Finishing Zebra and then Train each lets her
// pick a band member (Froggy, Beep Bot or Buzzy); Ode brings the headliner
// (Blobby), and the party waits for it. "Finished"
// means she got to the end, never how well she played. Build! and Copy me
// are free play, outside the adventure.
//
// After each homework piece she draws a costume part for her character
// (costume time, see costume.js), worn for the rest of the adventure.
//
// Nothing is saved: the adventure, its band and costume live in memory, and a new one
// starts after a reload or an hour away. Its log is one session of kind
// 'adventure' (step start / finish / quit and pick events), rewritten as it
// goes; the pieces log their own sessions tagged with `adventure: <id>`.
import * as log from './telemetry.js';

export const STEPS = ['zebra', 'train', 'ode', 'party'];
export const PICKING = ['zebra', 'train']; // finishing these earns a pick
export const HEADLINER = 'slime'; // the last piece brings Blobby
const HEADLINING = 'ode';
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
      active: null, // step in progress
      joined: null, // band member to welcome on the map
      costume: {}, // part → layer she drew (costume.js); memory only, like the band
      drawing: null, // costume time in progress: { part, after }
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
  adv.log.costume = Object.fromEntries(Object.entries(adv.costume).map(([p, layer]) => [p, layer.filter((v) => v >= 0).length]));
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
  if (first && step === HEADLINING && !a.band.includes(HEADLINER)) { a.band.push(HEADLINER); a.joined = HEADLINER; }
  event('finish', { step, ...info });
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

// Costume time (costume.js): after a homework piece she draws one costume
// part. Logged as step events with step 'costume' (it isn't one of STEPS and
// never goes in `done`): start { part, after }, then finish { part, after,
// ms, pixels, strokes, before? } on ✓, or quit with the same fields if she
// leaves. pixels: the part's pixels now; before: what it had at the start
// (a replayed piece); strokes: drags that changed something.
export function startCostume(part, after) {
  const a = current();
  a.drawing = { part, after };
  event('start', { step: 'costume', part, after });
}
export function endCostume(how, stats) {
  if (!adv?.drawing) return;
  const { part, after } = adv.drawing;
  adv.drawing = null;
  adv.touched = Date.now();
  event(how === 'finish' ? 'finish' : 'quit', { step: 'costume', part, after, ...stats });
}

// Anything else worth a line in the adventure's log (e.g. a skip).
export function note(what, data = {}) { current(); event(what, data); }

// Left a step before finishing it (no-op once it's finished).
export function quitStep(step) {
  if (!adv || adv.active !== step) return;
  adv.active = null;
  event('quit', { step });
}
