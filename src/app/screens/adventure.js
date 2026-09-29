// Today's adventure (see adventure.js): a map of the four stops, always in
// the same order, and the band she's gathering; plus the pieces and party.
//   #/adventure             the map
//   #/adventure/piece/<id>  a piece played the whole way (g | stairs | updown);
//                           after the G song the app plays it back in rhythm
//   #/adventure/party       her band plays a piece (Up and Down first), then
//                           free Build! or Copy me
// Pieces: the right letter moves on, anything else is a faint grey ghost (no
// red, no counts, no timeout); finger numbers and ✋ always. Look-ahead: the
// detector still misses about 1 note in 4, so the note after the expected
// one also counts, for both (the missed one is 'assumed'), and she keeps
// going forward instead of re-striking one key.
import { h, flash, sparkle } from '../dom.js';
import { getState } from '../store.js';
import { createStaff } from '../staff.js';
import { createBook } from '../book.js';
import { sameNote, outOfRange, totalBeats, layout } from '../music.js';
import { characterUrl, BAND, bandSprite, texture } from '../pixels.js';
import { engine } from '../engine.js';
import { renderBand, renderJingle } from '../instruments.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';
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

// The page for a piece, like her book: pre-staff notation for the C-position
// pieces, a treble staff for the G song; finger numbers only where printed.
export function bookPage(song, width, height) {
  return song.clef === 'grand'
    ? createBook(song, { width, height })
    : createStaff(song, { s: Math.max(14, Math.min(22, Math.round(width / 38))), letters: 'book', width, visible: 2 });
}

// --- a piece, played the whole way ---
// Feedback grain (⚙︎, st.feedback): 'note' (the next note glows, played ones
// turn green), 'bar' (the current bar is highlighted and turns done when
// she's played through it), 'piece' (nothing until the end). Notes still
// advance one at a time underneath, on the right letter in any octave; no
// look-ahead and no ghosts, since a missed note is better than a false
// advance now that a grown-up can step it on: a TWO-FINGER TAP (or → on a
// computer) advances one step at the current grain. The ✋ only shows how
// each hand starts, then hides.
function piece(root, id) {
  const a = adv.current();
  const song = PIECES[id], step = id;
  const grain = ['note', 'bar', 'piece'].includes(getState().feedback) ? getState().feedback : 'note';
  let session = null, finished = false, gen = 0, hearing = null;

  const pageBox = h('div', { class: 'staff-box book-box' });
  const overlay = h('div', { class: 'overlay', style: 'display:none' });
  const hand = createHand();
  const setupText = h('div', { class: 'adv-setup-text' });
  const setupBox = h('div', { class: 'adv-setup', style: 'display:none' }, hand.el, setupText);
  const stageEl = h('div', { class: 'stage adv-page' }, setupBox, pageBox, overlay);
  const screen = h('div', { class: 'screen play adv-homework' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, song.title)),
    stageEl,
    testKeyboard());
  root.append(screen);

  const page = bookPage(song, pageBox.clientWidth - 12, stageEl.clientHeight - 150);
  pageBox.replaceChildren(page.el);
  const t = page.targets;
  // Bars, as runs of target indices k.
  const barOf = t.map((i) => Math.floor(page.laid[i].start / 4 + 1e-9));
  const barSpan = (k) => { let k0 = k, k1 = k; while (k0 > 0 && barOf[k0 - 1] === barOf[k]) k0--; while (k1 + 1 < t.length && barOf[k1 + 1] === barOf[k]) k1++; return [k0, k1]; };
  let barRect = null;

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
    adv.startStep(step, { grain });
    session = { cur: 0, tStart: engine.now(), lo: Math.min(...t.map((i) => page.laid[i].p)), hi: Math.max(...t.map((i) => page.laid[i].p)), off: engine.onNote(onNote) };
    log.startSession('homework', { adventure: a.id, step, grain, song: { id: song.id, title: song.title, by: song.by, clef: song.clef, bpm: song.bpm, notes: song.notes } });
    showCurrent();
  }

  const want = (k) => page.laid[t[k]].p;
  // Where she is: the set-up hand at the start of each hand, and the note or
  // bar highlight for the grain.
  function showCurrent() {
    const k = session.cur;
    if (k >= t.length) { engine.expect?.(null); setupBox.style.display = 'none'; return; }
    engine.expect?.([want(k)]); // lets the detector favour the note she's about to play (piano-audio)
    const setup = song.setup?.find((x) => x.at === k);
    if (setup) {
      hand.show(setup.finger, setup.hand);
      setupText.textContent = setup.text;
      setupBox.style.display = '';
    }
    if (grain === 'note') { page.mark(t[k], 'current'); page.show(t[k]); }
    if (grain === 'bar' && (k === 0 || barOf[k] !== barOf[k - 1])) {
      const [k0, k1] = barSpan(k);
      barRect = page.span(t[k0], t[k1], 'bar-current');
      page.show(t[k0]);
    }
  }

  // One note done; by: 'detector' | 'grownup'.
  function advance(by, got) {
    const k = session.cur;
    log.event('judge', { k, want: want(k), ...(got != null ? { got } : {}), grade: 'hit', by });
    setupBox.style.display = 'none';
    if (grain === 'note') { page.mark(t[k], 'hit'); page.burst?.(t[k]); }
    session.cur++;
    if (grain === 'bar' && (session.cur >= t.length || barOf[session.cur] !== barOf[k])) {
      barRect?.setAttribute('class', 'bar-done');
      log.event('bar', { bar: barOf[k], by });
    }
    if (session.cur >= t.length) setTimeout(finish, 600);
    else showCurrent();
  }

  function onNote(n) {
    if (!session || n.time < session.tStart || session.cur >= t.length) return;
    if (n.voice || outOfRange(n.midi, session.lo, session.hi)) { log.event('judge', { got: n.midi, grade: 'ignored', ...(n.voice ? { why: 'voice' } : {}) }); return; }
    const k = session.cur;
    if (sameNote(n.midi, want(k), false)) advance('detector', n.midi);
    else log.event('judge', { k, want: want(k), got: n.midi, grade: 'other' });
  }

  // The grown-up's step: one note, the rest of the bar, or the whole piece.
  function grownupStep() {
    if (!session || session.cur >= t.length) return;
    const end = grain === 'note' ? session.cur + 1 : grain === 'bar' ? barSpan(session.cur)[1] + 1 : t.length;
    while (session && session.cur < end) advance('grownup');
  }
  const onTouch = (e) => { if (e.touches.length === 2) { e.preventDefault(); grownupStep(); } };
  const onKey = (e) => { if (e.key === 'ArrowRight') grownupStep(); };
  stageEl.addEventListener('touchstart', onTouch, { passive: false });
  addEventListener('keydown', onKey);

  function finish() {
    if (!session) return;
    session.off();
    session = null;
    finished = true;
    setupBox.style.display = 'none';
    engine.expect?.(null);
    engine.listen(false);
    log.endSession({ completed: true });
    adv.finishStep(step, { grain });
    for (const i of t) page.mark(i, 'hit');
    engine.play(renderJingle(engine.ctx.sampleRate));
    const r = pageBox.getBoundingClientRect();
    for (let j = 0; j < 4; j++) setTimeout(() => sparkle(pageBox, r.width * (0.2 + 0.6 * Math.random()), r.height * (0.15 + 0.5 * Math.random()), ['#ffd84a', '#ff8fb3', '#55e0d6', '#5fc24a'], 16), j * 180);
    // The G song is heard back in rhythm; then (after Stairs, right away) the
    // map asks who joins the band.
    const toMap = () => { if (screen.isConnected) location.hash = '#/adventure'; };
    if (step === 'g') {
      // Skippable: it's a long listen after she's already played it.
      const skip = h('button', { class: 'btn primary big adv-skip', onclick: () => { adv.note('skip', { step }); toMap(); } }, 'Skip ⏭️');
      stageEl.append(skip);
      setTimeout(() => hear(toMap), 900);
      return;
    }
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
    const beatSec = 60 / song.bpm, laid = page.laid;
    const end = startTime + lead + totalBeats(song.notes) * beatSec + 0.5;
    let last = -1;
    const tick = () => {
      if (!screen.isConnected) return;
      const beat = (engine.now() - startTime - lead) / beatSec;
      const idx = laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
      if (idx >= 0 && idx !== last) {
        if (last >= 0) page.mark(last, 'hit');
        last = idx;
        page.mark(idx, 'current');
        page.show(idx);
      }
      if (engine.now() > end) { if (last >= 0) page.mark(last, 'hit'); hearing = null; then(); return; }
      hearing = requestAnimationFrame(tick);
    };
    tick();
  }

  begin();
  return () => {
    gen++;
    removeEventListener('keydown', onKey);
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
  const staffBox = h('div', { class: 'staff-box book-box' });
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
    staff = bookPage(song, staffBox.clientWidth - 12, innerHeight * 0.42);
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
