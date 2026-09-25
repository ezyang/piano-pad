// Optional on-screen test keyboard (⚙︎ menu → Test keyboard). Keys feed
// synthesized notes silently into the real detector, so a parent can try
// things out without a piano or any sound.
import { h } from './dom.js';
import { engine } from './engine.js';
import { getState } from './store.js';
import { letter } from './music.js';

const LO = 60, HI = 72; // C4..C5
const BLACK = [1, 3, 6, 8, 10];

export function testKeyboard() {
  if (!getState().testKeyboard) return null;
  const whites = [], blacks = [];
  let wi = 0;
  for (let m = LO; m <= HI; m++) {
    if (BLACK.includes(m % 12)) blacks.push({ m, at: wi });
    else whites.push({ m, i: wi++ });
  }
  const press = (e, m) => {
    e.preventDefault();
    e.currentTarget.classList.add('down');
    engine.simulate(m, { audible: false });
  };
  const release = (e) => e.currentTarget.classList.remove('down');
  const key = (cls, m, style) => h('button', {
    class: cls, style, onpointerdown: (e) => press(e, m), onpointerup: release, onpointerleave: release, onpointercancel: release,
  }, cls === 'wk' ? letter(m) : '');
  return h('div', { class: 'test-kb' },
    h('div', { class: 'kb-label' }, '🔇 test'),
    h('div', { class: 'kb-keys', style: `--n:${whites.length}` },
      whites.map(({ m, i }) => key('wk', m, `left:calc(${i} * 100% / var(--n))`)),
      blacks.map(({ m, at }) => key('bk', m, `left:calc(${at} * 100% / var(--n) - 100% / var(--n) * 0.3)`))));
}
