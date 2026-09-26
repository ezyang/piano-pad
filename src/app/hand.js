// A big cartoon hand (palm down, seen from above) with numbered fingers; the
// finger to use next lights up. Right hand: thumb (1) on the left.
import { svg } from './dom.js';

// Finger x (0..100), fingertip y, and width; the thumb sits lower and wider.
const FINGERS = [
  { n: 1, x: 8, top: 52, w: 17 },
  { n: 2, x: 27, top: 14, w: 15 },
  { n: 3, x: 45, top: 6, w: 15 },
  { n: 4, x: 63, top: 12, w: 15 },
  { n: 5, x: 80, top: 28, w: 13 },
];

export function createHand() {
  const el = svg('svg', { class: 'hand', viewBox: '0 0 100 110', width: 110, height: 121 });
  const g = svg('g', {});
  g.append(svg('rect', { x: 22, y: 58, width: 72, height: 48, rx: 14, class: 'palm' }));
  const fingers = FINGERS.map(({ n, x, top, w }) => {
    const f = svg('g', { class: 'finger' });
    f.append(
      svg('rect', { x, y: top, width: w, height: (n === 1 ? 90 : 72) - top + (n === 1 ? 10 : 0), rx: w / 2, class: 'digit' }),
      svg('circle', { cx: x + w / 2, cy: top + 9, r: 7.5, class: 'tip' }),
      svg('text', { x: x + w / 2, y: top + 13, class: 'num' }, String(n)),
    );
    g.append(f);
    return f;
  });
  el.append(g);
  return {
    el,
    // finger: 1..5 or null (nothing lit); side: 'right' | 'left' (mirrored).
    show(finger, side = 'right') {
      g.setAttribute('transform', side === 'left' ? 'translate(100 0) scale(-1 1)' : '');
      for (const t of el.querySelectorAll('.num')) t.setAttribute('transform', side === 'left' ? `translate(${2 * +t.getAttribute('x')} 0) scale(-1 1)` : '');
      fingers.forEach((f, i) => f.classList.toggle('lit', i + 1 === finger));
      el.style.visibility = finger ? '' : 'hidden';
    },
  };
}
