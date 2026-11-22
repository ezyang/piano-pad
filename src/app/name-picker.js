// Her band name, picked by her (2026-11-21, pedagogy; name.js). Tap her
// name under her character (map lineup, party, band screen) and a big
// letter board opens: A-Z, a space, ⌫, ✓ and ✕. No system keyboard. Up to
// NAME_MAX letters; ✓ with nothing typed goes back to Princess.
//
// Logged as its own session, kind 'rename' (record(), not startSession,
// so it never ends the screen's own session): one 'rename' event { from,
// to: 'default' | 'own', len } (lengths only: the name itself may be her
// real name, and logging it needs the parent's OK), or 'rename-cancel'.
import { h, flash, sparkle } from './dom.js';
import { playerName, setPlayerName, hasOwnName, NAME_MAX, DEFAULT_NAME } from './name.js';
import { record, sessionHeader } from './telemetry.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function logRename(type, data) {
  try { record({ ...sessionHeader('rename'), events: [[0, type, data]] }); } catch { /* logging is best-effort */ }
}

// The name element to show under her character: tapping it opens the board.
// onChange(name) after she picks one (to redraw what else shows it).
export function nameTag(cls = 'member-name', onChange = null) {
  const el = h('button', { class: cls + ' name-tag', title: 'Change my name' }, playerName());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openNamePicker(document.body, (name) => {
      for (const tag of document.querySelectorAll('.name-tag')) tag.textContent = name;
      onChange?.(name);
    });
  });
  return el;
}

export function openNamePicker(parent, done) {
  const wasOwn = hasOwnName(), oldLen = wasOwn ? playerName().length : 0;
  let text = wasOwn ? playerName() : '';
  const shown = h('div', { class: 'name-shown' });
  const draw = () => { shown.textContent = text || '…'; shown.classList.toggle('empty', !text); };
  const type = (ch) => {
    if (text.length >= NAME_MAX || (ch === ' ' && (!text || text.endsWith(' ')))) { flash(shown, 'shake', 300); return; }
    text += ch; draw(); flash(shown, 'pop', 200);
  };
  const key = (label, fn, cls = '') => {
    const b = h('button', { class: 'name-key ' + cls }, label);
    b.addEventListener('pointerdown', (e) => { if (!e.isPrimary) return; e.preventDefault(); fn(); flash(b, 'pop', 200); });
    return b;
  };
  const close = () => box.remove();
  const box = h('div', { class: 'overlay name-picker' },
    h('div', { class: 'name-panel' },
      h('div', { class: 'name-title' }, 'My name'),
      shown,
      h('div', { class: 'name-keys' }, LETTERS.map((l) => key(l, () => type(l)))),
      h('div', { class: 'name-row' },
        key('✕', () => { logRename('rename-cancel', {}); close(); }, 'cancel'),
        key('␣', () => type(' '), 'space'),
        key('⌫', () => { text = text.slice(0, -1); draw(); }, 'back'),
        key('✓', () => {
          const name = setPlayerName(text) || DEFAULT_NAME;
          logRename('rename', { from: wasOwn ? 'own' : 'default', fromLen: oldLen, to: hasOwnName() ? 'own' : 'default', len: hasOwnName() ? name.length : 0 });
          const r = shown.getBoundingClientRect();
          sparkle(document.body, r.left + r.width / 2, r.top + r.height / 2, ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff'], 16);
          close();
          done?.(name);
        }, 'done'))));
  draw();
  parent.append(box);
}
