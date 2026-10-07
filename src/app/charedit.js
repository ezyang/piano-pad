// Her character editor: the grid, the palette and a preview of her, for
// the Me screen (screens/me.js; the adventure's drawing turns used it until
// 2026-10-06). It edits her real character (store.js `pianopad.character`)
// and saves after every stroke; keep() saves now (call it on leaving).
// Her jewels (jewels.js) show on the board; painting a jewel's cell (any
// colour, the eraser too) removes that jewel.
import { h } from './dom.js';
import { getState, save } from './store.js';
import { CHAR_W, CHAR_PALETTE, characterUrl, jewelStyle } from './pixels.js';

export function characterEditor({ color = 6 } = {}) {
  const st = getState();
  const grid = [...st.character];
  const start = [...grid];
  let painting = false, changed = false, strokes = 0;

  const cells = grid.map((v, i) => h('div', { class: 'cell', 'data-i': i }));
  const board = h('div', { class: 'board', style: `grid-template-columns:repeat(${CHAR_W}, 1fr);aspect-ratio:${CHAR_W}/${grid.length / CHAR_W}` }, cells);
  const preview = h('img', { class: 'me-preview' });

  const keep = () => { st.character = [...grid]; save(); };
  const jewelAt = (i) => st.jewels.findIndex((j) => j.i === i);
  let jewelsGone = 0;
  const paint = (i) => {
    if (i == null) return;
    const j = jewelAt(i);
    if (j < 0 && grid[i] === color) return;
    if (j >= 0) { st.jewels.splice(j, 1); jewelsGone++; }
    grid[i] = color;
    changed = true;
    render();
  };
  function render() {
    const gems = new Map(st.jewels.map((j) => [j.i, j.m]));
    grid.forEach((v, i) => {
      const c = cells[i], m = gems.get(i);
      c.className = 'cell' + (v < 0 && !m ? ' clear' : '') + (m ? ' gem' : '');
      c.style.cssText = m ? jewelStyle(m) : v < 0 ? '' : `background:${CHAR_PALETTE[v]}`;
    });
    preview.src = characterUrl(grid, st.jewels);
  }
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el?.classList.contains('cell') && board.contains(el) ? +el.dataset.i : null;
  };
  const up = () => { if (!painting) return; painting = false; if (changed) strokes++; keep(); };
  board.addEventListener('pointerdown', (e) => { painting = true; changed = false; board.setPointerCapture(e.pointerId); paint(cellAt(e)); });
  board.addEventListener('pointermove', (e) => { if (painting) paint(cellAt(e)); });
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);

  const swatches = [...CHAR_PALETTE.map((c, i) => i), -1].map((i) => {
    const b = h('button', {
      class: 'swatch-btn' + (i === color ? ' on' : '') + (i < 0 ? ' eraser' : ''), style: i >= 0 ? `background:${CHAR_PALETTE[i]}` : '',
      onclick: () => { color = i; for (const s of swatches) s.classList.toggle('on', s === b); },
    }, i < 0 ? '⌫' : '');
    return b;
  });
  const palette = h('div', { class: 'palette' }, swatches);

  render();
  return {
    grid, board, palette, preview, render, keep,
    // For the logs: drags that changed something, and cells now different
    // from when the editor opened.
    stats: () => ({ strokes, pixels: grid.reduce((n, v, i) => n + (v !== start[i]), 0), ...(jewelsGone ? { jewelsGone } : {}) }),
  };
}
