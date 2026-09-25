import { h } from '../dom.js';
import { getState, newSong, resetAll, save } from '../store.js';
import { material, characterUrl, BAND, bandSprite, texture } from '../pixels.js';

export function home(root) {
  const st = getState();
  const me = characterUrl(st.character);

  const cards = st.songs.map((song) => {
    const preview = song.notes.filter((n) => n.p != null).slice(0, 10)
      .map((n) => h('span', { class: 'mini-block', style: `background-image:url(${material(n.p).url})` }));
    const band = BAND.slice(0, song.band).map((m, i) =>
      h('img', { class: 'mini-sprite', src: i === 0 ? me : bandSprite(m) }));
    return h('a', { class: 'card' + (song.by === 'teacher' ? ' teacher' : ''), href: `#/song/${song.id}` },
      song.by === 'teacher' ? h('div', { class: 'badge' }, '📝') : null,
      h('div', { class: 'card-title' }, song.title),
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
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.testKeyboard || null, onchange: (e) => { st.testKeyboard = e.target.checked; save(); } }),
        'Test keyboard (silent, on Play and Compose screens)'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: st.showLetters !== false || null, onchange: (e) => { st.showLetters = e.target.checked; save(); } }),
        'Letter names under notes'),
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
    h('div', { class: 'cards' }, cards, add),
    h('div', { class: 'ground', style: `background-image:url(${texture('grass')})` })));
}
