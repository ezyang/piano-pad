// The sleeping lion (2026-10-29): a moment before Bell (adventure.js
// LION_BEFORE; pedagogy: the teacher keeps asking for a "heavy lion paw",
// arm weight into the key for a firm, full sound instead of a soft finger
// poke, and Bell's lines are marked mf and f). Roary is asleep, snoring
// "Z z z": "Wake the lion with a heavy lion paw!" Any key. Each FIRM note
// fills one of three paws; a soft one makes the lion stir and snore on ("A
// bit heavier!"). Three firm notes: a big friendly ROAR and Roary joins her
// band (a big low drum in the party). No timer, no failure.
//
// FIRM is relative to her own playing, never "as loud as you can": a note's
// attack level (engine.attackLevel: the loudest detector frame, whole-band
// dB, in the 100 ms from its attack) at least FIRM_DB above her typical
// attack, the median of her last homework notes (kept in localStorage,
// TYPICAL_KEY; DEFAULT_DB until there are MIN_NOTES). From her recordings
// 10/26-10/28 (105 judged homework notes, 5 sessions): a session's median
// attack ranges -35..-28 dB (the mic and where the iPad sits move it), so
// only her own recent notes say what's loud; within a session, Bell's f
// line (LH) was +4.7 and +6.0 dB over its mf line (RH), and 15% of her
// ordinary notes reach median +5. A very loud strike counts as one firm
// note, no more (no "too loud" message: there's no banging in the logs to
// calibrate it on). Lion notes don't go into her typical level.
//
// OCTAVE (2026-10-29, piano-audio's review): the attack level reads louder
// for low keys at the same strike (octave 2 +4.7, 3 +4.0, 5 +2.0 dB vs
// octave 4), so every level is normalized by its octave (firm.js
// normLevel: -4.5 for octave 2 and below, -4 octave 3, 0 octave 4, -2
// octave 5 and up) both when it goes into her typical level and when a lion
// note is judged. Stored levels from before have no octave and are kept
// as-is (mostly octave 4). Lion notes log both: raw and db (normalized).
//
// Notes count only from when the moment opens (the mic is listening by
// then); a chord or a bounce (notes within CHORD_S) is one strike. With the
// mic off (mic switch) or dead (mic-health's warning), or if it won't
// start, the lion wakes with a tap instead ("Tap the lion to wake it up!").
// A grown-up's TWO-FINGER TAP (→) wakes it (only a touch that began after
// the moment opened). Logged by the caller (adventure.js `lion()`).
import { h, flash, sparkle } from './dom.js';
import { lionUrl } from './pixels.js';
import { engine } from './engine.js';
import { renderRoar } from './instruments.js';
import { heard, micOff, onMicToggle } from './mic-off.js';
import { deadSince } from './mic-health.js';
import { grownupGestures } from './grownup.js';
import { FIRM_DB, normLevel, median, firmLine, judgeFirm } from './firm.js';

export { FIRM_DB };
export const PAWS = 3;
const DEFAULT_DB = -32; // her sessions' median attack, 10/26-10/28
const MIN_NOTES = 8;
const KEEP = 60;
const TYPICAL_KEY = 'pianopad.attackLevels'; // [dB normalized by octave, ...], newest last (scrap paper)
const CHORD_S = 0.15;
const ROAR_MS = 1800, JOIN_MS = 2200;

const loadLevels = () => { try { const v = JSON.parse(localStorage.getItem(TYPICAL_KEY)); return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : []; } catch { return []; } };
// A homework note's raw attack level and its midi note (screens/adventure.js).
export function rememberLevel(raw, midi) {
  const db = normLevel(raw, midi);
  if (db == null) return;
  const v = [...loadLevels(), db].slice(-KEEP);
  try { localStorage.setItem(TYPICAL_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
export function typicalLevel() {
  const v = loadLevels();
  if (v.length < MIN_NOTES) return { db: DEFAULT_DB, n: v.length, default: true };
  return { db: median(v), n: v.length };
}

// lionMoment(parent, { start(info), finish(stats), joins, then }):
// start({ typical, thr, mode }) once it knows whether it's listening;
// finish({ by: 'notes' | 'tap' | 'grownup', ms, notes, firm, ... }) as it
// wakes; then() after the roar (and the "joined" line if `joins`).
// quit() for leaving first: returns the stats so far (null once awake).
export function lionMoment(parent, { start, finish, joins, then }) {
  const t0 = Date.now(), opened = performance.now();
  const typ = typicalLevel(), thr = firmLine(typ.db);
  const lion = h('img', { class: 'lion-sprite', src: lionUrl('asleep'), alt: '' });
  const zzz = h('div', { class: 'lion-zzz' }, h('span', {}, 'Z'), h('span', {}, 'z'), h('span', {}, 'z'));
  const paws = Array.from({ length: PAWS }, () => h('span', { class: 'lion-paw' }, '🐾'));
  const text = h('div', { class: 'lion-text' }, 'Wake the lion with a heavy lion paw!');
  const sub = h('div', { class: 'lion-sub' }, 'Drop your arm into the key.');
  const hint = h('div', { class: 'lion-hint' });
  const scene = h('div', { class: 'lion-scene' }, lion, zzz, hint);
  const box = h('div', { class: 'lion-moment' }, text, sub, scene, h('div', { class: 'lion-paws' }, paws));
  parent.append(box);
  let state = 'opening', mode = null, why = null, since = Infinity, off = null, lastT = -Infinity, firm = 0, timer = 0, hintTimer = 0;
  const notes = [];
  const info = () => ({ typical: typ.db, typicalN: typ.n, thr, mode, ...(why ? { why } : {}) });
  const stats = () => ({ ms: Date.now() - t0, notes, firm, typical: typ.db, typicalN: typ.n, thr, mode, ...(why ? { why } : {}) });

  const tapMode = (reason) => {
    if (state !== 'listening' && state !== 'opening') return;
    off?.(); off = null;
    const was = state;
    state = 'tap'; mode = mode ?? 'tap'; why = reason;
    if (was === 'opening') start(info());
    box.classList.add('tap');
    text.textContent = 'Tap the lion to wake it up!';
    sub.textContent = '';
  };
  box.addEventListener('pointerdown', (e) => { if (e.isPrimary && state === 'tap') wake('tap'); });

  const offToggle = onMicToggle((isOff) => { if (isOff) tapMode('mic-off'); });
  const deadPoll = setInterval(() => { if (state === 'listening' && deadSince()) tapMode('mic-dead'); }, 1000);
  const offGrownup = grownupGestures(parent, { step: ({ since: s }) => { if (s >= opened) wake('grownup'); } });

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
    lastT = n.time;
    engine.attackLevel(n).then((raw) => {
      if (state !== 'listening') return;
      const j = judgeFirm(raw, n.midi, typ.db), hard = j.firm;
      notes.push({ ms: Date.now() - t0, midi: n.midi, raw: j.raw, db: j.db, thr, firm: hard });
      if (hard) {
        firm++;
        const paw = paws[firm - 1];
        paw.classList.add('on');
        flash(paw, 'pop', 400);
        flash(lion, 'lion-jolt', 500);
        const r = paw.getBoundingClientRect(), b = box.getBoundingClientRect();
        sparkle(box, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, ['#ffd84a', '#ff9a2e', '#ffffff'], 10);
        say(firm < PAWS ? 'Yes! A lion paw!' : '');
        if (firm >= PAWS) wake('notes');
      } else {
        flash(lion, 'lion-stir', 700);
        say('A bit heavier!');
      }
    });
  }
  function say(t) {
    hint.textContent = t;
    hint.classList.toggle('show', !!t);
    if (t) flash(hint, 'pop', 300);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('show'), 1400);
  }

  function cleanup() {
    off?.(); off = null;
    offToggle();
    offGrownup();
    clearInterval(deadPoll);
    clearTimeout(hintTimer);
  }

  function wake(by) {
    if (state === 'waking' || state === 'over') return;
    if (state === 'opening') { mode = 'none'; start(info()); }
    state = 'waking';
    cleanup();
    finish({ by, ...stats() });
    if (mode === 'mic') engine.listen(false); // the roar isn't a note; the piece listens again
    box.classList.add('waking');
    hint.classList.remove('show');
    zzz.remove();
    for (const p of paws) p.classList.add('on');
    lion.src = lionUrl('roar');
    flash(lion, 'lion-roar', 1200);
    text.textContent = 'ROAR!';
    text.classList.add('lion-roar-text');
    sub.textContent = '';
    engine.start().then(() => { if (box.isConnected) engine.play(renderRoar(engine.ctx.sampleRate)); }).catch(() => {});
    const r = scene.getBoundingClientRect(), b = box.getBoundingClientRect();
    for (let i = 0; i < 5; i++) setTimeout(() => box.isConnected && sparkle(box, r.left - b.left + r.width * (0.2 + 0.6 * Math.random()), r.top - b.top + r.height * (0.2 + 0.5 * Math.random()), ['#ffd84a', '#ff9a2e', '#ff8fb3', '#ffffff'], 14), i * 220);
    timer = setTimeout(() => {
      if (!box.isConnected) return;
      lion.src = lionUrl('awake');
      if (!joins) { done(); return; }
      text.classList.remove('lion-roar-text');
      text.textContent = 'Roary joined your band!';
      sub.textContent = 'ROAR! Boom boom!';
      flash(lion, 'hop', 350);
      timer = setTimeout(done, JOIN_MS);
    }, ROAR_MS);
  }
  function done() { state = 'over'; box.remove(); then(); }

  return {
    quit() {
      const was = state;
      if (was !== 'waking' && was !== 'over') cleanup();
      clearTimeout(timer);
      box.remove();
      state = 'over';
      return was === 'waking' || was === 'over' ? null : stats();
    },
  };
}
