// Today's adventure (see adventure.js): a map of the four stops, always in
// the same order, and the band she's gathering; plus the pieces and party.
//   #/adventure             the map
//   #/adventure/piece/<id>  a piece played the whole way (g | stairs | updown);
//                           after the G song the app plays it back in rhythm
//   #/adventure/party       her band plays a piece (Up and Down first), then
//                           free Build! or Copy me
// Pieces: the right letter moves on, anything else is a faint grey ghost (no
// red, no counts, no timeout); finger numbers and ✋ always.
import { h, flash, sparkle } from '../dom.js';
import { getState } from '../store.js';
import { createStaff, systemHeight } from '../staff.js';
import { createBuild } from '../build.js';
import { sameNote, outOfRange, totalBeats, layout } from '../music.js';
import { characterUrl, BAND, bandSprite, texture } from '../pixels.js';
import { engine } from '../engine.js';
import { renderBand, renderJingle } from '../instruments.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';
import { fingerFor, handFor } from '../labels.js';
import { createHand } from '../hand.js';
import { PIECES } from '../homework.js';
import * as adv from '../adventure.js';

const member = (id) => BAND.find((m) => m.id === id);
const spriteOf = (id) => (id === 'piano' ? characterUrl(getState().character) : bandSprite(member(id)));

const STOPS = { g: ['🎵', 'G song'], stairs: ['🪜', 'Stairs'], updown: ['⛰️', 'Up and Down'], party: ['🎉', 'Party!'] };

export function adventure(root, sub, id) {
  const a = adv.current();
  if (sub === 'piece' && PIECES[id] && adv.unlocked(a, id)) return piece(root, id);
  if (sub === 'party' && adv.unlocked(a, 'party')) return party(root);
  if (sub) { location.replace('#/adventure'); return; }
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

// Her, her two picks (mysteries until she picks), the headliner.
function lineup(a, big = false) {
  const picked = a.band.filter((id) => adv.PICKS.includes(id));
  const slots = [['piano', true], [picked[0], !!picked[0]], [picked[1], !!picked[1]], [adv.HEADLINER, a.band.includes(adv.HEADLINER)]];
  return h('div', { class: 'adv-band' + (big ? ' big' : '') }, slots.map(([id, here]) => h('div', { class: 'member' },
    id ? h('img', { class: 'member-sprite' + (here ? '' : ' locked'), src: spriteOf(id) }) : h('div', { class: 'member-sprite adv-mystery' }, '?'),
    h('div', { class: 'member-name' }, here ? member(id).name : id === adv.HEADLINER ? '⭐' : '?'),
    h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }))));
}

// After the G song and after Stairs: "Who joins your band?" — tap one.
function choosePick(parent, a, then) {
  const box = h('div', { class: 'overlay adv-welcome' },
    h('div', { class: 'joined' }, 'Who joins your band?'),
    h('div', { class: 'adv-picks' }, adv.pickable(a).map((id) => h('button', {
      class: 'adv-pick', onclick: () => { adv.pick(id); box.remove(); then(); },
    }, h('img', { class: 'adv-welcome-sprite', src: spriteOf(id) }), h('div', { class: 'member-name' }, member(id).name)))));
  parent.append(box);
  box.querySelectorAll('.adv-pick img').forEach((img, i) => setTimeout(() => flash(img, 'hop', 350), 200 + i * 180));
}

// --- the map ---
function map(root) {
  const a = adv.current();
  const next = adv.nextStep(a);
  const stop = (step) => {
    const [icon, label] = STOPS[step];
    const locked = !adv.unlocked(a, step), done = a.done.has(step);
    const el = h('button', {
      class: 'adv-stop' + (done ? ' done' : '') + (step === next ? ' next' : '') + (locked ? ' locked' : ''),
      onclick: () => {
        if (locked) flash(el, 'shake', 400);
        else location.hash = step === 'party' ? '#/adventure/party' : `#/adventure/piece/${step}`;
      },
    }, h('div', { class: 'adv-icon' }, locked ? '🔒' : icon), h('div', { class: 'adv-label' }, label),
      done ? h('div', { class: 'adv-check' }, '✅') : null);
    return el;
  };

  const screen = h('div', { class: 'screen adventure' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'song-title' }, 'Today’s adventure')),
    h('div', { class: 'adv-path' }, adv.STEPS.flatMap((step, i) => [i ? h('div', { class: 'adv-link' }) : null, stop(step)])),
    lineup(a, true),
    h('div', { class: 'ground', style: `background-image:url(${texture('grass')})` }));
  root.append(screen);
  const greet = () => {
    if (!a.joined) return;
    const id = a.joined;
    a.joined = null;
    // Redraw the lineup with the newcomer, then welcome them.
    screen.querySelector('.adv-band').replaceWith(lineup(a, true));
    setTimeout(() => screen.isConnected && welcome(screen, id), 300);
  };
  if (adv.pickPending(a)) setTimeout(() => screen.isConnected && choosePick(screen, a, greet), 300);
  else greet();
}

// --- a piece, played the whole way ---
function piece(root, id) {
  const a = adv.current();
  const song = PIECES[id], step = id;
  let session = null, finished = false, gen = 0, hearing = null;

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
    const H = systemHeight(s, song.clef, 'fingers');
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
    adv.startStep(step);
    const t = staff.targets;
    session = {
      cur: 0, tStart: engine.now(),
      lo: Math.min(...t.map((i) => staff.laid[i].p)), hi: Math.max(...t.map((i) => staff.laid[i].p)),
      off: engine.onNote(onNote),
    };
    log.startSession('homework', { adventure: a.id, step, song: { id: song.id, title: song.title, by: song.by, clef: song.clef, bpm: song.bpm, notes: song.notes } });
    markCurrent();
  }

  const want = (k) => staff.laid[staff.targets[k]].p;
  function markCurrent() {
    const i = staff.targets[session.cur];
    if (i == null) { hand.show(null); engine.expect?.(null); return; }
    const { p: m, f } = staff.laid[i];
    engine.expect?.([m]); // lets the detector favour the note she's about to play (piano-audio)
    hand.show(f ?? fingerFor(m), handFor(m) ?? 'right');
    staff.mark(i, 'current');
    staff.show(i);
  }

  // The right letter (any octave, forgiving detector octave slips) moves on,
  // like Learn mode: finishing takes playing it, not mashing. Anything else
  // is a faint grey ghost, except low notes, where adult speech lands
  // (~B2-F#3, see piano-audio): those are silently skipped. A speech-like
  // reading of the expected letter still counts (as the detector does for
  // expect()ed notes): a miss costs her far more than a rare false accept.
  function onNote(n) {
    if (!session || n.time < session.tStart) return;
    const k = session.cur, t = staff.targets;
    if (k >= t.length) return;
    const ok = sameNote(n.midi, want(k), false);
    if ((n.voice && !ok) || outOfRange(n.midi, session.lo, session.hi)) { log.event('judge', { got: n.midi, grade: 'ignored', ...(n.voice ? { why: 'voice' } : {}) }); return; }
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
    engine.expect?.(null);
    engine.listen(false);
    log.endSession({ completed: true });
    adv.finishStep(step);
    build.celebrate();
    // The G song is heard back in rhythm; then (after Stairs, right away) the
    // map asks who joins the band.
    const toMap = () => { if (screen.isConnected) location.hash = '#/adventure'; };
    if (step === 'g') { setTimeout(() => hear(toMap), 900); return; }
    if (step !== 'updown') { setTimeout(toMap, 1800); return; }
    const joined = a.joined;
    a.joined = null;
    setTimeout(() => {
      if (!screen.isConnected) return;
      const go = h('a', { class: 'btn primary huge', href: '#/adventure/party' }, '🎉 Party!');
      if (joined) welcome(stageEl, joined, go);
      else { overlay.replaceChildren(go); overlay.style.display = ''; }
    }, 900);
  }

  // Play the piece on the piano at its tempo, lighting each note.
  async function hear(then) {
    if (!screen.isConnected) return;
    await engine.start();
    const { audio, lead } = renderBand(song, ['piano'], engine.ctx.sampleRate);
    const { startTime } = engine.play(audio);
    const beatSec = 60 / song.bpm, laid = layout(song.notes);
    const end = startTime + lead + totalBeats(song.notes) * beatSec + 0.5;
    let last = -1;
    const tick = () => {
      if (!screen.isConnected) return;
      const beat = (engine.now() - startTime - lead) / beatSec;
      const idx = laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
      if (idx >= 0 && idx !== last) {
        if (last >= 0) staff.mark(last, 'hit');
        last = idx;
        staff.mark(idx, 'current');
        staff.show(idx);
      }
      if (engine.now() > end) { if (last >= 0) staff.mark(last, 'hit'); hearing = null; then(); return; }
      hearing = requestAnimationFrame(tick);
    };
    tick();
  }

  begin();
  return () => {
    gen++;
    if (hearing) { cancelAnimationFrame(hearing); engine.stopAll(); }
    if (session) { session.off(); session = null; log.endSession({ aborted: true }); }
    if (!finished) adv.quitStep(step);
    engine.expect?.(null);
    engine.listen(false);
  };
}

// --- party: her band plays a piece with her (Up and Down first; the piece
// buttons pick another) ---
function party(root) {
  const a = adv.current();
  let song = PIECES.updown;
  const ids = a.band;
  let playing = null, raf = 0, played = false;

  const imgs = ids.map((id) => h('img', { class: 'member-sprite', src: spriteOf(id) }));
  const staffBox = h('div', { class: 'staff-box' });
  const playBtn = h('button', { class: 'btn primary huge', onclick: () => (playing ? stop() : start()) }, '▶');
  const pieceBtns = ['g', 'stairs', 'updown'].map((pid) => h('button', {
    class: 'btn big' + (PIECES[pid] === song ? ' on' : ''), 'data-piece': pid, title: STOPS[pid][1],
    onclick: () => { if (playing) stop(); song = PIECES[pid]; drawStaff(); start(); },
  }, STOPS[pid][0]));
  const scene = h('div', { class: 'band-stage' }, ids.map((id, i) => h('div', { class: 'member' },
    imgs[i], h('div', { class: 'member-name' }, member(id).name),
    h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }))));
  root.append(h('div', { class: 'screen band adv-party' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, '🎉 Party!')),
    scene,
    h('div', { class: 'row center' }, pieceBtns, playBtn),
    h('div', { class: 'row center' }, h('a', { class: 'btn big', href: '#/world' }, '⛏️ Build!'), h('a', { class: 'btn big', href: '#/echo' }, '🐸 Copy me!')),
    staffBox));
  let staff;
  function drawStaff() {
    for (const b of pieceBtns) b.classList.toggle('on', PIECES[b.dataset.piece] === song);
    const s = Math.max(12, Math.min(18, Math.round(innerHeight / 48)));
    const H = systemHeight(s, song.clef, 'fingers');
    staff = createStaff(song, { s, letters: 'fingers', width: staffBox.clientWidth - 6, visible: innerHeight > 900 && 2 * H < innerHeight * 0.45 ? 2 : 1 });
    staffBox.replaceChildren(staff.el);
  }
  drawStaff();

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
      if (!played) { played = true; adv.finishStep('party', { piece: song.id }); }
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
