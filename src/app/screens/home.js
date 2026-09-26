import { h } from '../dom.js';
import { getState, newSong, resetAll, save } from '../store.js';
import { material, characterUrl, BAND, bandSprite, texture } from '../pixels.js';
import { shareLogs, sessionCount } from '../telemetry.js';
import { engine } from '../engine.js';
import { EXPERIMENTS, enabledExperiments, setExperimentEnabled } from '../experiments.js';
import { labelMode } from '../labels.js';

export function home(root) {
  const st = getState();
  const me = characterUrl(st.character);

  // Homework first (newest first), then her own songs.
  const ordered = [...st.songs.filter((s) => s.by === 'teacher').reverse(), ...st.songs.filter((s) => s.by !== 'teacher')];
  const cards = ordered.map((song) => {
    const preview = song.notes.filter((n) => n.p != null).slice(0, 10)
      .map((n) => h('span', { class: 'mini-block', style: `background-image:url(${material(n.p).url})` }));
    const band = BAND.slice(0, song.band).map((m, i) =>
      h('img', { class: 'mini-sprite', src: i === 0 ? me : bandSprite(m) }));
    // Homework opens straight into practice; her own songs open where she builds them.
    const href = song.by === 'teacher' ? `#/play/${song.id}` : `#/song/${song.id}`;
    return h('a', { class: 'card' + (song.by === 'teacher' ? ' teacher' : ''), href },
      song.by === 'teacher' ? h('div', { class: 'badge' }, '📝') : null,
      h('div', { class: 'card-title' }, song.title),
      song.best ? h('div', { class: 'card-stars' }, [0, 1, 2].map((k) => h('span', { class: k < song.best ? 'on' : '' }, '★'))) : null,
      h('div', { class: 'mini-strip' }, preview.length ? preview : h('span', { class: 'empty' }, '...')),
      h('div', { class: 'mini-band' }, band));
  });

  const add = h('button', {
    class: 'card add', onclick: () => { location.hash = `#/song/${newSong().id}`; },
  }, h('div', { class: 'plus' }, '+'), h('div', { class: 'card-title' }, 'New song'));

  let armed = false;
  const parent = h('details', { class: 'parent' },
    h('summary', {}, '⚙︎'),
    h('div', { class: 'parent-menu' },
      h('button', { class: 'menu-btn', onclick: () => { location.hash = `#/song/${newSong('teacher').id}/edit`; } }, '➕ Add homework song'),
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
    ));

  root.append(h('div', { class: 'screen home' },
    h('header', { class: 'home-head' },
      h('h1', {}, 'Piano Pad'),
      h('a', { class: 'me-btn', href: '#/me', title: 'Make your character' },
        h('img', { src: me, class: 'me-sprite' }), h('span', {}, 'Me')),
      parent),
    h('div', { class: 'cards' },
      enabledExperiments().map((e) => {
        const c = e.card();
        return h('a', { class: 'card world-card', href: `#/${e.id}`, style: c.style },
          c.img ? h('img', { class: 'exp-sprite', src: c.img }) : h('div', { class: 'plus' }, c.icon),
          h('div', { class: 'card-title' }, e.title));
      }),
      cards, add),
    h('div', { class: 'ground', style: `background-image:url(${texture('grass')})` })));
}
