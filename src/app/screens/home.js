import { h } from '../dom.js';
import { getState, resetAll, save } from '../store.js';
import { characterUrl, BAND, bandSprite, texture } from '../pixels.js';
import * as adventure from '../adventure.js';
import { shareLogs, sessionCount, VERSION } from '../telemetry.js';
import { engine } from '../engine.js';
import { EXPERIMENTS, enabledExperiments, setExperimentEnabled } from '../experiments.js';
import { labelMode } from '../labels.js';

export function home(root) {
  const st = getState();
  const me = characterUrl(st.character);

  // Today's adventure leads; the experiments are for free play after. (Her
  // songs and the editor are hidden for now; old songs stay in storage.)
  const a = adventure.peek();
  const done = (step) => !!a?.done.has(step);
  const advCard = h('a', { class: 'card adv-card', href: '#/adventure' },
    h('div', { class: 'card-title' }, 'Today’s adventure'),
    h('div', { class: 'adv-mini' }, [['warmup', '🌅'], ['homework', '📝'], ['party', '🎉']].map(([step, icon]) =>
      h('span', {}, done(step) ? '✅' : icon))),
    h('div', { class: 'mini-band' }, (a?.band ?? ['piano']).map((id) => h('img', { class: 'mini-sprite', src: id === 'piano' ? me : bandSprite(BAND.find((m) => m.id === id)) }))));

  let armed = false;
  const parent = h('details', { class: 'parent' },
    h('summary', {}, '⚙︎'),
    h('div', { class: 'parent-menu' },
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.testKeyboard || null, onchange: (e) => { st.testKeyboard = e.target.checked; save(); } }),
        'Test keyboard (silent, on Play and Compose screens)'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.strictOctave !== false || null, onchange: (e) => { st.strictOctave = e.target.checked; save(); } }),
        'Right octave counts (not just the right letter)'),
      h('label', { class: 'check' }, 'Under notes: ',
        h('select', { onchange: (e) => { st.labels = e.target.value; save(); } },
          [['letters', 'letters'], ['fingers', 'finger numbers (C position) + ✋'], ['none', 'nothing']].map(([v, t]) =>
            h('option', { value: v, selected: labelMode() === v || null }, t)))),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.keepLogs !== false || null, onchange: (e) => { st.keepLogs = e.target.checked; save(); } }),
        'Keep practice logs (notes heard, no audio)'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.recordAudio !== false || null, onchange: (e) => { st.recordAudio = e.target.checked; save(); } }),
        'Record audio with logs (goes only to the home server)'),
      h('button', { class: 'menu-btn', onclick: () => shareLogs() }, `📤 Share practice logs (${sessionCount()})`),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.detector === 'overlap' || null, onchange: (e) => { st.detector = e.target.checked ? 'overlap' : 'simple'; save(); engine.configure(); } }),
        'Experimental: overlapping-note detector'),
      h('div', { class: 'hint' }, 'Experiments on the home screen:'),
      EXPERIMENTS.map((e) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: getState().experiments?.[e.id] !== false || null, onchange: (ev) => { setExperimentEnabled(e.id, ev.target.checked); save(); location.reload(); } }),
        e.title)),
      h('a', { href: '#/calibrate' }, '🎯 Calibrate the ears (labeled recordings for tuning)'),
      h('a', { href: 'jig.html' }, 'Detector jig'),
      h('button', {
        onclick: (e) => {
          if (!armed) { armed = true; e.target.textContent = 'Tap again to erase everything'; return; }
          resetAll();
          location.reload();
        },
      }, 'Reset all data'),
      h('div', { class: 'hint' }, 'Tip: on a computer, keys A–K play pretend piano notes.'),
      h('div', { class: 'hint' }, `Version ${VERSION.split(' ')[0]} (${VERSION.split(' ')[1]?.slice(0, 10) ?? 'local'}) · `,
        location.pathname.startsWith('/v/') ? [h('a', { href: '/' }, 'today’s app'), ' · '] : null,
        h('a', { href: '/v/' }, 'all versions')),
    ));

  root.append(h('div', { class: 'screen home' },
    h('header', { class: 'home-head' },
      h('h1', {}, 'Piano Pad'),
      h('a', { class: 'me-btn', href: '#/me', title: 'Make your character' },
        h('img', { src: me, class: 'me-sprite' }), h('span', {}, 'Me')),
      parent),
    h('div', { class: 'cards' },
      advCard,
      enabledExperiments().map((e) => {
        const c = e.card();
        return h('a', { class: 'card world-card', href: `#/${e.id}`, style: c.style },
          c.img ? h('img', { class: 'exp-sprite', src: c.img }) : h('div', { class: 'plus' }, c.icon),
          h('div', { class: 'card-title' }, e.title));
      }),
    ),
    h('div', { class: 'ground', style: `background-image:url(${texture('grass')})` })));
}
