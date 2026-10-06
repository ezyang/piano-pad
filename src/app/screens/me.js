// Pixel-art character editor (charedit.js). Her drawing is kept as she goes
// (after each stroke, and whenever she leaves the screen, by 🏠, ✓ or
// anything else), so no way out loses it. The two ways to wipe it (👑 back
// to the default, 🧽 clear) each take a second tap.
import { h } from '../dom.js';
import { defaultCharacter, texture } from '../pixels.js';
import { characterEditor } from '../charedit.js';

export function me(root) {
  const ed = characterEditor();
  const { grid, render, keep } = ed;

  // Tap once to arm (the button asks), again to do it; arming one disarms
  // the other, and an armed button gives up after a few seconds.
  const armed = (icon, question, act) => {
    let timer = 0;
    const b = h('button', {
      class: 'btn', onclick: () => {
        if (!b.classList.contains('armed')) {
          for (const o of wipers) disarm(o);
          b.classList.add('armed'); b.textContent = question;
          timer = setTimeout(() => disarm(b), 3000);
          return;
        }
        clearTimeout(timer); disarm(b);
        act(); render(); keep();
      },
    }, icon);
    b.dataset.icon = icon;
    return b;
  };
  const disarm = (b) => { b.classList.remove('armed'); b.textContent = b.dataset.icon; };
  const wipers = [
    armed('👑', 'Start over?', () => grid.splice(0, grid.length, ...defaultCharacter())),
    armed('🧽', 'Clear?', () => grid.fill(-1)),
  ];
  root.append(h('div', { class: 'screen me' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'song-title' }, 'Make yourself!'),
      h('div', { class: 'spacer' }),
      wipers,
      h('a', { class: 'btn primary big', href: '#/' }, '✓')),
    h('div', { class: 'me-body' },
      ed.board,
      h('div', { class: 'me-side' },
        ed.palette,
        h('div', { class: 'me-stand' }, ed.preview, h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }))))));
  return keep;
}
