// Today's adventure (see adventure.js): a map of three stops and the band
// she's gathering, plus the homework and party steps. The warm-up runs in
// the Build! and Copy me screens (#/world/adventure, #/echo/adventure).
//   #/adventure           the map
//   #/adventure/homework  the whole piece; the right letter moves on, anything
//                         else is a faint grey ghost (no red, no counts, no
//                         timeout); finger numbers and ✋ always
//   #/adventure/party     her band plays the piece with her, then free Build!
import { h, flash, sparkle } from '../dom.js';
import { getState } from '../store.js';
import { createStaff, systemHeight } from '../staff.js';
import { createBuild } from '../build.js';
import { sameNote, outOfRange, totalBeats } from '../music.js';
import { characterUrl, BAND, bandSprite, texture } from '../pixels.js';
import { engine } from '../engine.js';
import { renderBand, renderJingle } from '../instruments.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';
import { fingerFor, handFor } from '../labels.js';
import { createHand } from '../hand.js';
import { HOMEWORK } from '../homework.js';
import * as adv from '../adventure.js';

const member = (id) => BAND.find((m) => m.id === id);
const spriteOf = (id) => (id === 'piano' ? characterUrl(getState().character) : bandSprite(member(id)));
// Who she can gather, in lineup order.
const LINEUP = ['piano', adv.JOINS.warmup, adv.JOINS.homework];

export function adventure(root, sub) {
  if (sub === 'homework') return homework(root);
  if (sub === 'party') return party(root);
  return map(root);
}

// Welcome a band member who just joined: big sprite, a jingle, tap to close.
function welcome(parent, id, then) {
  const m = member(id);
  const img = h('img', { class: 'adv-welcome-sprite', src: spriteOf(id) });
  const box = h('div', { class: 'overlay adv-welcome' }, h('div', { class: 'joined' }, img, h('div', {}, `${m.name} joined the band!`)), then ?? null);
  if (!then) box.addEventListener('click', () => box.remove());
  parent.append(box);
  const bounce = setInterval(() => (box.isConnected ? flash(img, 'hop', 350) : clearInterval(bounce)), 700);
  flash(img, 'hop', 350);
  if (engine.ctx) engine.play(renderJingle(engine.ctx.sampleRate));
  const r = parent.getBoundingClientRect();
  for (let i = 0; i < 4; i++) setTimeout(() => sparkle(box, r.width * (0.25 + 0.5 * Math.random()), r.height * (0.2 + 0.4 * Math.random()), ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff'], 16), i * 200);
  if (!then) setTimeout(() => box.remove(), 3500);
}

function lineup(a, big = false) {
  return h('div', { class: 'adv-band' + (big ? ' big' : '') }, LINEUP.map((id) => {
    const here = a.band.includes(id);
    return h('div', { class: 'member' },
      h('img', { class: 'member-sprite' + (here ? '' : ' locked'), src: spriteOf(id) }),
      h('div', { class: 'member-name' }, here ? member(id).name : id === adv.JOINS.homework ? '⭐' : '?'),
      h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }));
  }));
}

// --- the map ---
function map(root) {
  const a = adv.current();
  const done = (s) => a.done.has(s);
  const next = !done('warmup') ? 'warmup' : !done('homework') ? 'homework' : 'party';
  const overlayBox = h('div', {});

  const stop = (step, icon, label, onclick, locked = false) => {
    const el = h('button', {
      class: 'adv-stop' + (done(step) ? ' done' : '') + (step === next ? ' next' : '') + (locked ? ' locked' : ''),
      onclick: () => (locked ? flash(el, 'shake', 400) : onclick()),
    }, h('div', { class: 'adv-icon' }, locked ? '🔒' : icon), h('div', { class: 'adv-label' }, label),
      done(step) ? h('div', { class: 'adv-check' }, '✅') : null);
    return el;
  };

  function chooseWarmup() {
    const mountain = h('div', { class: 'bp-mini' }, [60, 62, 64, 65, 67, 65, 64, 62, 60].map((p, i) =>
      h('span', { style: `height:${(Math.min(i, 8 - i) + 1) * 8}px;background:#8fd463` })));
    const box = h('div', { class: 'overlay', onclick: (e) => { if (e.target === box) box.remove(); } },
      h('div', { class: 'adv-choice' },
        h('a', { class: 'card world-card', href: '#/world/adventure', style: `background-image:url(${texture('grass')})` },
          h('div', { class: 'plus' }, '⛏️'), mountain, h('div', { class: 'card-title' }, 'Build!')),
        h('a', { class: 'card world-card', href: '#/echo/adventure', style: 'background:linear-gradient(#27366e,#5a4fa3)' },
          h('img', { class: 'exp-sprite', src: bandSprite(member('frog')) }), h('div', { class: 'card-title' }, 'Copy me!'))));
    overlayBox.replaceChildren(box);
  }

  const screen = h('div', { class: 'screen adventure' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'song-title' }, 'Today’s adventure')),
    h('div', { class: 'adv-path' },
      stop('warmup', '🌅', 'Warm up', chooseWarmup),
      h('div', { class: 'adv-link' }),
      stop('homework', '📝', 'Homework', () => { location.hash = '#/adventure/homework'; }),
      h('div', { class: 'adv-link' }),
      stop('party', '🎉', 'Party!', () => { location.hash = '#/adventure/party'; }, !done('homework'))),
    lineup(a, true),
    overlayBox,
    h('div', { class: 'ground', style: `background-image:url(${texture('grass')})` }));
  root.append(screen);
  if (a.joined) {
    const id = a.joined;
    a.joined = null;
    setTimeout(() => screen.isConnected && welcome(screen, id), 300);
  }
}

// --- homework: the whole piece ---
function homework(root) {
  const a = adv.current();
  const song = HOMEWORK;
  let session = null, finished = false, gen = 0;

  const sceneBox = h('div', { class: 'scene-box' });
  const staffBox = h('div', { class: 'staff-box' });
  const overlay = h('div', { class: 'overlay', style: 'display:none' });
  const hand = createHand();
  hand.show(null);
  const stageEl = h('div', { class: 'stage' }, sceneBox, staffBox, overlay, h('div', { class: 'hand-box' }, hand.el));
  const screen = h('div', { class: 'screen play adv-homework' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, song.title)),
    stageEl,
    testKeyboard());
  root.append(screen);

  let staff, build;
  function rebuild() {
    const s = Math.max(12, Math.min(22, Math.round(innerHeight / 52)));
    const H = systemHeight(s, 'grand', 'fingers');
    const avail = stageEl.clientHeight - 150 - 10;
    staff = createStaff(song, { s, letters: 'fingers', width: staffBox.clientWidth - 6, visible: avail >= 2 * H ? 2 : 1 });
    staffBox.replaceChildren(staff.el);
    build = createBuild(staff.targets.length, characterUrl(getState().character), 2);
    sceneBox.replaceChildren(build.el);
  }
  rebuild();

  function showStart() {
    overlay.replaceChildren(h('button', { class: 'btn primary huge', onclick: begin }, '▶ Start'));
    overlay.style.display = '';
  }

  async function begin() {
    const myGen = ++gen;
    overlay.style.display = 'none';
    try {
      const ok = await Promise.race([engine.listen(true).then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))]);
      if (myGen !== gen) return;
      if (!ok || engine.ctx.state !== 'running') { showStart(); return; }
    } catch (err) {
      overlay.replaceChildren(h('div', { class: 'panel' }, 'I need the microphone to hear the piano! 🎤', h('br'), String(err.message ?? err)),
        h('button', { class: 'btn primary', onclick: begin }, 'Try again'));
      overlay.style.display = '';
      return;
    }
    if (myGen !== gen) return;
    adv.startStep('homework');
    const t = staff.targets;
    session = {
      cur: 0, tStart: engine.now(),
      lo: Math.min(...t.map((i) => staff.laid[i].p)), hi: Math.max(...t.map((i) => staff.laid[i].p)),
      off: engine.onNote(onNote),
    };
    log.startSession('homework', { adventure: a.id, song: { id: song.id, title: song.title, by: song.by, clef: song.clef, bpm: song.bpm, notes: song.notes } });
    markCurrent();
  }

  const want = (k) => staff.laid[staff.targets[k]].p;
  function markCurrent() {
    const i = staff.targets[session.cur];
    if (i == null) { hand.show(null); return; }
    const m = staff.laid[i].p;
    hand.show(fingerFor(m), handFor(m) ?? 'right');
    staff.mark(i, 'current');
    staff.show(i);
  }

  // The right letter (any octave, forgiving detector octave slips) moves on,
  // like Learn mode: finishing takes playing it, not mashing. Anything else
  // is a faint grey ghost, except low notes, where adult speech lands
  // (~B2-F#3, see piano-audio): those are silently skipped.
  function onNote(n) {
    if (!session || n.time < session.tStart) return;
    if (n.voice || outOfRange(n.midi, session.lo, session.hi)) { log.event('judge', { got: n.midi, grade: 'ignored', ...(n.voice ? { why: 'voice' } : {}) }); return; }
    const k = session.cur, t = staff.targets;
    if (k >= t.length) return;
    const ok = sameNote(n.midi, want(k), false);
    log.event('judge', { k, want: want(k), got: n.midi, grade: ok ? 'hit' : 'other' });
    if (!ok) {
      if (n.midi >= 57) staff.ghost(t[k], n.midi);
      return;
    }
    staff.mark(t[k], 'hit');
    staff.burst(t[k]);
    build.place(k, want(k));
    session.cur++;
    if (session.cur >= t.length) setTimeout(finish, 600);
    else markCurrent();
  }

  function finish() {
    if (!session) return;
    session.off();
    session = null;
    finished = true;
    hand.show(null);
    engine.listen(false);
    log.endSession({ completed: true });
    adv.finishStep('homework');
    build.celebrate();
    const id = a.joined;
    a.joined = null;
    setTimeout(() => {
      if (!screen.isConnected) return;
      const go = h('a', { class: 'btn primary huge', href: '#/adventure/party' }, '🎉 Party!');
      if (id) welcome(stageEl, id, go);
      else { overlay.replaceChildren(go); overlay.style.display = ''; }
    }, 900);
  }

  begin();
  return () => {
    gen++;
    if (session) { session.off(); session = null; log.endSession({ aborted: true }); }
    if (!finished) adv.quitStep('homework');
    engine.listen(false);
  };
}

// --- party: her band plays the homework with her ---
function party(root) {
  const a = adv.current();
  if (!a.done.has('homework')) { location.hash = '#/adventure'; return; }
  const song = HOMEWORK;
  const ids = LINEUP.filter((id) => a.band.includes(id));
  let playing = null, raf = 0, played = false;

  const imgs = ids.map((id) => h('img', { class: 'member-sprite', src: spriteOf(id) }));
  const staffBox = h('div', { class: 'staff-box' });
  const playBtn = h('button', { class: 'btn primary huge', onclick: () => (playing ? stop() : start()) }, '▶');
  const scene = h('div', { class: 'band-stage' }, ids.map((id, i) => h('div', { class: 'member' },
    imgs[i], h('div', { class: 'member-name' }, member(id).name),
    h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }))));
  root.append(h('div', { class: 'screen band adv-party' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, '🎉 Party!')),
    scene,
    h('div', { class: 'row center' }, playBtn, h('a', { class: 'btn big', href: '#/world' }, '⛏️ Build!')),
    staffBox));
  const s = Math.max(12, Math.min(18, Math.round(innerHeight / 48)));
  const H = systemHeight(s, 'grand', 'fingers');
  const staff = createStaff(song, { s, letters: 'fingers', width: staffBox.clientWidth - 6, visible: innerHeight > 900 && 2 * H < innerHeight * 0.45 ? 2 : 1 });
  staffBox.replaceChildren(staff.el);

  async function start() {
    await engine.start();
    const { audio, lead } = renderBand(song, ids.map((id) => member(id).instrument), engine.ctx.sampleRate);
    const { startTime } = engine.play(audio);
    const beatSec = 60 / song.bpm;
    playing = { t0: startTime + lead, beatSec, end: startTime + lead + totalBeats(song.notes) * beatSec + 0.3, last: -1, lastBeat: -1 };
    playBtn.textContent = '⏹️';
    loop();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const beat = (engine.now() - playing.t0) / playing.beatSec;
    const idx = staff.laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
    if (idx !== playing.last && idx >= 0) {
      if (playing.last >= 0) staff.mark(playing.last, '');
      playing.last = idx;
      staff.mark(idx, 'current');
      staff.show(idx);
      ids.forEach((id, i) => { if (member(id).instrument !== 'drums') flash(imgs[i], 'hop', 300); });
    }
    const whole = Math.floor(beat);
    if (whole !== playing.lastBeat && beat >= 0) {
      playing.lastBeat = whole;
      ids.forEach((id, i) => { if (member(id).instrument === 'drums') flash(imgs[i], 'hop', 250); });
    }
    if (engine.now() > playing.end) {
      stop();
      if (!played) { played = true; adv.finishStep('party'); }
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    engine.stopAll();
    if (playing.last >= 0) staff.mark(playing.last, '');
    playing = null;
    playBtn.textContent = '▶';
  }

  adv.startStep('party', { band: ids });
  setTimeout(() => { if (staffBox.isConnected) start(); }, 500);
  return () => {
    if (playing) stop();
    if (!played) adv.quitStep('party');
  };
}
