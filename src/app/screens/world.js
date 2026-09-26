// "Build by playing": every note she plays drops a column of that note's
// blocks, as tall as the note is high (C = 1 block ... high C = 8), so the
// shape of a melody becomes the shape of a building. The notes also appear on
// a staff below.
//
// Free build: anything goes; 💾 saves it as a song (rhythm from her timing).
// Blueprints: ghost outlines (stairs, a mountain, her songs, 🎲 surprises)
// filled by playing their notes in order, like Learn mode with the melody's
// contour drawn as a building.
import { h, flash, sparkle } from '../dom.js';
import { getState, save, newSong } from '../store.js';
import { createStaff } from '../staff.js';
import { BIOMES } from '../build.js';
import { material, texture, characterUrl } from '../pixels.js';
import { pitchClass, quantize, layout } from '../music.js';
import { engine } from '../engine.js';
import { renderBand } from '../instruments.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';

const NAT = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
// Height in blocks: C..B = 1..7 in any octave (octave slips in detection
// shouldn't wreck the shape), high C (C5 and up) = 8.
export const heightOf = (m) => (pitchClass(m) === 0 && m >= 72 ? 8 : NAT[pitchClass(m)] + 1);

const MIDI = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71, C5: 72 };
const shape = (s) => s.split(' ').map((x) => MIDI[x]);
const BLUEPRINTS = [
  { id: 'stairs', notes: shape('C D E F G A B C5') },
  { id: 'mountain', notes: shape('C D E F G F E D C') },
  { id: 'homework', notes: shape('C D E F G G G G F E D C C C') },
  { id: 'valley', notes: shape('G F E D C D E F G') },
  { id: 'castle', notes: shape('G C C G C C G') },
  { id: 'hills', notes: shape('C E C E G E C') },
];
const SKY_ICON = { day: '☀️', sunset: '🌅', night: '🌙', snow: '❄️', desert: '🏜️' };
const GROUND = 36;
const MAX_FREE = 40;

// A new little melody every time: a walk around C..G, mostly steps.
function surprise() {
  const pool = [60, 62, 64, 65, 67];
  let i = Math.floor(Math.random() * pool.length);
  const out = [pool[i]];
  const len = 6 + Math.floor(Math.random() * 4);
  while (out.length < len) {
    const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
    i = Math.max(0, Math.min(pool.length - 1, i + step));
    out.push(pool[i]);
  }
  return out;
}

export function world(root) {
  const st = getState();
  let sky = BIOMES.findIndex((b) => b.name === st.worldSky);
  if (sky < 0) sky = 2; // she likes the night sky
  // mode: { kind: 'free' } | { kind: 'blueprint', id, notes, cur }
  let mode = { kind: 'free' };
  let cols = []; // free build: [{ midi, time }]
  let quietUntil = 0; // ignore the mic while the app itself is making sound
  let playing = null;
  let listenerOff = null;
  let clearArmed = false;

  // --- world scene ---
  const colsEl = h('div', { class: 'w-cols' });
  const ghostsEl = h('div', { class: 'w-cols' });
  const charImg = h('img', { src: characterUrl(st.character) });
  const climber = h('div', { class: 'climber' }, charImg);
  const decoEl = h('div', { class: 'w-deco' });
  const groundEl = h('div', { class: 'build-ground' });
  const worldEl = h('div', { class: 'build world-scene' }, decoEl, ghostsEl, colsEl, climber, groundEl);
  const staffBox = h('div', { class: 'staff-box' });

  function setSky(i) {
    sky = (i + BIOMES.length) % BIOMES.length;
    const b = BIOMES[sky];
    st.worldSky = b.name;
    save();
    worldEl.style.background = b.sky;
    groundEl.style.backgroundImage = `url(${texture(b.ground)})`;
    decoEl.replaceChildren(...(b.stars
      ? [h('div', { class: 'moon' }), ...Array.from({ length: 30 }, (_, k) => h('div', { class: 'star-px', style: `left:${(k * 37) % 97}%;top:${(k * 53) % 60 + 3}%` }))]
      : [h('div', { class: 'cloud c1' }), h('div', { class: 'cloud c2' })]));
    skyBtn.textContent = SKY_ICON[b.name];
  }

  // What's built so far (notes), and what the outline asks for.
  const built = () => (mode.kind === 'free' ? cols.map((c) => c.midi) : mode.notes.slice(0, mode.cur));
  const planned = () => (mode.kind === 'free' ? [] : mode.notes);

  let B = 40, x0 = 0;
  function draw() {
    const n = mode.kind === 'free' ? Math.max(12, cols.length + 1) : mode.notes.length;
    const W = worldEl.clientWidth, H = worldEl.clientHeight - GROUND;
    B = Math.max(10, Math.min(64, Math.floor((W * 0.92) / n), Math.floor((H - 10) / (8 + 1.6))));
    x0 = Math.round((W - n * B) / 2);
    const column = (m, i, cls) => h('div', {
      class: 'w-col ' + cls,
      style: `left:${x0 + i * B}px;width:${B}px;height:${heightOf(m) * B}px;background-image:url(${material(m).url});background-size:${B}px ${B}px`,
    });
    colsEl.replaceChildren(...built().map((m, i) => column(m, i, 'solid')));
    ghostsEl.replaceChildren(...planned().map((m, i) => (i < mode.cur ? null : column(m, i, 'ghost' + (i === mode.cur ? ' next' : '')))).filter(Boolean));
    placeChar(false);
  }
  function placeChar(hop = true) {
    const b = built();
    const chh = Math.round(B * 1.4);
    const i = b.length - 1;
    const x = i < 0 ? x0 - B * 1.5 : x0 + i * B;
    const top = worldEl.clientHeight - GROUND - (i < 0 ? 0 : heightOf(b[i]) * B) - chh + 2;
    charImg.style.height = `${chh}px`;
    climber.style.transform = `translate(${x}px, ${top}px)`;
    if (hop) flash(charImg, 'hop', 350);
  }
  new ResizeObserver(() => { draw(); drawStaff(); }).observe(worldEl);

  // --- staff under the world ---
  let staff = null;
  function drawStaff() {
    if (staffBox.clientWidth < 100) return; // not laid out yet
    const notes = mode.kind === 'free' ? cols.map((c) => ({ d: 1, p: c.midi })) : mode.notes.map((p) => ({ d: 1, p }));
    const song = { notes: notes.length ? notes : [{ d: 1, p: null }] };
    const letters = st.showLetters !== false;
    const s = Math.max(12, Math.min(20, Math.round(innerHeight / 46)));
    staff = createStaff(song, { s, letters, width: staffBox.clientWidth - 6, visible: 1 });
    staffBox.replaceChildren(staff.el);
    if (mode.kind === 'blueprint') {
      for (let k = 0; k < mode.cur; k++) staff.mark(k, 'hit');
      if (mode.cur < mode.notes.length) { staff.mark(mode.cur, 'current'); staff.show(mode.cur); }
    } else if (cols.length) staff.show(cols.length - 1);
  }

  // --- playing ---
  function onNote(n) {
    if (playing || n.time < quietUntil) return;
    if (mode.kind === 'free') {
      cols.push({ midi: n.midi, time: n.time });
      if (cols.length > MAX_FREE) cols.shift();
      log.event('build', { midi: n.midi, height: heightOf(n.midi) });
      draw();
      drawStaff();
      const el = colsEl.lastElementChild;
      if (el) { flash(el, 'drop', 300); sparkle(worldEl, el.offsetLeft + B / 2, el.offsetTop + B / 2, [material(n.midi).color, '#ffffff'], 8); }
      placeChar();
      staff?.burst(cols.length - 1);
      return;
    }
    const want = mode.notes[mode.cur];
    if (want == null) return;
    const ok = pitchClass(n.midi) === pitchClass(want);
    log.event('judge', { k: mode.cur, want, got: n.midi, grade: ok ? 'hit' : 'wrong' });
    if (!ok) {
      staff?.ghost(mode.cur, n.midi);
      flash(ghostsEl.querySelector('.next') ?? ghostsEl, 'shake', 400);
      return;
    }
    mode.cur++;
    draw();
    drawStaff();
    const el = colsEl.lastElementChild;
    if (el) { flash(el, 'drop', 300); sparkle(worldEl, el.offsetLeft + B / 2, el.offsetTop + B / 2, [material(want).color, '#ffffff'], 8); }
    placeChar();
    staff?.burst(mode.cur - 1);
    if (mode.cur >= mode.notes.length) finishBlueprint();
  }

  function finishBlueprint() {
    log.endSession({ completed: true, blueprint: mode.id });
    const r = worldEl.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      setTimeout(() => sparkle(worldEl, r.width * (0.15 + 0.7 * Math.random()), r.height * (0.1 + 0.4 * Math.random()),
        ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff', '#5fc24a'], 16), i * 160);
    }
    // Play back what she built (mic ignored meanwhile), then offer more.
    setTimeout(() => hear(), 700);
  }

  // Hear what's built: her timing for free builds, even beats for blueprints.
  async function hear() {
    const notes = built();
    if (!notes.length || playing) return;
    await engine.start();
    let song;
    if (mode.kind === 'free') {
      const q = quantize(cols.map((c) => ({ time: c.time, midi: c.midi })));
      song = { notes: q.notes, bpm: q.bpm };
    } else song = { notes: notes.map((p) => ({ d: 1, p })), bpm: 110 };
    const { audio, lead } = renderBand(song, ['piano'], engine.ctx.sampleRate);
    const { startTime } = engine.play(audio);
    const laid = layout(song.notes);
    const beatSec = 60 / song.bpm;
    const end = startTime + audio.length / engine.ctx.sampleRate;
    playing = { raf: 0, last: -1 };
    quietUntil = end + 0.3;
    hearBtn.textContent = '⏹️';
    const tick = () => {
      if (!playing) return;
      const beat = (engine.now() - startTime - lead) / beatSec;
      const idx = laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
      if (idx >= 0 && idx !== playing.last) {
        playing.last = idx;
        const el = colsEl.children[idx];
        if (el) flash(el, 'pop', 300);
      }
      if (engine.now() > end) return stopHearing();
      playing.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopHearing() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing = null;
    engine.stopAll();
    quietUntil = engine.now() + 0.3;
    hearBtn.textContent = '▶';
  }

  function startMode(next) {
    log.endSession({ aborted: true });
    stopHearing();
    mode = next;
    if (next.kind === 'free') cols = [];
    log.startSession('build', { mode: next.kind, blueprint: next.id, song: next.notes ? { notes: next.notes.map((p) => ({ d: 1, p })) } : undefined });
    for (const b of bpBtns) b.classList.toggle('on', b.dataset.id === (next.id ?? 'free'));
    saveBtn.style.visibility = next.kind === 'free' ? '' : 'hidden';
    draw();
    drawStaff();
  }

  function saveAsSong() {
    if (cols.length < 2) return;
    const q = quantize(cols.map((c) => ({ time: c.time, midi: c.midi })));
    const song = newSong('me');
    song.title = song.title.replace('My Song', 'My Build');
    song.notes = q.notes;
    song.bpm = Math.min(120, Math.max(50, q.bpm));
    save();
    log.endSession({ saved: song.id, columns: cols.length });
    location.hash = `#/song/${song.id}`;
  }

  // --- controls ---
  const skyBtn = h('button', { class: 'btn', title: 'Sky', onclick: () => setSky(sky + 1) });
  const hearBtn = h('button', { class: 'btn', title: 'Hear it', onclick: () => (playing ? stopHearing() : hear()) }, '▶');
  const saveBtn = h('button', { class: 'btn', title: 'Save as a song', onclick: saveAsSong }, '💾');
  const clearBtn = h('button', {
    class: 'btn', title: 'Start over',
    onclick: () => {
      if (!clearArmed) { clearArmed = true; clearBtn.classList.add('armed'); setTimeout(() => { clearArmed = false; clearBtn.classList.remove('armed'); }, 2500); return; }
      clearArmed = false;
      clearBtn.classList.remove('armed');
      startMode(mode.kind === 'free' ? { kind: 'free' } : { ...mode, cur: 0 });
    },
  }, '🧹');

  // Blueprint buttons show their silhouette (no reading needed).
  const mini = (notes) => h('div', { class: 'bp-mini' },
    notes.slice(0, 16).map((m) => h('span', { style: `height:${heightOf(m) * 4}px;background:${material(m).color}` })));
  const songBps = st.songs.filter((s) => s.notes.some((n) => n.p != null)).slice(-4)
    .map((s) => ({ id: 'song:' + s.id, notes: s.notes.filter((n) => n.p != null).map((n) => n.p).slice(0, 24) }));
  const bpBtns = [
    h('button', { class: 'bp on', 'data-id': 'free', title: 'Free build', onclick: () => startMode({ kind: 'free' }) }, h('span', { class: 'bp-icon' }, '⛏️')),
    ...[...BLUEPRINTS, ...songBps].map((bp) => h('button', {
      class: 'bp', 'data-id': bp.id, onclick: () => startMode({ kind: 'blueprint', id: bp.id, notes: bp.notes, cur: 0 }),
    }, mini(bp.notes))),
    h('button', { class: 'bp', 'data-id': 'surprise', title: 'Surprise!', onclick: () => startMode({ kind: 'blueprint', id: 'surprise', notes: surprise(), cur: 0 }) },
      h('span', { class: 'bp-icon' }, '🎲')),
  ];

  const overlay = h('div', { class: 'overlay', style: 'display:none' });
  root.append(h('div', { class: 'screen world' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      skyBtn,
      h('div', { class: 'spacer' }),
      hearBtn, saveBtn, clearBtn),
    h('div', { class: 'bp-bar' }, bpBtns),
    h('div', { class: 'stage' }, worldEl, staffBox, overlay),
    testKeyboard()));
  setSky(sky);
  startMode({ kind: 'free' });
  listen();

  async function listen() {
    const ok = await Promise.race([engine.listen(true).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 1500))]);
    if (!ok || engine.ctx.state !== 'running') {
      overlay.replaceChildren(h('button', { class: 'btn primary huge', onclick: () => { overlay.style.display = 'none'; listen(); } }, '▶ Start'));
      overlay.style.display = '';
      return;
    }
    listenerOff?.();
    listenerOff = engine.onNote(onNote);
  }

  return () => {
    stopHearing();
    listenerOff?.();
    log.endSession({ aborted: true, columns: built().length });
    engine.listen(false);
  };
}
