// A drawing turn: the adventure's big reward, once, right before the party
// (after each piece she gets a quick jewel instead, jewels.js). She gets
// the real character editor (charedit.js: her whole character, the full
// palette, saved to `pianopad.character` after every stroke) for as long as
// she likes. No timer (2026-10-05, parent: a countdown taking her drawing
// away is the wrong feeling); she finishes with the big ✓, or a grown-up
// moves her along (close('grownup')).
import { h } from './dom.js';
import { CHAR_W, CHAR_H, texture } from './pixels.js';
import { characterEditor } from './charedit.js';

// done({ ms, strokes, pixels, by? }) once the turn is over (✓, or
// close('grownup')). quit() for leaving mid-turn: it keeps the drawing and
// returns the same stats, without calling done.
// top: where it starts in parent (px), to leave a header uncovered.
export function drawTurn(parent, { icon = '🎨', done, top = 0 }) {
  const ed = characterEditor();
  const t0 = Date.now();
  let over = false;
  const doneBtn = h('button', { class: 'btn primary huge draw-done', onclick: () => close() }, '✓');
  const box = h('div', { class: 'overlay draw-turn' },
    h('div', { class: 'draw-head' }, h('div', { class: 'draw-icon' }, icon), h('div', { class: 'draw-title' }, '🎨')),
    h('div', { class: 'draw-body' },
      ed.board,
      h('div', { class: 'draw-side' },
        ed.palette,
        h('div', { class: 'draw-row' },
          h('div', { class: 'me-stand' }, ed.preview, h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` })),
          doneBtn))));
  if (top) box.style.top = `${top}px`;
  parent.append(box);

  const stats = () => ({ ms: Date.now() - t0, ...ed.stats() });

  function close(how = 'tap') {
    if (over) return;
    over = true;
    ed.keep();
    box.remove();
    done({ ...stats(), ...(how === 'grownup' ? { by: 'grownup' } : {}) });
  }

  // The board as big as fits beside (or above) the palette.
  const fit = () => {
    const body = ed.board.parentElement.getBoundingClientRect();
    const side = ed.board.nextElementSibling.getBoundingClientRect();
    const wide = body.width > body.height * 1.1;
    const w = wide ? body.width - side.width - 40 : body.width - 20;
    const hh = wide ? body.height - 10 : body.height - side.height - 30;
    const cell = Math.max(18, Math.min(56, Math.floor(Math.min(w / CHAR_W, hh / CHAR_H))));
    ed.board.style.width = `${cell * CHAR_W + 8}px`;
    ed.board.style.height = `${cell * CHAR_H + 8}px`;
  };
  fit();

  return {
    close,
    quit() { if (over) return null; over = true; ed.keep(); box.remove(); return stats(); },
    get open() { return !over; },
  };
}
