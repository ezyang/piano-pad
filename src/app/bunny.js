// The bunny house: a few seconds before Zebra in the adventure (2026-10-08,
// pedagogy: the teacher's goal for Zebra this week is hand shape, a "tall
// round bunny house": curved fingers, high knuckle, room underneath). The
// app can't see her hands, so this is a reminder ritual, never a check:
// a picture of the arched hand over the keys with a bunny waiting beside
// it, "Make a bunny house!", and when her hand is ready she taps (the
// bunny, the picture or the big ✓). The bunny hops in under the hand with
// a happy sound and the piece starts. No timer, no wrong answer.
import { h, sparkle } from './dom.js';
import { bunnyUrl, bunnyHouseUrl, BUNNY_HOUSE } from './pixels.js';
import { engine } from './engine.js';
import { renderBunnyHop } from './instruments.js';

const HOP_MS = 1500; // the tap → the piece starting

// tap({ ms, by? }) when she taps (ms: shown → the tap; by: 'grownup' for a
// grown-up's step, which skips the hop), then() once the bunny is home.
// quit() for leaving before her tap: returns { ms } (null after the tap).
export function bunnyHouse(parent, { tap, then }) {
  const t0 = Date.now();
  const { w: W, h: H, bunny: B, out, in: home } = BUNNY_HOUSE;
  const pct = (v, of) => `${(100 * v) / of}%`;
  const bunny = h('img', { class: 'bunny-sprite', src: bunnyUrl(), alt: '',
    style: `width:${pct(B.w, W)};height:${pct(B.h, H)};left:${pct(out.x, W)};top:${pct(out.y, H)};--hop-x:${pct(home.x - out.x, B.w)}` });
  const scene = h('div', { class: 'bunny-scene' }, h('img', { class: 'bunny-hand', src: bunnyHouseUrl(), alt: '' }), bunny);
  const ok = h('button', { class: 'btn primary bunny-ok' }, '✓');
  const box = h('div', { class: 'bunny-house' }, h('div', { class: 'bunny-text' }, 'Make a bunny house!'), scene, ok);
  parent.append(box);
  let state = 'waiting', timer = 0; // waiting → hopping → over

  const tapped = (by) => {
    if (state !== 'waiting') return;
    const ms = Date.now() - t0;
    tap(by === 'grownup' ? { ms, by } : { ms });
    if (by === 'grownup') { state = 'over'; box.remove(); then(); return; }
    state = 'hopping';
    box.classList.add('hopping');
    bunny.classList.add('hop-in');
    // The tap is a gesture: wake the audio if it's asleep, then the boings.
    engine.start().then(() => { if (box.isConnected) engine.play(renderBunnyHop(engine.ctx.sampleRate)); }).catch(() => {});
    setTimeout(() => {
      if (!box.isConnected) return;
      const r = bunny.getBoundingClientRect(), b = box.getBoundingClientRect();
      sparkle(box, r.left - b.left + r.width / 2, r.top - b.top + r.height / 3, ['#ffd84a', '#ff8fb3', '#ffffff', '#55e0d6'], 14);
    }, 750);
    timer = setTimeout(() => { state = 'over'; box.remove(); then(); }, HOP_MS);
  };
  box.addEventListener('pointerdown', (e) => { if (!e.isPrimary) return; tapped('tap'); });

  return {
    get open() { return state === 'waiting'; },
    close: (by) => tapped(by),
    quit() {
      clearTimeout(timer);
      box.remove();
      const was = state;
      state = 'over';
      return was === 'waiting' ? { ms: Date.now() - t0 } : null;
    },
  };
}
