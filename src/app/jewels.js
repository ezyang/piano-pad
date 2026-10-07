// The jewel turn: the adventure's quick reward after each homework piece.
// A PAIR of shiny gem pixels (the piece's gem: homework.js `gem`, pixels.js
// GEMS) to put on her character, one after the other (pairs since
// 2026-10-06, parent: her grid is 10 wide and three single gems couldn't
// go on symmetrically; she chooses where, nothing is mirrored for her).
// Her character big on its grid, the two gems waiting at the top: she taps
// a cell and the first pops in with sparkles, then the second is ready, tap
// again. Tapping one of the new gems picks it up (gold outline) and the
// next empty cell she taps moves it there; with both placed, tapping an
// empty cell moves the last one placed. The big ✓ (lit once both are
// placed) or a grown-up's step finishes. No palette, no undo: a gem in the
// wrong place is kept, and replaying the piece earns another pair. Jewels
// are kept with her character (store.js `pianopad.jewels`) and show
// everywhere she appears; painting over one in an editor removes it
// (charedit.js).
import { h, flash, sparkle } from './dom.js';
import { getState, save } from './store.js';
import { CHAR_W, CHAR_H, CHAR_PALETTE, jewelStyle, jewelColors } from './pixels.js';

// A jewel as an element (map badges, the homework page's promise).
export const gem = (m, cls = '') => h('span', { class: 'gem ' + cls, style: jewelStyle(m) });

// How many gems a turn gives.
export const PAIR = 2;

// done({ ms, cells, moves, by? }) when it's over (✓, or close('grownup'),
// which places any she hasn't). cells: [first, second], null = not placed.
// quit() for leaving: keeps the ones she placed and returns the same
// stats, without calling done.
export function jewelTurn(parent, { m, n = PAIR, icon = '', done }) {
  const st = getState();
  const t0 = Date.now();
  const placed = Array(n).fill(null); // cell of each new gem
  let moves = 0, over = false, sel = null; // sel: the new gem she picked up
  const taken = new Set(st.jewels.map((j) => j.i)); // her earlier jewels
  const { c, l } = jewelColors(m);
  const nextUp = () => placed.indexOf(null); // -1 once all are placed

  const cells = st.character.map(() => h('div', { class: 'cell' }));
  cells.forEach((el, i) => (el.dataset.i = i));
  const paintCell = (i) => {
    const j = st.jewels.find((x) => x.i === i), v = st.character[i];
    const k = placed.indexOf(i);
    const el = cells[i];
    el.className = 'cell' + (j || k >= 0 ? ' gem' : v < 0 ? ' clear' : '') + (k >= 0 ? ' gem-new' : '') + (k >= 0 && k === sel ? ' gem-sel' : '');
    el.style.cssText = j ? jewelStyle(j.m) : k >= 0 ? jewelStyle(m) : v < 0 ? '' : `background:${CHAR_PALETTE[v]}`;
  };
  cells.forEach((_, i) => paintCell(i));
  const board = h('div', { class: 'board jewel-board', style: `grid-template-columns:repeat(${CHAR_W}, 1fr)` }, cells);
  const waiting = placed.map(() => gem(m, 'jewel-waiting'));
  const showWaiting = () => {
    const k = nextUp();
    waiting.forEach((w, i) => { w.classList.toggle('placed', placed[i] != null); w.classList.toggle('next', i === k); });
  };
  showWaiting();
  const doneBtn = h('button', { class: 'btn primary huge jewel-done', onclick: () => (nextUp() >= 0 ? flash(waiting[nextUp()], 'shake', 400) : close()) }, '✓');
  const box = h('div', { class: 'overlay jewel-turn' },
    h('div', { class: 'jewel-head' }, h('div', { class: 'jewel-icon' }, icon), h('div', { class: 'jewel-pair' }, waiting)),
    h('div', { class: 'jewel-body' }, board, doneBtn));
  parent.append(box);

  // Put new gem k on cell i (placing it, or moving it there).
  function put(k, i) {
    const was = placed[k];
    if (was != null) moves++;
    placed[k] = i;
    if (was != null) paintCell(was);
    paintCell(i);
    flash(cells[i], 'gem-pop', 500);
    showWaiting();
    doneBtn.classList.toggle('ready', nextUp() < 0);
    const r = cells[i].getBoundingClientRect(), b = box.getBoundingClientRect();
    sparkle(box, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, [c, '#ffffff', l, c], 14);
  }
  function select(k) {
    const was = sel;
    sel = k;
    if (was != null) paintCell(placed[was]);
    if (k != null) paintCell(placed[k]);
  }
  function tapCell(i) {
    if (over) return;
    if (taken.has(i)) { flash(cells[i], 'shake', 400); return; }
    const k = placed.indexOf(i);
    if (k >= 0) { select(sel === k ? null : k); flash(cells[i], 'gem-pop', 300); return; } // pick it up / put it back
    if (sel != null) { const s = sel; select(null); put(s, i); return; }
    const next = nextUp();
    put(next >= 0 ? next : n - 1, i);
  }
  board.addEventListener('pointerdown', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el?.classList.contains('cell') && board.contains(el)) tapCell(+el.dataset.i);
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

  const keep = () => { for (const i of placed) if (i != null) st.jewels.push({ i, m }); save(); };
  const stats = () => ({ ms: Date.now() - t0, cells: [...placed], moves });

  // A grown-up's step places the ones she hasn't: somewhere on her (not on
  // another jewel), else anywhere free.
  function autoPlace() {
    for (let k = nextUp(); k >= 0; k = nextUp()) {
      const free = (i) => !taken.has(i) && !placed.includes(i);
      const all = st.character.map((v, i) => i);
      const on = all.filter((i) => st.character[i] >= 0 && free(i));
      const pool = on.length ? on : all.filter(free);
      if (!pool.length) return;
      put(k, pool[Math.floor(Math.random() * pool.length)]);
    }
  }

  function close(how = 'tap') {
    if (over) return;
    if (how === 'grownup') autoPlace();
    over = true;
    keep();
    box.remove();
    done({ ...stats(), ...(how === 'grownup' ? { by: 'grownup' } : {}) });
  }

  return {
    close,
    quit() { if (over) return null; over = true; keep(); box.remove(); return stats(); },
    get open() { return !over; },
  };
}
