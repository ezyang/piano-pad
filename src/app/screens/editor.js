import { h, flash } from '../dom.js';
import { getSong, save, getState, deleteSong } from '../store.js';
import { createTrack, glyphIcon, fitRowH } from '../track.js';
import { quantize } from '../music.js';
import { engine } from '../engine.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';
import { renderNote } from '../../synth.js';

const TOOLS = [
  { id: 'ta', notes: (p) => [{ d: 1, p }] },
  { id: 'ta-a', notes: (p) => [{ d: 2, p }] },
  { id: 'titi', notes: (p) => [{ d: 0.5, p }, { d: 0.5, p }] },
  { id: 'ta-a-a-a', notes: (p) => [{ d: 4, p }] },
  { id: 'rest', notes: () => [{ d: 1, p: null }] },
];

export function editor(root, id, extra) {
  const song = getSong(id);
  if (!song) { location.hash = '#/'; return; }
  // Homework is read-only for her (she can remix it); a grown-up edits it via
  // #/song/<id>/edit (⚙︎ menu, or the 🔒 button here).
  const grownup = song.by === 'teacher' && extra === 'edit';
  const readOnly = song.by === 'teacher' && !grownup;
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

  // Tapping empty space adds the selected tool's notes. Tapping a block
  // changes it in place (she didn't discover the length tools): on its own
  // row it grows (ti → ta → ta-a → whole → ta); on another row it moves there.
  const GROW = { 0.5: 1, 1: 2, 2: 4, 3: 4, 4: 1 };
  const onTap = ({ midi, index }) => {
    if (readOnly || writing) return;
    if (tool === 'erase') {
      if (index >= 0) edit(() => song.notes.splice(index, 1));
      return;
    }
    if (index < 0) {
      const notes = TOOLS.find((x) => x.id === tool).notes(midi);
      edit(() => song.notes.push(...notes), true);
      preview(notes[0].p);
      return;
    }
    const n = song.notes[index];
    const same = n.p != null && (n.p === midi || n.p - 1 === midi); // a sharp shares its natural's row
    edit(() => { song.notes[index] = same ? { ...n, d: GROW[n.d] ?? 1 } : { ...n, p: midi }; });
    preview(same ? n.p : midi);
  };

  const trackBox = h('div', { class: 'track-box' });
  function redraw(toEnd = false, toBeat = null) {
    const left = track?.el.querySelector('.track').scrollLeft ?? 0;
    // Zoom so the whole song fits without scrolling (she never scrolled),
    // down to a size that's still easy to tap.
    const rowH = fitRowH(song, innerHeight - 200, 80);
    const extraBeats = readOnly ? 0 : 2;
    const beats = Math.max(8, Math.ceil((song.notes.reduce((a, n) => a + n.d, 0) + extraBeats) / 4) * 4);
    const ppb = Math.max(44, Math.min(Math.round(rowH * 1.7), Math.floor((trackBox.clientWidth - 64 - 60) / beats)));
    track = createTrack(song, { onTap, extraBeats, rowH, ppb });
    trackBox.replaceChildren(track.el);
    const sc = track.el.querySelector('.track');
    sc.scrollLeft = left;
    if (toBeat != null) track.scrollToBeat(toBeat);
    else if (toEnd || writing) track.scrollToEnd();
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
    writing = { played: [], base: song.notes.length, tStart: engine.now() };
    log.startSession('write', { song: { id: song.id, title: song.title, by: song.by } });
    writing.off = engine.onNote((n) => {
      if (n.time < writing.tStart) return;
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
    const base = writing.base;
    writing.off();
    engine.listen(false);
    song.notes.splice(writing.base);
    if (keep && writing.played.length) {
      const q = quantize(writing.played);
      log.endSession({ kept: true, notes: q.notes, bpm: q.bpm });
      song.notes.push(...q.notes);
      if (writing.base === 0) song.bpm = Math.min(120, Math.max(50, q.bpm));
    } else if (!keep) history.pop();
    log.endSession({ kept: false });
    writing = null;
    save();
    writeBtn.textContent = '🎹 Play to write';
    writeBtn.classList.remove('recording');
    cancelBtn.style.display = 'none';
    root.querySelector('.screen').classList.remove('is-writing');
    // Show what was just written, from its start.
    redraw(false, song.notes.slice(0, base).reduce((a, n) => a + n.d, 0));
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

  // Clef: auto picks from the notes; the lesson book uses treble, bass, or both.
  const CLEFS = [['auto', 'Auto'], ['treble', '𝄞'], ['bass', '𝄢'], ['grand', '𝄞𝄢']];
  const clefBtn = h('button', {
    class: 'btn clef-btn', title: 'Clef',
    onclick: () => {
      const i = CLEFS.findIndex(([c]) => c === (song.clef ?? 'auto'));
      song.clef = CLEFS[(i + 1) % CLEFS.length][0];
      save();
      clefBtn.textContent = CLEFS.find(([c]) => c === song.clef)[1];
      redraw();
    },
  }, CLEFS.find(([c]) => c === (song.clef ?? 'auto'))[1]);

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
      readOnly ? h('a', { class: 'btn small faint', href: `#/song/${song.id}/edit`, title: 'Grown-ups: edit this homework' }, '🔒') : null,
      readOnly ? null : clefBtn,
      readOnly ? h('button', { class: 'btn', onclick: remix }, '🔀 Remix') : del,
      h('a', { class: 'btn', href: `#/band/${song.id}` }, '🎸 Band'),
      h('a', { class: 'btn primary big', href: `#/play/${song.id}` }, '▶ Play')),
    grownup ? h('div', { class: 'grownup-note' }, '📝 Editing homework. Easiest: tap 🎹 Play to write and play it on the piano, then fix blocks by tapping. Set the clef if needed.') : null,
    trackBox,
    readOnly
      ? h('div', { class: 'toolbar note' }, 'This is your teacher\'s song. Tap 🔀 Remix to make your own version!')
      : h('div', { class: 'toolbar' }, toolBtns, undoBtn, h('div', { class: 'spacer' }), cancelBtn, writeBtn),
    testKeyboard()));
  redraw();

  return () => { if (writing) stopWriting(true); };
}
