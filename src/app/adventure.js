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
// After each homework piece she gets a drawing turn: the character editor
// on her real character, untimed (drawturn.js). Replaying a
// finished piece earns another turn, on purpose (more homework, willingly).
//
// Nothing is saved: the adventure and its band live in memory (her
// character is saved by the editor as always), and a new one
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
      turns: {}, // piece → drawing turns started after it (drawturn.js)
      drawing: null, // drawing turn in progress: { after, turn }
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
  adv.log.drawn = { ...adv.turns };
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

// Drawing turns (drawturn.js): after a homework piece (every time she
// finishes it, replays too) she edits her character. Logged as step events
// with step 'draw' (it isn't one of STEPS and never goes in `done`):
// start { after, turn }, then finish { after, turn, ms, strokes, pixels,
// by? } (✓; by: 'grownup' for a grown-up's step; `timeout: true` appears
// only in logs from before the sand timer was removed, 2026-10-05), or quit
// with the same fields if she leaves. turn: 1 for the first turn after that
// piece, 2 after a replay, ...; pixels: cells of her character changed in
// the turn; strokes: drags that changed something.
// The session carries drawn: { piece: turns }.
export const turnsAfter = (a, step) => a.turns[step] ?? 0;
export function startDraw(after) {
  const a = current();
  const turn = (a.turns[after] = turnsAfter(a, after) + 1);
  a.drawing = { after, turn };
  event('start', { step: 'draw', after, turn });
}
export function endDraw(how, stats) {
  if (!adv?.drawing) return;
  const { after, turn } = adv.drawing;
  adv.drawing = null;
  adv.touched = Date.now();
  event(how === 'finish' ? 'finish' : 'quit', { step: 'draw', after, turn, ...stats });
}

// Anything else worth a line in the adventure's log (e.g. a skip).
export function note(what, data = {}) { current(); event(what, data); }

// Left a step before finishing it (no-op once it's finished).
export function quitStep(step) {
  if (!adv || adv.active !== step) return;
  adv.active = null;
  event('quit', { step });
}
