// A drawing turn: the adventure's reward after each homework piece. She gets
// the real character editor (charedit.js: her whole character, the full
// palette, saved to `pianopad.character` after every stroke) for DRAW_MS,
// shown as a big sand timer. She can tap ✓ early. When the sand runs out
// (it glows for the last ENDING_MS), her drawing is kept and a friendly
// "Time to play!" closes the turn.
import { h, flash } from './dom.js';
import { CHAR_W, CHAR_H, texture } from './pixels.js';
import { characterEditor } from './charedit.js';

export const DRAW_MS = 90 * 1000;
const ENDING_MS = 10 * 1000;
const BYE_MS = 2200; // "Time to play!" before the turn closes

// The sand timer: an hourglass whose top empties into the bottom.
function sandTimer() {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, kids = []) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const c of kids) e.append(c); return e; };
  const id = 'sand' + Math.random().toString(36).slice(2, 8);
  const glass = 'M10 8 H90 L54 80 L90 152 H10 L46 80 Z';
  const top = el('rect', { x: 0, y: 10, width: 100, height: 70, class: 'sand' });
  const bottom = el('rect', { x: 0, y: 150, width: 100, height: 0, class: 'sand' });
  const stream = el('rect', { x: 48.5, y: 78, width: 3, height: 72, class: 'sand stream' });
  const svg = el('svg', { viewBox: '0 0 100 160', class: 'sand-timer' }, [
    el('clipPath', { id }, [el('path', { d: glass })]),
    el('path', { d: glass, class: 'glass' }),
    el('g', { 'clip-path': `url(#${id})` }, [top, stream, bottom]),
    el('path', { d: glass, class: 'glass-edge' }),
    el('rect', { x: 2, y: 0, width: 96, height: 10, rx: 3, class: 'cap' }),
    el('rect', { x: 2, y: 150, width: 96, height: 10, rx: 3, class: 'cap' }),
  ]);
  return {
    el: svg,
    set(left) { // left: 1 → 0
      top.setAttribute('y', 80 - 70 * left); top.setAttribute('height', 70 * left);
      bottom.setAttribute('y', 150 - 70 * (1 - left)); bottom.setAttribute('height', 70 * (1 - left));
      stream.style.display = left > 0 ? '' : 'none';
    },
  };
}

// done({ ms, strokes, pixels, timeout?, by? }) once the turn is over (✓,
// the timer, or close('grownup')). quit() for leaving mid-turn: it keeps the
// drawing and returns the same stats, without calling done.
export function drawTurn(parent, { icon = '🎨', ms = DRAW_MS, done }) {
  const ed = characterEditor();
  const t0 = Date.now();
  let over = false;
  const timer = sandTimer();
  timer.set(1);
  const doneBtn = h('button', { class: 'btn primary huge draw-done', onclick: () => close() }, '✓');
  const bye = h('div', { class: 'draw-bye', style: 'display:none' }, 'Time to play! 🎹');
  const box = h('div', { class: 'overlay draw-turn' },
    h('div', { class: 'draw-head' }, h('div', { class: 'draw-icon' }, icon), h('div', { class: 'draw-title' }, '🎨')),
    h('div', { class: 'draw-body' },
      ed.board,
      h('div', { class: 'draw-side' },
        ed.palette,
        h('div', { class: 'draw-row' },
          h('div', { class: 'me-stand' }, ed.preview, h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` })),
          timer.el,
          doneBtn))),
    bye);
  parent.append(box);

  const stats = () => ({ ms: Date.now() - t0, ...ed.stats() });
  const tick = setInterval(() => {
    const left = Math.max(0, 1 - (Date.now() - t0) / ms);
    timer.set(left);
    box.classList.toggle('ending', left * ms <= ENDING_MS);
    if (left <= 0) close('timeout');
  }, 250);

  function close(how = 'tap') {
    if (over) return;
    over = true;
    clearInterval(tick);
    ed.keep();
    const s = { ...stats(), ...(how === 'timeout' ? { timeout: true } : {}), ...(how === 'grownup' ? { by: 'grownup' } : {}) };
    if (how !== 'timeout') { box.remove(); done(s); return; }
    // The sand ran out: her drawing stays, a friendly word, then on.
    box.classList.add('closing');
    bye.style.display = '';
    flash(bye, 'pop', 500);
    flash(ed.preview, 'cheer', 1500);
    setTimeout(() => { box.remove(); done(s); }, BYE_MS);
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
    quit() { if (over) return null; over = true; clearInterval(tick); ed.keep(); box.remove(); return stats(); },
    get open() { return !over; },
  };
}
