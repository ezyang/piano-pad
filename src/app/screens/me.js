// Pixel-art character editor.
import { h } from '../dom.js';
import { getState, save } from '../store.js';
import { CHAR_W, CHAR_H, CHAR_PALETTE, characterUrl, defaultCharacter, texture } from '../pixels.js';

export function me(root) {
  const st = getState();
  const grid = [...st.character];
  let color = 6;
  let painting = false;

  const cells = grid.map((v, i) => h('div', { class: 'cell', 'data-i': i }));
  const board = h('div', { class: 'board', style: `grid-template-columns:repeat(${CHAR_W}, 1fr);aspect-ratio:${CHAR_W}/${CHAR_H}` }, cells);
  const preview = h('img', { class: 'me-preview' });

  const paint = (i) => {
    if (i == null || grid[i] === color) return;
    grid[i] = color;
    render();
  };
  function render() {
    grid.forEach((v, i) => {
      cells[i].style.background = v < 0 ? '' : CHAR_PALETTE[v];
      cells[i].classList.toggle('clear', v < 0);
    });
    preview.src = characterUrl(grid);
  }
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el?.classList.contains('cell') ? +el.dataset.i : null;
  };
  board.addEventListener('pointerdown', (e) => { painting = true; board.setPointerCapture(e.pointerId); paint(cellAt(e)); });
  board.addEventListener('pointermove', (e) => { if (painting) paint(cellAt(e)); });
  board.addEventListener('pointerup', () => { painting = false; });
  board.addEventListener('pointercancel', () => { painting = false; });

  const swatches = [...CHAR_PALETTE.map((c, i) => i), -1].map((i) => {
    const b = h('button', {
      class: 'swatch-btn' + (i === color ? ' on' : '') + (i < 0 ? ' eraser' : ''), style: i >= 0 ? `background:${CHAR_PALETTE[i]}` : '',
      onclick: () => { color = i; for (const s of swatches) s.classList.toggle('on', s === b); },
    }, i < 0 ? '⌫' : '');
    return b;
  });

  let clearArmed = false;
  root.append(h('div', { class: 'screen me' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'song-title' }, 'Make yourself!'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => { grid.splice(0, grid.length, ...defaultCharacter()); render(); } }, '👑'),
      h('button', {
        class: 'btn', onclick: (e) => {
          if (!clearArmed) { clearArmed = true; e.target.textContent = 'Clear?'; return; }
          grid.fill(-1); render(); clearArmed = false; e.target.textContent = '🧽';
        },
      }, '🧽'),
      h('button', { class: 'btn primary big', onclick: () => { st.character = grid; save(); location.hash = '#/'; } }, '✓')),
    h('div', { class: 'me-body' },
      board,
      h('div', { class: 'me-side' },
        h('div', { class: 'palette' }, swatches),
        h('div', { class: 'me-stand' }, preview, h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }))))));
  render();
}
