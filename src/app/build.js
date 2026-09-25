// The practice payoff: each note places a block in a little build, and her
// character climbs onto the newest block. The setting and the shape of the
// build change from one playthrough to the next (she dislikes repetition).
import { h, flash, sparkle } from './dom.js';
import { material, texture } from './pixels.js';

const CHAR_ASPECT = 14 / 10;
const GROUND = 40;

const BIOMES = [
  { name: 'day', sky: 'linear-gradient(#7ec8f5, #b9e3fb)', ground: 'grass' },
  { name: 'sunset', sky: 'linear-gradient(#ff8a65, #ffcf8a)', ground: 'grass' },
  { name: 'night', sky: 'linear-gradient(#0d1633, #27366e)', ground: 'grass', stars: true },
  { name: 'snow', sky: 'linear-gradient(#bfdff3, #eef7fd)', ground: 'snow' },
  { name: 'desert', sky: 'linear-gradient(#8fd3ff, #fde7b0)', ground: 'sand' },
];

// Slot positions {col, row} (row 0 = on the ground), in building order.
const SHAPES = {
  pyramid(count) {
    let base = 1;
    while ((base * (base + 1)) / 2 < count) base++;
    const out = [];
    for (let row = 0; out.length < count; row++)
      for (let c = 0; c < base - row && out.length < count; c++) out.push({ row, col: c + row / 2 });
    return out;
  },
  stairs(count) {
    const out = [];
    for (let col = 0; out.length < count; col++)
      for (let row = 0; row <= col && out.length < count; row++) out.push({ row, col });
    return out;
  },
  tower(count) {
    const out = [];
    for (let k = 0; k < count; k++) out.push({ row: Math.floor(k / 2), col: k % 2 });
    return out;
  },
};

export function createBuild(count, charUrl, variant = 0) {
  const biome = BIOMES[variant % BIOMES.length];
  let shape = ['pyramid', 'stairs', 'tower'][variant % 3];
  if (shape === 'tower' && count > 16) shape = 'pyramid'; // too tall to be fun
  const slots = SHAPES[shape](count);
  const cols = Math.max(1, ...slots.map((s) => s.col + 1));
  const rows = Math.max(1, ...slots.map((s) => s.row + 1));

  const tower = h('div', { class: 'tower' });
  const blocks = slots.map(() => null);
  const charImg = h('img', { src: charUrl });
  const char = h('div', { class: 'climber' }, charImg);
  const deco = biome.stars
    ? [h('div', { class: 'moon' }), ...Array.from({ length: 24 }, (_, i) =>
      h('div', { class: 'star-px', style: `left:${(i * 37) % 97}%;top:${(i * 53) % 55 + 3}%` }))]
    : [h('div', { class: 'cloud c1' }), h('div', { class: 'cloud c2' })];
  const el = h('div', { class: `build biome-${biome.name}`, style: `background:${biome.sky}` },
    ...deco, tower, char,
    h('div', { class: 'build-ground', style: `background-image:url(${texture(biome.ground)})` }));

  let B = 40, at = -1;
  // Sizes depend on the scene's rendered size; recompute on layout changes.
  function layoutScene() {
    const w = el.clientWidth, hgt = el.clientHeight - GROUND;
    B = Math.max(14, Math.min(72, Math.floor(Math.min((hgt - 10) / (rows + CHAR_ASPECT), (w * 0.6) / cols))));
    tower.style.width = `${cols * B}px`;
    tower.style.height = `${rows * B}px`;
    slots.forEach((s, k) => {
      const b = blocks[k];
      if (b) Object.assign(b.style, { left: `${s.col * B}px`, bottom: `${s.row * B}px`, width: `${B}px`, height: `${B}px`, backgroundSize: `${B}px ${B}px` });
    });
    charImg.style.height = `${Math.round(B * CHAR_ASPECT)}px`;
    moveChar(at, false);
  }
  new ResizeObserver(layoutScene).observe(el);

  function slotPos(k) {
    const r = tower.getBoundingClientRect(), p = el.getBoundingClientRect(), s = slots[k];
    return { x: r.left - p.left + s.col * B, y: r.bottom - p.top - (s.row + 1) * B };
  }

  function moveChar(k, hop = true) {
    at = k;
    const chh = Math.round(B * CHAR_ASPECT);
    let x, y;
    if (k < 0) {
      const r = tower.getBoundingClientRect(), p = el.getBoundingClientRect();
      x = r.left - p.left - B * 1.6;
      y = el.clientHeight - GROUND - chh;
    } else {
      const s = slotPos(k);
      x = s.x;
      y = s.y - chh + 2;
    }
    char.style.transform = `translate(${x}px, ${y}px)`;
    if (hop) flash(charImg, 'hop', 350);
  }

  return {
    el,
    place(k, midi) {
      if (k >= slots.length) return;
      let b = blocks[k];
      if (!b) {
        b = blocks[k] = h('div', { class: 'tblock' });
        tower.append(b);
      }
      b.style.backgroundImage = `url(${material(midi).url})`;
      layoutScene();
      flash(b, 'drop', 300);
      const s = slotPos(k);
      sparkle(el, s.x + B / 2, s.y + B / 2, [material(midi).color, '#ffffff'], 8);
      moveChar(k);
    },
    celebrate() {
      const r = el.getBoundingClientRect();
      for (let i = 0; i < 4; i++) {
        setTimeout(() => sparkle(el, r.width * (0.2 + 0.6 * Math.random()), r.height * (0.15 + 0.3 * Math.random()),
          ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff', '#5fc24a'], 16), i * 180);
      }
      flash(charImg, 'hop', 350);
    },
  };
}
