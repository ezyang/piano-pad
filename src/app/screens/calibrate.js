// Grown-up tool: guided, labeled recordings for tuning the detector. Each
// prompt says exactly what to play; its recording is logged as a
// 'calibration' session with the prompt, so the audio has ground truth
// (which notes, how many, how loud). What the detector heard shows live.
import { h } from '../dom.js';
import { engine } from '../engine.js';
import { noteName } from '../music.js';
import * as log from '../telemetry.js';

// Each step: what to play (`notes`, in order). Optional `alt`: other notes
// that also count for each position (e.g. the neighbour key caught by
// accident). `extrasOk`: uncontrolled sounds are expected (a splat, the
// little one), so extra detections don't count against the detector.
const BASIC = [
  { id: 'g-soft', say: 'Play G (above middle C) 5 times, SOFTLY, about one per second.', notes: [67, 67, 67, 67, 67] },
  { id: 'g-medium', say: 'Play G 5 times, medium loud, one per second.', notes: [67, 67, 67, 67, 67] },
  { id: 'g-loud', say: 'Play G 5 times, LOUD, one per second.', notes: [67, 67, 67, 67, 67] },
  { id: 'g-fast', say: 'Play G 8 times, getting FASTER and faster.', notes: [67, 67, 67, 67, 67, 67, 67, 67] },
  { id: 'scale-medium', say: 'Play C D E F G F E D C, medium, one per second.', notes: [60, 62, 64, 65, 67, 65, 64, 62, 60] },
  { id: 'scale-fast', say: 'Play C D E F G F E D C quickly (as fast as is comfortable).', notes: [60, 62, 64, 65, 67, 65, 64, 62, 60] },
  { id: 'scale-soft', say: 'Play C D E F G F E D C SOFTLY, like a 5-year-old might.', notes: [60, 62, 64, 65, 67, 65, 64, 62, 60] },
  { id: 'legato', say: 'Play C E G E C, holding each key down until the next (smooth).', notes: [60, 64, 67, 64, 60] },
  { id: 'pedal', say: 'Hold the sustain pedal down and play C D E F G, one per second.', notes: [60, 62, 64, 65, 67] },
  { id: 'homework', say: 'Play her homework: C D E F G G G G F E D C C C.', notes: [60, 62, 64, 65, 67, 67, 67, 67, 65, 64, 62, 60, 60, 60] },
  { id: 'talk', say: 'Talk normally for 10 seconds, WITHOUT touching the piano.', notes: [] },
  { id: 'talk-kid', say: 'Have her talk or sing for 10 seconds, without touching the piano.', notes: [] },
  { id: 'talk-and-play', say: 'Play C D E F G slowly while talking over it.', notes: [60, 62, 64, 65, 67] },
];

// Messy, kid-like playing (the frozen eval set, 2026-09-27). Keep ids stable.
const MESSY = [
  { id: 'm-plink', say: 'Play G (above middle C) 5 times, poking with one finger like she does: uneven, some soft, some hard.', notes: [67, 67, 67, 67, 67] },
  { id: 'm-mash', say: 'Mash D (next to middle C) quickly 6 times, like a kid who thinks it didn\'t hear.', notes: [62, 62, 62, 62, 62, 62] },
  { id: 'm-restrike', say: 'Play D, let it ring for 2 seconds, play D again. Do that 4 times.', notes: [62, 62, 62, 62] },
  { id: 'm-two-keys', say: 'Play C D E F G, but each time also catch the next key up by accident (C+D, D+E, E+F, F+G, G+A).', notes: [60, 62, 64, 65, 67], alt: [[62], [64], [65], [67], [69]] },
  { id: 'm-hold', say: 'Hold middle C down with one finger and, while still holding it, play E G E G with another.', notes: [60, 64, 67, 64, 67] },
  { id: 'm-sing', say: 'Play C D E F G slowly while singing along ("la la la").', notes: [60, 62, 64, 65, 67] },
  { id: 'm-kid-voice', say: 'Play G G G G slowly while she talks or sings next to the piano.', notes: [67, 67, 67, 67] },
  { id: 'm-left', say: 'Left hand: play C D E F G starting at the C BELOW middle C, one per second.', notes: [48, 50, 52, 53, 55] },
  { id: 'm-left-right', say: 'Alternate the C below middle C and middle C: low, middle, low, middle, low, middle.', notes: [48, 60, 48, 60, 48, 60] },
  { id: 'm-g-high', say: 'Play the G an octave above the usual G (the G song) 8 times: ti-ti ti-ti ti-ti ti-ti.', notes: [79, 79, 79, 79, 79, 79, 79, 79] },
  { id: 'm-splat', say: 'Splat the keys with a flat hand 3 times (anywhere), then play middle C once.', notes: [60], extrasOk: true },
  { id: 'm-far', say: 'Move the iPad about 3 feet further from the piano than usual, then play C D E F G. (Move it back after.)', notes: [60, 62, 64, 65, 67] },
  { id: 'm-background', say: 'With music or the TV on at a normal volume, play C D E F G.', notes: [60, 62, 64, 65, 67] },
  { id: 'm-little-one', say: 'If the little one is around: let them bang the low keys while you play C D E F G. (Skip otherwise.)', notes: [60, 62, 64, 65, 67], extrasOk: true },
];

// Where the iPad sits: the same passage in three placements (2026-09-27), to
// see how much vibration through the piano's case hurts (key and action
// thumps reach the mic through the wood).
const PASSAGE = 'play C D E F G at medium loudness, then G three times SOFTLY, about one per second.';
const PLACEMENT_NOTES = [60, 62, 64, 65, 67, 67, 67, 67];
const PLACEMENT = [
  { id: 'p-usual', say: `iPad in its usual spot: ${PASSAGE}`, notes: PLACEMENT_NOTES },
  { id: 'p-towel', say: `Same spot, but put a folded towel (or a soft cloth) under the iPad: ${PASSAGE}`, notes: PLACEMENT_NOTES },
  { id: 'p-off', say: `Take the iPad OFF the piano: put it on a chair or table beside the piano, about as far from the keys as usual, not touching the piano: ${PASSAGE}`, notes: PLACEMENT_NOTES },
  { id: 'p-usual-2', say: `Back in the usual spot (no towel), once more: ${PASSAGE}`, notes: PLACEMENT_NOTES },
];

const SETS = { basic: BASIC, messy: MESSY, placement: PLACEMENT };

// #/calibrate (the basic set), #/calibrate/messy or #/calibrate/placement.
export function calibrate(root, set = 'basic') {
  const STEPS = SETS[set] ?? BASIC;
  let i = 0, heard = [], off = null;
  const title = h('div', { class: 'cal-step' });
  const say = h('div', { class: 'cal-say' });
  const expect = h('div', { class: 'cal-expect' });
  const heardEl = h('div', { class: 'cal-heard' });
  const nextBtn = h('button', { class: 'btn primary big', onclick: () => go(i + 1) }, 'Done ✓ next');
  const redoBtn = h('button', { class: 'btn big', onclick: () => go(i) }, '↺ Redo');
  const skipBtn = h('button', { class: 'btn big', onclick: () => go(i + 1, true) }, 'Skip');

  function go(k, skipped = false) {
    log.endSession({ calibration: STEPS[i]?.id, heard: heard.length, ...(skipped ? { skipped: true } : {}) });
    if (k >= STEPS.length) {
      say.textContent = 'All done — thank you! The recordings upload automatically when you are on home Wi-Fi.';
      title.textContent = '';
      expect.textContent = '';
      heardEl.replaceChildren();
      nextBtn.style.display = redoBtn.style.display = skipBtn.style.display = 'none';
      return;
    }
    i = k;
    heard = [];
    const s = STEPS[i];
    title.textContent = `Step ${i + 1} of ${STEPS.length}`;
    say.textContent = s.say;
    expect.textContent = s.notes.length ? `Expecting ${s.notes.length} notes: ${s.notes.map(noteName).join(' ')}` : 'Expecting no notes.';
    heardEl.replaceChildren();
    log.startSession('calibration', {
      calibration: s.id, calSet: SETS[set] ? set : 'basic', prompt: s.say, song: { notes: s.notes.map((p) => ({ d: 1, p })) },
      ...(s.alt ? { alt: s.alt } : {}), ...(s.extrasOk ? { extrasOk: true } : {}),
    });
  }

  root.append(h('div', { class: 'screen calibrate' },
    h('header', { class: 'bar' }, h('a', { class: 'btn', href: '#/' }, '🏠'), h('div', { class: 'song-title' }, { messy: '🎯 Calibrate: messy playing', placement: '🎯 Calibrate: where the iPad sits' }[set] ?? '🎯 Calibrate the ears')),
    h('div', { class: 'panel cal-panel' }, title, say, expect,
      h('div', { class: 'cal-label' }, 'Heard:'), heardEl,
      h('div', { class: 'row' }, redoBtn, skipBtn, nextBtn))));

  (async () => {
    try { await engine.listen(true); } catch { say.textContent = 'Needs the microphone.'; return; }
    off = engine.onNote((n) => {
      heard.push(n);
      heardEl.append(h('span', { class: 'cal-note' }, noteName(n.midi) + (Math.floor(n.midi / 12) - 1)));
    });
    go(0);
  })();

  return () => {
    off?.();
    log.endSession({ calibration: STEPS[i]?.id, heard: heard.length, aborted: true });
    engine.listen(false);
  };
}
