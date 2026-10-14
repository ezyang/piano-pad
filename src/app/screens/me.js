// Pixel-art character editor (charedit.js). Her drawing is kept as she goes
// (after each stroke, and whenever she leaves the screen, by 🏠, ✓ or
// anything else), so no way out loses it.
// ↩️ steps back: through this visit's strokes and wipes, then through the
// versions kept in store.js's character history (remembered when the
// screen opens, before each wipe, and when she leaves), so a wipe can be
// undone even after a reload. It never loses a version: going back from
// the newest remembers it first, and a stroke after going back keeps the
// version she went back to as well.
// The two wipes (👑 back to the default, 🧽 clear) sit under the preview,
// away from the board, palette, ✓ and ↩️, and take a second tap that only
// counts after a pause (a quick double tap does nothing).
// Logs: a `me` record when she leaves, if anything changed, with her
// picture (`character`: store.js characterSnapshot) as an off-device backup.
import { h } from '../dom.js';
import { defaultCharacter, texture } from '../pixels.js';
import { characterEditor } from '../charedit.js';
import { getState, save, charText, parseCharacter, characterHistory, rememberCharacter, characterSnapshot } from '../store.js';
import * as log from '../telemetry.js';

const ARM_MS = 800; // the confirming tap counts only after this
const ARMED_MS = 4000; // then the button gives up

export function me(root) {
  const st = getState();
  const t0 = Date.now();
  const stats = { wipes: [], undos: 0 };
  let ed = null;
  const state = () => ({ grid: charText(ed.grid), jewels: st.jewels.map((j) => ({ ...j })) });
  const same = (a, b) => a.grid === b.grid && JSON.stringify(a.jewels) === JSON.stringify(b.jewels);
  // Every version she can go back to, oldest first; `at` is where she is.
  let timeline = [], at = 0;
  const push = () => {
    const s = state();
    if (at < timeline.length - 1) timeline.push(timeline[at]); // she'd gone back: keep that one too
    if (!same(timeline[timeline.length - 1], s)) timeline.push(s);
    at = timeline.length - 1;
    showUndo();
  };

  ed = characterEditor({ onStroke: push });
  const { grid, render, keep } = ed;
  rememberCharacter();
  timeline = characterHistory().map(({ grid: g, jewels }) => ({ grid: g, jewels }));
  if (!timeline.length || !same(timeline[timeline.length - 1], state())) timeline.push(state());
  at = timeline.length - 1;

  const undo = h('button', {
    class: 'btn big me-undo', title: 'Undo', onclick: () => {
      const now = state();
      let i = at - 1;
      while (i >= 0 && same(timeline[i], now)) i--;
      if (i < 0) { undo.classList.remove('nope'); void undo.offsetWidth; undo.classList.add('nope'); return; }
      if (at === timeline.length - 1) rememberCharacter(); // the newest, kept before leaving it
      at = i;
      const back = timeline[i];
      grid.splice(0, grid.length, ...parseCharacter(back.grid).grid);
      // Jewels painted over come back; ones she has now stay.
      const have = new Set(st.jewels.map((j) => j.i));
      st.jewels.push(...back.jewels.filter((j) => !have.has(j.i)).map((j) => ({ ...j })));
      stats.undos++;
      render(); keep(); showUndo();
    },
  }, '↩️');
  function showUndo() {
    const now = state();
    undo.classList.toggle('dim', !timeline.slice(0, at).some((s) => !same(s, now)));
  }

  // Tap once to arm (the button asks), again after a pause to do it; arming
  // one disarms the other, and an armed button gives up after a few seconds.
  const armed = (icon, question, why, act) => {
    let timer = 0, armedAt = 0;
    const b = h('button', {
      class: 'btn', onclick: () => {
        if (!b.classList.contains('armed')) {
          for (const o of wipers) disarm(o);
          b.classList.add('armed', 'arming'); b.textContent = question; armedAt = Date.now();
          setTimeout(() => b.classList.remove('arming'), ARM_MS);
          timer = setTimeout(() => disarm(b), ARMED_MS);
          return;
        }
        if (Date.now() - armedAt < ARM_MS) return; // too quick: a double tap, not a yes
        clearTimeout(timer); disarm(b);
        rememberCharacter();
        act(); render(); keep();
        stats.wipes.push(why);
        push();
      },
    }, icon);
    b.dataset.icon = icon;
    return b;
  };
  const disarm = (b) => { b.classList.remove('armed', 'arming'); b.textContent = b.dataset.icon; };
  const wipers = [
    armed('👑', 'Start over?', 'default', () => grid.splice(0, grid.length, ...defaultCharacter())),
    armed('🧽', 'Clear?', 'clear', () => grid.fill(-1)),
  ];
  showUndo();
  root.append(h('div', { class: 'screen me' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'song-title' }, 'Make yourself!'),
      undo,
      h('div', { class: 'spacer' }),
      h('a', { class: 'btn primary big', href: '#/' }, '✓')),
    h('div', { class: 'me-body' },
      ed.board,
      h('div', { class: 'me-side' },
        ed.palette,
        h('div', { class: 'me-stand' }, ed.preview, h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` })),
        h('div', { class: 'me-wipes' }, wipers)))));

  return () => {
    keep();
    rememberCharacter();
    const s = ed.stats();
    if (s.strokes || stats.wipes.length || stats.undos) {
      log.record({ ...log.sessionHeader('me'), duration: Date.now() - t0, ...s, ...stats, character: characterSnapshot() });
    }
    save();
  };
}
