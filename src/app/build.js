// The practice payoff: each note places a block in a little pyramid tower,
// and her character climbs onto the newest block.
import { h, flash, sparkle } from './dom.js';
import { material, texture } from './pixels.js';

const CHAR_ASPECT = 14 / 10;

export function createBuild(count, charUrl) {
  // Smallest pyramid base that fits every note.
  let base = 1;
  while ((base * (base + 1)) / 2 < count) base++;
  const slots = [];
  for (let row = 0, k = 0; k < count; row++) {
    for (let c = 0; c < base - row && k < count; c++, k++) slots.push({ row, col: c + row / 2 });
  }
  const rows = slots.length ? slots[slots.length - 1].row + 1 : 1;

  const tower = h('div', { class: 'tower' });
  const blocks = slots.map(() => null);
  const charImg = h('img', { src: charUrl });
  const char = h('div', { class: 'climber' }, charImg);
  const el = h('div', { class: 'build' },
    h('div', { class: 'cloud c1' }), h('div', { class: 'cloud c2' }),
    tower, char,
    h('div', { class: 'build-ground', style: `background-image:url(${texture('grass')})` }));

  let B = 40, at = -1;
  // Sizes depend on the scene's rendered size; recompute on layout changes.
  function layoutScene() {
    const w = el.clientWidth, hgt = el.clientHeight - 40; // minus ground
    B = Math.max(18, Math.min(56, Math.floor(Math.min((hgt - B * CHAR_ASPECT - 10) / rows, (w * 0.6) / base))));
    tower.style.width = `${base * B}px`;
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
    const cw = B, chh = Math.round(B * CHAR_ASPECT);
    let x, y;
    if (k < 0) {
      const r = tower.getBoundingClientRect(), p = el.getBoundingClientRect();
      x = r.left - p.left - cw * 1.6;
      y = el.clientHeight - 40 - chh;
    } else {
      const s = slotPos(k);
      x = s.x + (B - cw) / 2;
      y = s.y - chh + 2;
    }
    char.style.transform = `translate(${x}px, ${y}px)`;
    if (hop) flash(charImg, 'hop', 350);
  }

  return {
    el,
    // kind: 'good' (note's material) or 'cracked' (cobblestone)
    place(k, midi, kind = 'good') {
      if (k >= slots.length) return;
      let b = blocks[k];
      if (!b) {
        b = blocks[k] = h('div', { class: 'tblock' });
        tower.append(b);
      }
      b.style.backgroundImage = `url(${kind === 'cracked' ? texture('cobble') : material(midi).url})`;
      b.classList.toggle('cracked', kind === 'cracked');
      layoutScene();
      flash(b, 'drop', 300);
      const s = slotPos(k);
      if (kind !== 'cracked') sparkle(el, s.x + B / 2, s.y + B / 2, [material(midi).color, '#ffffff'], 8);
      moveChar(k);
    },
    // Where the character stands without placing anything (e.g. after a miss).
    stand(k) { moveChar(k); },
    shake() { flash(charImg, 'shake', 400); },
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
