// The jewel turn: the adventure's quick reward after each homework piece.
// A PAIR of shiny gem pixels (the piece's gem: homework.js `gem`, pixels.js
// GEMS) to put on her character, one after the other (pairs since
// 2026-10-06, parent: her grid is 10 wide and three single gems couldn't
// go on symmetrically; she chooses where, nothing is mirrored for her).
// Her character big on its grid, the two gems waiting at the top: she taps
// a cell and the first pops in with sparkles, then the second is ready, tap
// again. Tapping one of the new gems picks it up (gold outline) and the
// next empty cell she taps moves it there; with both placed, tapping an
// empty cell moves the last one placed. The big ✓ finishes, any time
// (2026-10-13, parent: with 0 or 1 placed the rest simply aren't placed;
// the waiting gem keeps bobbing, the ✓ bobs once both are on). A grown-up's
// step (two-finger tap, →) does nothing here: she's choosing. A tap is one
// finger: two fingers on the board place and remove nothing. No palette. Gems placed on
// earlier turns can be REMOVED (2026-10-07, she asked to delete gems): a tap
// poofs one away and the cell is plain again, free for a new gem. Changed
// her mind? Tapping it again straight away brings it back (once: the next
// remove is final for that cell's turn, so remove/restore can't loop and a
// tap after that puts a new gem there). Removals don't count toward the
// pair. Jewels
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

// done({ ms, cells, unplaced, moves, removed }) when she taps ✓. cells: the
// ones she placed (first, second; fewer if she finished early), unplaced:
// how many she didn't.
// removed: [{ i, m }] the earlier jewels she took off (and didn't bring back).
// quit() for leaving: keeps the ones she placed and returns the same
// stats, without calling done.
export function jewelTurn(parent, { m, n = PAIR, icon = '', done }) {
  const st = getState();
  const t0 = Date.now();
  const placed = Array(n).fill(null); // cell of each new gem
  let moves = 0, over = false, sel = null; // sel: the new gem she picked up
  const old = new Map(st.jewels.map((j) => [j.i, j])); // her earlier jewels still on
  const gone = new Map(); // cell → earlier jewel she removed this turn
  const restored = new Set(); // cells whose removal she has undone once
  let undo = null; // cell she just removed a jewel from (one tap to bring it back)
  const { c, l } = jewelColors(m);
  const nextUp = () => placed.indexOf(null); // -1 once all are placed

  const cells = st.character.map(() => h('div', { class: 'cell' }));
  cells.forEach((el, i) => (el.dataset.i = i));
  const paintCell = (i) => {
    const j = old.get(i), v = st.character[i];
    const k = placed.indexOf(i);
    const ghost = !j && k < 0 && undo === i;
    const el = cells[i];
    el.className = 'cell' + (j || k >= 0 ? ' gem' : v < 0 ? ' clear' : '') + (k >= 0 ? ' gem-new' : '') + (k >= 0 && k === sel ? ' gem-sel' : '') + (ghost ? ' gem-ghost' : '');
    el.style.cssText = (j ? jewelStyle(j.m) : k >= 0 ? jewelStyle(m) : v < 0 ? '' : `background:${CHAR_PALETTE[v]}`) + (ghost ? ';' + jewelStyle(gone.get(i).m) : '');
  };
  cells.forEach((_, i) => paintCell(i));
  const board = h('div', { class: 'board jewel-board', style: `grid-template-columns:repeat(${CHAR_W}, 1fr)` }, cells);
  const waiting = placed.map(() => gem(m, 'jewel-waiting'));
  const showWaiting = () => {
    const k = nextUp();
    waiting.forEach((w, i) => { w.classList.toggle('placed', placed[i] != null); w.classList.toggle('next', i === k); });
  };
  showWaiting();
  const doneBtn = h('button', { class: 'btn primary huge jewel-done', onclick: () => close() }, '✓');
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
  const centre = (i) => {
    const r = cells[i].getBoundingClientRect(), b = box.getBoundingClientRect();
    return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, r.width];
  };
  // Take an earlier jewel off: it puffs up and fades, a grey-white poof.
  function remove(i) {
    const j = old.get(i);
    old.delete(i);
    gone.set(i, j);
    const was = undo;
    undo = restored.has(i) ? null : i;
    if (was != null && was !== i) paintCell(was);
    paintCell(i);
    const [x, y, w] = centre(i);
    const p = h('span', { class: 'gem gem-poof', style: `${jewelStyle(j.m)};left:${x - w / 2}px;top:${y - w / 2}px;width:${w}px;height:${w}px` });
    box.append(p);
    setTimeout(() => p.remove(), 600);
    sparkle(box, x, y, ['#ffffff', '#d8d4e8', '#a9a3bf', jewelColors(j.m).c], 12);
  }
  // Bring back the one she just removed.
  function restore(i) {
    const j = gone.get(i);
    gone.delete(i);
    old.set(i, j);
    restored.add(i);
    undo = null;
    paintCell(i);
    flash(cells[i], 'gem-pop', 500);
    const [x, y] = centre(i);
    const { c: jc, l: jl } = jewelColors(j.m);
    sparkle(box, x, y, [jc, '#ffffff', jl], 10);
  }
  function select(k) {
    const was = sel;
    sel = k;
    if (was != null) paintCell(placed[was]);
    if (k != null) paintCell(placed[k]);
  }
  function tapCell(i) {
    if (over) return;
    if (old.has(i)) { remove(i); return; }
    if (undo === i) { restore(i); return; }
    if (undo != null) { const u = undo; undo = null; paintCell(u); }
    const k = placed.indexOf(i);
    if (k >= 0) { select(sel === k ? null : k); flash(cells[i], 'gem-pop', 300); return; } // pick it up / put it back
    if (sel != null) { const s = sel; select(null); put(s, i); return; }
    const next = nextUp();
    put(next >= 0 ? next : n - 1, i);
  }
  // One finger down and up is a tap: the cell is the one under it as it
  // came down, acted on as it lifts. Another finger down anywhere meanwhile
  // (hers resting, or a grown-up's two-finger tap) and nothing happens.
  // Fingers already down when the turn opened never came down here, so
  // they count for nothing either.
  const fingers = new Set();
  let pending = null, multi = false;
  const onDown = (e) => {
    fingers.add(e.pointerId);
    if (fingers.size > 1) { multi = true; pending = null; return; }
    multi = false;
    pending = null;
    if (!board.contains(e.target)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el?.classList.contains('cell') && board.contains(el)) pending = +el.dataset.i;
  };
  const onUp = (e) => {
    if (!fingers.delete(e.pointerId)) return;
    const i = pending;
    pending = null;
    if (e.type === 'pointerup' && !multi && i != null) tapCell(i);
  };
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', onUp, true);
  const unlisten = () => {
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('pointercancel', onUp, true);
  };

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

  const keep = () => {
    const left = st.jewels.filter((j) => gone.get(j.i) !== j);
    st.jewels.splice(0, st.jewels.length, ...left);
    for (const i of placed) if (i != null) st.jewels.push({ i, m });
    save();
  };
  const stats = () => ({ ms: Date.now() - t0, cells: placed.filter((i) => i != null), unplaced: placed.filter((i) => i == null).length, moves, removed: [...gone.values()].map(({ i, m }) => ({ i, m })) });

  function close() {
    if (over) return;
    over = true;
    unlisten();
    keep();
    box.remove();
    done(stats());
  }

  return {
    quit() { if (over) return null; over = true; unlisten(); keep(); box.remove(); return stats(); },
    get open() { return !over; },
  };
}
