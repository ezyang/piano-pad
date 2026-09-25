import { h, flash } from '../dom.js';
import { getSong, save, getState, deleteSong } from '../store.js';
import { createTrack, glyphIcon, fitRowH } from '../track.js';
import { quantize } from '../music.js';
import { engine } from '../engine.js';
import { testKeyboard } from '../keyboard.js';
import { renderNote } from '../../synth.js';

const TOOLS = [
  { id: 'ta', notes: (p) => [{ d: 1, p }] },
  { id: 'ta-a', notes: (p) => [{ d: 2, p }] },
  { id: 'titi', notes: (p) => [{ d: 0.5, p }, { d: 0.5, p }] },
  { id: 'ta-a-a-a', notes: (p) => [{ d: 4, p }] },
  { id: 'rest', notes: () => [{ d: 1, p: null }] },
];

export function editor(root, id) {
  const song = getSong(id);
  if (!song) { location.hash = '#/'; return; }
  const readOnly = song.by === 'teacher';
  let tool = 'ta';
  const history = [];
  let track;
  let writing = null; // {played: [], off}

  const edit = (fn, toEnd = false) => {
    history.push(JSON.stringify(song.notes));
    if (history.length > 100) history.shift();
    fn();
    save();
    redraw(toEnd);
  };

  const preview = async (p) => {
    if (p == null || writing) return;
    await engine.start();
    const sr = engine.ctx.sampleRate;
    const a = new Float32Array(Math.round(0.8 * sr));
    renderNote(a, 0, { midi: p, vel: 0.6, dur: 0.35 }, sr, Math.random);
    engine.play(a);
  };

  const onTap = ({ midi, index }) => {
    if (readOnly || writing) return;
    const t = TOOLS.find((x) => x.id === tool);
    if (tool === 'erase') {
      if (index >= 0) edit(() => song.notes.splice(index, 1));
      return;
    }
    const notes = t.notes(midi);
    if (index < 0) edit(() => song.notes.push(...notes), true);
    else edit(() => song.notes.splice(index, 1, ...notes));
    preview(notes[0].p);
  };

  const trackBox = h('div', { class: 'track-box' });
  function redraw(toEnd = false) {
    const left = track?.el.querySelector('.track').scrollLeft ?? 0;
    track = createTrack(song, { onTap, extraBeats: readOnly ? 0 : 4, rowH: fitRowH(song, innerHeight - 200, 80) });
    trackBox.replaceChildren(track.el);
    const sc = track.el.querySelector('.track');
    sc.scrollLeft = left;
    if (toEnd || writing) track.scrollToEnd();
    undoBtn.disabled = !history.length;
  }

  const toolBtns = [...TOOLS.map((t) => t.id), 'erase'].map((tid) => {
    const b = h('button', {
      class: 'tool' + (tid === tool ? ' on' : ''), 'data-tool': tid,
      onclick: () => { tool = tid; for (const x of toolBtns) x.classList.toggle('on', x.dataset.tool === tid); },
    }, tid === 'erase' ? h('span', { class: 'erase-icon' }, '⛏') : glyphIcon(tid));
    return b;
  });
  const undoBtn = h('button', {
    class: 'tool', onclick: () => {
      if (!history.length) return;
      song.notes = JSON.parse(history.pop());
      save();
      redraw();
    },
  }, h('span', { class: 'erase-icon' }, '↶'));

  // Write by playing: every note she plays becomes a block.
  const writeBtn = h('button', { class: 'btn write', onclick: () => (writing ? stopWriting(true) : startWriting()) }, '🎹 Play to write');
  const cancelBtn = h('button', { class: 'btn', style: 'display:none', onclick: () => stopWriting(false) }, '✕');
  async function startWriting() {
    try { await engine.listen(true); } catch { flash(writeBtn, 'shake'); return; }
    history.push(JSON.stringify(song.notes));
    writing = { played: [], base: song.notes.length };
    writing.off = engine.onNote((n) => {
      writing.played.push(n);
      song.notes.push({ d: 1, p: n.midi }); // placeholder rhythm until done
      redraw();
      flash(track.blocks[track.blocks.length - 1], 'pop');
    });
    writeBtn.textContent = '✓ Done';
    writeBtn.classList.add('recording');
    cancelBtn.style.display = '';
    root.querySelector('.screen').classList.add('is-writing');
  }
  function stopWriting(keep) {
    writing.off();
    engine.listen(false);
    song.notes.splice(writing.base);
    if (keep && writing.played.length) {
      const q = quantize(writing.played);
      song.notes.push(...q.notes);
      if (writing.base === 0) song.bpm = Math.min(120, Math.max(50, q.bpm));
    } else if (!keep) history.pop();
    writing = null;
    save();
    writeBtn.textContent = '🎹 Play to write';
    writeBtn.classList.remove('recording');
    cancelBtn.style.display = 'none';
    root.querySelector('.screen').classList.remove('is-writing');
    redraw(true);
  }

  const title = h('input', {
    class: 'title-input', value: song.title, readonly: readOnly || null,
    onchange: (e) => { song.title = e.target.value || song.title; save(); },
  });

  const remix = () => {
    const copy = { ...structuredClone(song), id: 's' + Date.now().toString(36), title: song.title.replace(/^Homework: /, '') + ' Remix', by: 'me', band: 1, plays: 0 };
    getState().songs.push(copy);
    save();
    location.hash = `#/song/${copy.id}`;
  };

  let delArmed = false;
  const del = h('button', {
    class: 'btn small danger', onclick: () => {
      if (!delArmed) { delArmed = true; del.textContent = 'Really?'; return; }
      deleteSong(song.id);
      location.hash = '#/';
    },
  }, '🗑');

  root.append(h('div', { class: 'screen editor' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      title,
      h('div', { class: 'spacer' }),
      readOnly ? h('button', { class: 'btn', onclick: remix }, '🔀 Remix') : del,
      h('a', { class: 'btn', href: `#/band/${song.id}` }, '🎸 Band'),
      h('a', { class: 'btn primary big', href: `#/play/${song.id}` }, '▶ Play')),
    trackBox,
    readOnly
      ? h('div', { class: 'toolbar note' }, 'This is your teacher\'s song. Tap 🔀 Remix to make your own version!')
      : h('div', { class: 'toolbar' }, toolBtns, undoBtn, h('div', { class: 'spacer' }), cancelBtn, writeBtn),
    testKeyboard()));
  redraw();

  return () => { if (writing) stopWriting(true); };
}
