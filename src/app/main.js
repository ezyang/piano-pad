import { engine } from './engine.js';
import { home } from './screens/home.js';
import { editor } from './screens/editor.js';
import { play } from './screens/play.js';
import { band } from './screens/band.js';
import { me } from './screens/me.js';
import { texture } from './pixels.js';

const ROUTES = { '': home, song: editor, play, band, me };
const root = document.getElementById('app');
let dispose = null;

function route() {
  dispose?.();
  dispose = null;
  root.replaceChildren();
  const [name, id] = location.hash.replace(/^#\/?/, '').split('/');
  dispose = (ROUTES[name] ?? home)(root, id) ?? null;
}

document.body.style.setProperty('--dirt', `url(${texture('dirt')})`);
document.body.style.setProperty('--stone', `url(${texture('stone')})`);
// Audio can only start from a user gesture; any tap will do.
addEventListener('pointerdown', () => engine.start(), { capture: true });
addEventListener('hashchange', route);
route();
window.__engine = engine; // for debugging from the console
