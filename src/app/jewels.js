// The jewel turn: the adventure's quick reward after each homework piece.
// One shiny pixel (the colour of the piece's most-played note's Build block,
// pixels.js pieceJewel) to put on her character: her character big on its
// grid, she taps a cell and the jewel pops in with sparkles; tapping another
// cell moves it; the big ✓ (or a grown-up's step) finishes. About ten
// seconds, no palette. Jewels are kept with her character (store.js
// `pianopad.jewels`) and show everywhere she appears; painting over one in
// an editor removes it (charedit.js).
import { h, flash, sparkle } from './dom.js';
import { getState, save } from './store.js';
import { CHAR_W, CHAR_H, CHAR_PALETTE, jewelStyle, jewelColors } from './pixels.js';

// A jewel as an element (map badges, the homework page's promise).
export const gem = (m, cls = '') => h('span', { class: 'gem ' + cls, style: jewelStyle(m) });

// done({ ms, cell, moves, by? }) when it's over (✓, or close('grownup'),
// which places it for her if she hasn't). quit() for leaving: keeps the
// jewel if she placed it and returns the same stats, without calling done.
export function jewelTurn(parent, { m, icon = '', done }) {
  const st = getState();
  const t0 = Date.now();
  let cell = null, moves = 0, over = false;
  const taken = new Set(st.jewels.map((j) => j.i));
  const { c } = jewelColors(m);

  const cells = st.character.map((v, i) => h('div', { class: 'cell' + (v < 0 && !taken.has(i) ? ' clear' : '') + (taken.has(i) ? ' gem' : ''), 'data-i': i }));
  const paintCell = (i) => {
    const j = st.jewels.find((x) => x.i === i), v = st.character[i];
    const el = cells[i];
    el.className = 'cell' + (j || i === cell ? ' gem' : v < 0 ? ' clear' : '') + (i === cell ? ' gem-new' : '');
    el.style.cssText = j ? jewelStyle(j.m) : i === cell ? jewelStyle(m) : v < 0 ? '' : `background:${CHAR_PALETTE[v]}`;
  };
  cells.forEach((_, i) => paintCell(i));
  const board = h('div', { class: 'board jewel-board', style: `grid-template-columns:repeat(${CHAR_W}, 1fr)` }, cells);
  const waiting = gem(m, 'jewel-waiting');
  const doneBtn = h('button', { class: 'btn primary huge draw-done jewel-done', onclick: () => (cell == null ? flash(waiting, 'shake', 400) : close()) }, '✓');
  const box = h('div', { class: 'overlay jewel-turn' },
    h('div', { class: 'jewel-head' }, h('div', { class: 'draw-icon' }, icon), waiting),
    h('div', { class: 'jewel-body' }, board, doneBtn));
  parent.append(box);

  function place(i) {
    if (over || i == null || i === cell || taken.has(i)) { if (taken.has(i)) flash(cells[i], 'shake', 400); return; }
    const was = cell;
    if (was != null) moves++;
    cell = i;
    if (was != null) paintCell(was);
    paintCell(i);
    flash(cells[i], 'gem-pop', 500);
    waiting.classList.add('placed');
    doneBtn.classList.add('ready');
    const r = cells[i].getBoundingClientRect(), b = box.getBoundingClientRect();
    sparkle(box, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, [c, '#ffffff', '#fff6a8', c], 14);
  }
  board.addEventListener('pointerdown', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el?.classList.contains('cell') && board.contains(el)) place(+el.dataset.i);
  });

  // The board as big as fits above the ✓.
  const fit = () => {
    const body = board.parentElement.getBoundingClientRect();
    const wide = body.width > body.height * 1.1;
    const w = wide ? body.width - doneBtn.offsetWidth - 60 : body.width - 20;
    const hh = wide ? body.height - 10 : body.height - doneBtn.offsetHeight - 40;
    const size = Math.max(18, Math.min(64, Math.floor(Math.min(w / CHAR_W, hh / CHAR_H))));
    board.style.width = `${size * CHAR_W + 8}px`;
    board.style.height = `${size * CHAR_H + 8}px`;
  };
  fit();

  const keepIt = () => { if (cell != null) { st.jewels.push({ i: cell, m }); save(); } };
  const stats = () => ({ ms: Date.now() - t0, cell, moves });

  // A grown-up's step places it for her if she hasn't: somewhere on her
  // (not on another jewel), else anywhere free.
  function autoPlace() {
    const free = (i) => !taken.has(i);
    const on = st.character.map((v, i) => i).filter((i) => st.character[i] >= 0 && free(i));
    const any = st.character.map((v, i) => i).filter(free);
    const pool = on.length ? on : any;
    if (pool.length) place(pool[Math.floor(Math.random() * pool.length)]);
  }

  function close(how = 'tap') {
    if (over) return;
    if (how === 'grownup' && cell == null) autoPlace();
    over = true;
    keepIt();
    box.remove();
    done({ ...stats(), ...(how === 'grownup' ? { by: 'grownup' } : {}) });
  }

  return {
    close,
    quit() { if (over) return null; over = true; keepIt(); box.remove(); return stats(); },
    get open() { return !over; },
  };
}
