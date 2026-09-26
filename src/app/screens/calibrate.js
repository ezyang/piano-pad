// Grown-up tool: guided, labeled recordings for tuning the detector. Each
// prompt says exactly what to play; its recording is logged as a
// 'calibration' session with the prompt, so the audio has ground truth
// (which notes, how many, how loud). What the detector heard shows live.
import { h } from '../dom.js';
import { engine } from '../engine.js';
import { noteName } from '../music.js';
import * as log from '../telemetry.js';

const STEPS = [
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

export function calibrate(root) {
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
    log.startSession('calibration', { calibration: s.id, prompt: s.say, song: { notes: s.notes.map((p) => ({ d: 1, p })) } });
  }

  root.append(h('div', { class: 'screen calibrate' },
    h('header', { class: 'bar' }, h('a', { class: 'btn', href: '#/' }, '🏠'), h('div', { class: 'song-title' }, '🎯 Calibrate the ears')),
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
