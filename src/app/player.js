// Who's at the piano, for the logs: the ⚙︎ menu's "A grown-up is playing"
// switch tags every session `player: 'grownup'` (otherwise 'kid'), so test
// runs and demonstrations don't count as hers. Leaving it on by accident is
// the risk, so it lives only in memory (a reload turns it off), turns itself
// off after an hour with no taps or notes, and shows a badge on every screen
// while it's on (tap the badge to turn it off). Nothing else changes.
import { h } from './dom.js';
import { engine } from './engine.js';

const IDLE_MS = 60 * 60 * 1000;
let on = false;
let lastActive = Date.now();
let badge = null;

export const player = () => (on ? 'grownup' : 'kid');
export const isGrownup = () => on;

export function setGrownup(v) {
  on = !!v;
  lastActive = Date.now();
  if (on && !badge) {
    badge = h('button', { class: 'grownup-badge', onclick: () => setGrownup(false) }, '🧑 Grown-up playing ✕');
    document.body.append(badge);
  } else if (!on && badge) {
    badge.remove();
    badge = null;
  }
}

const touch = () => { lastActive = Date.now(); };
addEventListener('pointerdown', touch, { capture: true });
engine.onNote(touch);
setInterval(() => { if (on && Date.now() - lastActive > IDLE_MS) setGrownup(false); }, 60 * 1000);

// Two tags for one session (at its start and end, or across the adventure's
// steps) that disagree make it 'mixed'.
export const mergePlayer = (a, b) => (a == null ? b : a === b ? a : 'mixed');
