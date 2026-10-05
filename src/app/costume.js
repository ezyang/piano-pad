// Costume time: the drawing she loves, as the reward for homework. Each
// homework piece earns one costume piece, drawn in the character editor's
// style right after she finishes it (🦓 → a hat, 🚂 → something to hold,
// 🎶 → a cape), and from then on her character wears it in the adventure:
// the map, the homework page, the party.
//
// Costumes live in the adventure (memory only, like the band); her saved
// character (store.js `pianopad.character`) is never touched. The outfit is
// drawn on a bigger canvas than the character (OW x OH, the character at
// OX, OY), one layer per part, each painted only inside its zone; the hat and
// the thing to hold go over her, the cape behind. Parts she hasn't earned
// yet show as dashed ghost outlines (the promise: play this to draw that).
import { h } from './dom.js';
import { CHAR_W, CHAR_H, CHAR_PALETTE, texture } from './pixels.js';

export const OW = 18, OH = 20, OX = 3, OY = 4;

// Ghost shapes: filled rows at (x, y) on the outfit canvas; drawn as a
// faint outline.
export const PARTS = {
  hat: {
    icon: '🎩', zone: { x: 0, y: 0, w: 16, h: 7 }, under: false, color: 0,
    ghost: { x: 3, y: 0, rows: ['..xxxxxx..', '..xxxxxx..', '..xxxxxx..', '..xxxxxx..', '..xxxxxx..', 'xxxxxxxxxx'] },
  },
  hold: {
    icon: '🎈', zone: { x: 11, y: 2, w: 7, h: 16 }, under: false, color: 6,
    ghost: { x: 12, y: 2, rows: ['.xxxx.', 'xxxxxx', 'xxxxxx', 'xxxxxx', '.xxxx.', '..xx..', '..x...', '..x...', '..x...', '.x....', '.x....', 'x.....'] },
  },
  cape: {
    icon: '🦸', zone: { x: 0, y: 9, w: 16, h: 9 }, under: true, color: 10,
    ghost: { x: 0, y: 11, rows: ['....xxxxxxxx....', '...xxxxxxxxxx...', '...xxxxxxxxxx...', '..xxxxxxxxxxxx..', '..xxxxxxxxxxxx..', '.xxxxxxxxxxxxxx.', '.xxxxxxxxxxxxxx.'] },
  },
};
export const PART_OF = { zebra: 'hat', train: 'hold', ode: 'cape' };

const blank = () => new Array(OW * OH).fill(-1);
export const inZone = (part, x, y) => { const z = PARTS[part].zone; return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h; };
export const pixels = (layer) => (layer ? layer.filter((v) => v >= 0).length : 0);
export const has = (costume, part) => pixels(costume?.[part]) > 0;
export const layerOf = (costume, part) => (costume[part] ??= blank());

// The character's palette index at outfit (x, y), or -1.
export function charAt(char, x, y) {
  const cx = x - OX, cy = y - OY;
  return cx >= 0 && cx < CHAR_W && cy >= 0 && cy < CHAR_H ? char[cy * CHAR_W + cx] ?? -1 : -1;
}

const ghostCells = new Map();
// The dashed outline of a part's ghost: [[x, y], ...] on the outfit canvas.
function ghostOutline(part) {
  if (ghostCells.has(part)) return ghostCells.get(part);
  const { x: gx, y: gy, rows } = PARTS[part].ghost;
  const on = (x, y) => rows[y]?.[x] === 'x';
  const out = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!on(x, y)) return;
    const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
    if (edge) out.push([gx + x, gy + y]);
  }));
  ghostCells.set(part, out);
  return out;
}

const GHOST = 'rgba(255, 255, 255, 0.6)';
const urls = new Map();
function draw(key, w, h, paint) {
  if (urls.has(key)) return urls.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  paint((x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); });
  const url = c.toDataURL();
  if (urls.size > 300) urls.clear();
  urls.set(key, url);
  return url;
}

// Her character wearing the costume (and, with ghosts, dashed outlines of
// the parts not drawn yet). Cropped to what's there, kept centred on her, so
// with no costume it's exactly her 10x14 character. Returns { url, rows }.
export function outfit(char, costume = {}, { ghosts = false } = {}) {
  const parts = Object.keys(PARTS);
  let l = OX, r = OX + CHAR_W - 1, t = OY;
  const b = OY + CHAR_H - 1;
  const ghostly = ghosts ? parts.filter((p) => !has(costume, p)) : [];
  const grow = (x, y) => { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); };
  for (const p of parts) costume[p]?.forEach((v, i) => { if (v >= 0) grow(i % OW, Math.floor(i / OW)); });
  for (const p of ghostly) for (const [x, y] of ghostOutline(p)) grow(x, y);
  const mid = OX + (CHAR_W - 1) / 2, half = Math.max(mid - l, r - mid);
  l = Math.floor(mid - half); r = Math.ceil(mid + half);
  const w = r - l + 1, hh = b - t + 1;
  const key = [char.join(','), parts.map((p) => costume[p]?.join(',') ?? '').join('|'), ghostly.join(','), l, t].join('/');
  const url = draw(key, w, hh, (px) => {
    const put = (x, y, v) => { if (v >= 0 && y <= b) px(x - l, y - t, CHAR_PALETTE[v]); };
    for (const p of ghostly) if (PARTS[p].under) for (const [x, y] of ghostOutline(p)) px(x - l, y - t, GHOST);
    for (const p of parts) if (PARTS[p].under) costume[p]?.forEach((v, i) => put(i % OW, Math.floor(i / OW), v));
    for (let y = OY; y <= b; y++) for (let x = OX; x < OX + CHAR_W; x++) put(x, y, charAt(char, x, y));
    for (const p of parts) if (!PARTS[p].under) costume[p]?.forEach((v, i) => put(i % OW, Math.floor(i / OW), v));
    for (const p of ghostly) if (!PARTS[p].under) for (const [x, y] of ghostOutline(p)) px(x - l, y - t, GHOST);
  });
  return { url, rows: hh };
}

// An <img> of her outfit that sits where her plain character would: CSS
// sets its height as for the 10x14 character, and `scale` keeps her pixels
// the same size when the outfit is taller (the extra sticks up/out).
export function outfitImg(char, costume, opts = {}, cls = 'member-sprite') {
  const img = h('img', { class: cls });
  setOutfit(img, char, costume, opts);
  return img;
}
export function setOutfit(img, char, costume, opts = {}) {
  const { url, rows } = outfit(char, costume, opts);
  img.src = url;
  img.style.scale = rows > CHAR_H ? String(rows / CHAR_H) : '';
  img.style.transformOrigin = 'bottom center';
}

// One part on its own, cropped to it: what she drew, or its ghost.
export function partUrl(costume, part) {
  const filled = has(costume, part);
  const cells = filled
    ? costume[part].flatMap((v, i) => (v >= 0 ? [[i % OW, Math.floor(i / OW), CHAR_PALETTE[v]]] : []))
    : ghostOutline(part).filter(([x, y]) => inZone(part, x, y)).map(([x, y]) => [x, y, GHOST]);
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const l = Math.min(...xs), t = Math.min(...ys), w = Math.max(...xs) - l + 1, hh = Math.max(...ys) - t + 1;
  const n = Math.max(w, hh); // square, centred
  const ox = l - Math.floor((n - w) / 2), oy = t - Math.floor((n - hh) / 2);
  return draw('part:' + part + ':' + cells.map((c) => c.join(',')).join(';'), n, n, (px) => {
    for (const [x, y, c] of cells) px(x - ox, y - oy, c);
  });
}

// A slot: a dashed box holding the part (its ghost until she draws it).
export function slot(costume, part, cls = '') {
  const filled = has(costume, part);
  return h('div', { class: 'costume-slot ' + cls + (filled ? ' filled' : '') },
    h('img', { src: partUrl(costume, part) }));
}

// Costume time: a board of the part's zone (her character showing through,
// the editor's palette), a preview of her in the outfit, a big ✓. Painting
// goes only in the zone; a cape goes behind her, so her own pixels can't be
// painted for it. done({ pixels, strokes, ms }) when she taps ✓.
export function costumeTime(parent, char, costume, part, done) {
  const P = PARTS[part], z = P.zone, layer = layerOf(costume, part);
  const t0 = Date.now();
  const before = pixels(layer); // a replayed piece edits the part she drew before
  let color = P.color, painting = false, strokes = 0, changed = false;
  const cells = [];
  for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) cells.push(h('div', { class: 'cell', 'data-i': y * OW + x }));
  const board = h('div', { class: 'board costume-board', style: `grid-template-columns:repeat(${z.w}, 1fr)` }, cells);
  const preview = outfitImg(char, costume, {}, 'costume-preview');
  const ghostAt = new Set(ghostOutline(part).map(([x, y]) => y * OW + x));
  const blocked = (i) => P.under && charAt(char, i % OW, Math.floor(i / OW)) >= 0;
  function render() {
    for (const c of cells) {
      const i = +c.dataset.i, x = i % OW, y = Math.floor(i / OW);
      const mine = layer[i], hers = charAt(char, x, y);
      const v = P.under ? (hers >= 0 ? hers : mine) : mine >= 0 ? mine : hers;
      c.style.background = v >= 0 ? CHAR_PALETTE[v] : '';
      c.classList.toggle('her', v >= 0 && v === hers && (P.under || mine < 0));
      c.classList.toggle('ghost', v < 0 && ghostAt.has(i)); // where the part could go
    }
    setOutfit(preview, char, costume);
  }
  const paint = (i) => {
    if (i == null || blocked(i) || layer[i] === color) return;
    layer[i] = color;
    changed = true;
    render();
  };
  const cellAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el?.classList.contains('cell') && board.contains(el) ? +el.dataset.i : null;
  };
  board.addEventListener('pointerdown', (e) => { painting = true; changed = false; board.setPointerCapture(e.pointerId); paint(cellAt(e)); });
  board.addEventListener('pointermove', (e) => { if (painting) paint(cellAt(e)); });
  const up = () => { if (painting && changed) strokes++; painting = false; };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);

  const swatches = [...CHAR_PALETTE.map((c, i) => i), -1].map((i) => {
    const b = h('button', {
      class: 'swatch-btn' + (i === color ? ' on' : '') + (i < 0 ? ' eraser' : ''), style: i >= 0 ? `background:${CHAR_PALETTE[i]}` : '',
      onclick: () => { color = i; for (const s of swatches) s.classList.toggle('on', s === b); },
    }, i < 0 ? '⌫' : '');
    return b;
  });
  const box = h('div', { class: 'overlay costume-time' },
    h('div', { class: 'costume-head' }, h('div', { class: 'costume-icon' }, P.icon), h('div', { class: 'costume-title' }, '✏️')),
    h('div', { class: 'costume-body' }, board,
      h('div', { class: 'costume-side' },
        h('div', { class: 'me-stand' }, preview, h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` })),
        h('button', { class: 'btn primary huge costume-done', onclick: () => { box.remove(); done(stats()); } }, '✓'))),
    h('div', { class: 'palette costume-palette' }, swatches));
  const stats = () => ({ pixels: pixels(layer), ...(before ? { before } : {}), strokes, ms: Date.now() - t0 });
  parent.append(box);
  // Cells as big as fit (the board's zone is wide for a hat, tall for a balloon).
  const fit = () => {
    const r = board.parentElement.getBoundingClientRect();
    const side = 200;
    const wide = r.width > r.height * 1.2;
    const cell = Math.max(16, Math.min(60, Math.floor(Math.min((r.width - (wide ? side : 0) - 20) / z.w, (r.height - (wide ? 0 : side) - 20) / z.h))));
    board.style.width = `${cell * z.w + 8}px`;
    board.style.height = `${cell * z.h + 8}px`;
  };
  render();
  fit();
  return { stats, remove: () => box.remove() };
}
