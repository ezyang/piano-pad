// Today's adventure (see adventure.js): a map of the four stops, always in
// the same order, and the band she's gathering; plus the pieces and party.
//   #/adventure             the map
//   #/adventure/piece/<id>  a piece played the whole way (see piece())
//   #/adventure/party       her band plays a piece (this week's last first),
//                           then free Build! or Copy me
import { h, flash, sparkle } from '../dom.js';
import { getState } from '../store.js';
import { createStaff, systemHeight } from '../staff.js';
import { createBook } from '../book.js';
import { sameNote, outOfRange, totalBeats, layout } from '../music.js';
import { barRhythm, missedNote } from '../scoring.js';
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

const STOPS = {
  zebra: ['🦓', 'Zebra'], train: ['🚂', 'Train'], ode: ['🎶', 'Ode'], party: ['🎉', 'Party!'],
  g: ['🎵', 'G song'], stairs: ['🪜', 'Stairs'], updown: ['⛰️', 'Up and Down'], // earlier homework (party only)
};
const PARTY = ['zebra', 'train', 'ode', 'g', 'stairs', 'updown'];

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

// After each picking piece: "Who joins your band?" — tap one.
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
// pieces (book.js), a real staff for staff pieces (key signature, repeat,
// finger numbers above as printed). Rhythm pieces show their rhythm words
// under the notes. labels (⚙︎ Homework labels) takes scaffolding away:
// 'book' as printed; 'letters' letters (under a staff; in the heads of
// pre-staff) and a finger number only on each hand's first note; 'first'
// only each hand's first note labelled.
export function bookPage(song, width, height, labels = 'book') {
  if (song.clef === 'grand') return createBook(song, { width, height, labels });
  const firsts = new Set((song.setup ?? []).map((x) => x.at));
  const rows = [...(song.rhythm ? ['rhythm'] : []), ...(labels === 'letters' ? ['letters'] : [])];
  const size = Math.max(14, Math.min(22, Math.round(width / 38)));
  const letters = rows.length ? rows : 'none';
  return createStaff(song, {
    // The whole page at once when it fits, like the book.
    s: size, width, visible: Math.max(2, Math.floor((height - 20) / systemHeight(size, song.clef, letters))),
    letters,
    fingersAbove: labels === 'book' ? true : (i) => (firsts.has(i) ? song.notes[i].f ?? null : null),
  });
}

// --- a piece, played the whole way ---
// She plays the page's notes in order (twice through, if it has a repeat
// sign). A note counts on the right letter in any octave; no look-ahead, no
// ghosts, since a missed note is better than a false advance now that a
// grown-up can step it on: a TWO-FINGER TAP (or → on a computer) advances
// one step. The ✋ only shows how the hands start (a set-up banner), then
// hides.
//   Melody pieces follow the feedback grain (⚙︎ st.feedback): 'note' (the
//   next note glows, played ones turn green), 'bar' (the current bar is
//   highlighted and turns done), 'piece' (nothing until the end).
//   Rhythm pieces (`rhythm`: Zebra) go bar by bar: a bar passes when its
//   rhythm is roughly right at her own tempo (scoring.js barRhythm) and, if
//   `pitched`, every note was the right one. A bar's last note is timed by
//   the next bar's first, so a bar is judged as the next one starts. An off
//   bar: the band plays it with its rhythm words lit, and she tries again.
//   A note the detector missed never counts against her: if the next note
//   she plays is the one after it (a different letter), or the timing shows
//   one interval spanning two notes (scoring.js missedNote), the bar passes
//   as 'unheard'.
function piece(root, id) {
  const a = adv.current();
  const song = PIECES[id], step = id, st = getState();
  const rhythm = !!song.rhythm;
  const grain = rhythm ? 'bar' : ['note', 'bar', 'piece'].includes(st.feedback) ? st.feedback : 'note';
  const labels = ['book', 'letters', 'first'].includes(st.bookLabels) ? st.bookLabels : 'book';
  let session = null, finished = false, gen = 0;

  const pageBox = h('div', { class: 'staff-box book-box' });
  const overlay = h('div', { class: 'overlay', style: 'display:none' });
  const setupHands = h('div', { class: 'adv-setup-hands' });
  const setupText = h('div', { class: 'adv-setup-text' });
  const setupBox = h('div', { class: 'adv-setup', style: 'display:none' }, setupHands, setupText);
  const passLabel = h('span', { class: 'adv-pass' });
  const stageEl = h('div', { class: 'stage adv-page' }, setupBox, pageBox, overlay);
  const screen = h('div', { class: 'screen play adv-homework' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, song.title), passLabel),
    stageEl,
    testKeyboard());
  root.append(screen);

  const page = bookPage(song, pageBox.clientWidth - 12, stageEl.clientHeight - 150, labels);
  pageBox.replaceChildren(page.el);
  // The notes in the order she plays them: { i: note on the page, p, d, bar, pass }.
  const pageBars = Math.ceil(totalBeats(song.notes) / 4);
  const seq = [];
  for (let pass = 0; pass < (song.repeat ? 2 : 1); pass++) {
    for (const i of page.targets) { const n = page.laid[i]; seq.push({ i, p: n.p, d: n.d, pass, bar: pass * pageBars + Math.floor(n.start / 4 + 1e-9) }); }
  }
  const N = seq.length;
  const barKs = [];
  seq.forEach((x, k) => (barKs[x.bar] ??= []).push(k));
  const bars = barKs.filter(Boolean); // runs of k, one per bar
  const barIndexOf = [];
  bars.forEach((ks, b) => { for (const k of ks) barIndexOf[k] = b; });
  const want = (k) => seq[k].p;
  let barRect = null, doneRects = [];

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
    adv.startStep(step, { grain, labels });
    const ps = seq.map((x) => x.p);
    session = { cur: 0, tStart: engine.now(), lo: Math.min(...ps), hi: Math.max(...ps), off: engine.onNote(onNote) };
    log.startSession('homework', { adventure: a.id, step, grain, labels, ...(rhythm ? { rhythm: true, pitched: !!song.pitched } : {}), ...(song.repeat ? { repeat: true } : {}),
      song: { id: song.id, title: song.title, by: song.by, clef: song.clef, bpm: song.bpm, notes: song.notes } });
    showCurrent();
  }

  // The hands' set-up (from the piece's `setup`, first time through only).
  function showSetup(k) {
    const setup = seq[k].pass === 0 ? song.setup?.find((x) => x.at === k) : null;
    if (!setup) return;
    setupHands.replaceChildren(...(setup.hands ?? [setup]).map(({ hand, finger }) => { const hd = createHand(); hd.show(finger, hand); return hd.el; }));
    setupText.textContent = setup.text;
    setupBox.style.display = '';
  }
  const hideSetup = () => { setupBox.style.display = 'none'; };

  // Where she is: the set-up, and the note or bar highlight for the grain.
  function showCurrent() {
    const k = session.cur;
    if (k >= N) { engine.expect?.(null); hideSetup(); return; }
    engine.expect?.([want(k)]); // labels the detector's readings of the expected note (piano-audio)
    if (k > 0 && seq[k].pass !== seq[k - 1].pass) secondTime();
    showSetup(k);
    if (grain === 'note') { page.mark(seq[k].i, 'current'); page.show(seq[k].i); }
    if (grain === 'bar' && (k === 0 || seq[k].bar !== seq[k - 1].bar)) {
      const ks = bars[barIndexOf[k]];
      barRect = page.span(seq[ks[0]].i, seq[ks.at(-1)].i, 'bar-current');
      page.show(seq[ks[0]].i);
    }
  }
  // Back to the top for the repeat: clear the page's marks.
  function secondTime() {
    for (const r of doneRects) r.remove();
    doneRects = [];
    for (const i of page.targets) page.mark(i, '');
    passLabel.textContent = '2nd time';
    flash(passLabel, 'pop', 400);
  }
  function barDone() {
    if (!barRect) return;
    barRect.setAttribute('class', 'bar-done');
    doneRects.push(barRect);
    barRect = null;
  }

  // --- melody pieces: one note at a time; by: 'detector' | 'grownup' ---
  function advance(by, got) {
    const k = session.cur;
    log.event('judge', { k, want: want(k), ...(got != null ? { got } : {}), grade: 'hit', by });
    hideSetup();
    if (grain === 'note') page.mark(seq[k].i, 'hit');
    session.cur++;
    if (grain === 'bar' && (session.cur >= N || seq[session.cur].bar !== seq[k].bar)) { barDone(); log.event('bar', { bar: seq[k].bar, by }); }
    if (session.cur >= N) setTimeout(finish, 600);
    else showCurrent();
  }

  function onNote(n) {
    if (!session || n.time < session.tStart || session.cur >= N) return;
    if (n.voice || outOfRange(n.midi, session.lo, session.hi)) { log.event('judge', { got: n.midi, grade: 'ignored', ...(n.voice ? { why: 'voice' } : {}) }); return; }
    if (rhythm) return onRhythmNote(n);
    const k = session.cur;
    if (sameNote(n.midi, want(k), false)) advance('detector', n.midi);
    else log.event('judge', { k, want: want(k), got: n.midi, grade: 'other' });
  }

  // --- rhythm pieces, bar by bar ---
  // entries: onset times for this bar's notes and on into the next bar
  // (null: a note she played that the detector missed).
  let entries = [], wrong = false, quietUntil = 0, modelRaf = 0, endTimer = 0;
  const barStart = () => bars[barIndexOf[session.cur]][0];
  function onRhythmNote(n) {
    if (n.time < quietUntil) return; // the band's model, or just before
    const k = barStart() + entries.length;
    if (k >= N) return;
    const is = (kk) => kk < N && sameNote(n.midi, want(kk), false);
    if (is(k)) entries.push(n.time);
    else if (song.pitched && is(k + 1) && !sameNote(want(k + 1), want(k), false)) entries.push(null, n.time); // k went unheard
    else {
      log.event('judge', { k, want: want(k), got: n.midi, grade: 'other' });
      if (song.pitched) wrong = true;
      return;
    }
    hideSetup();
    log.event('judge', { k: barStart() + entries.length - 1, want: want(barStart() + entries.length - 1), got: n.midi, grade: 'hit', by: 'detector' });
    judgeIfReady();
  }
  function judgeIfReady() {
    const bi = barIndexOf[session.cur], ks = bars[bi], m = ks.length, last = bi === bars.length - 1;
    clearTimeout(endTimer);
    if (last && entries.length === m - 1 && !wrong) {
      // One short at the very end: likely a note not heard; don't leave her waiting.
      endTimer = setTimeout(() => { if (session && barIndexOf[session.cur] === bi && entries.length === m - 1) { log.event('bar', { bar: seq[ks[0]].bar, ok: true, why: 'unheard-end', by: 'detector' }); passBar([]); } }, 3000);
    }
    const need = last ? m : m + 1;
    if (entries.length < need) return;
    const bar = seq[ks[0]].bar, win = entries.slice(0, need);
    if (wrong) { log.event('bar', { bar, ok: false, why: 'wrong-note', by: 'detector' }); model(); return; }
    const gap = win.indexOf(null);
    if (gap >= 0) { log.event('bar', { bar, ok: true, why: 'unheard', unheard: ks[0] + gap, by: 'detector' }); passBar(entries.slice(m)); return; }
    const iois = win.slice(1).map((x, j) => x - win[j]);
    const ms = iois.map((x) => Math.round(x * 1000));
    const d = (kk) => (kk != null && kk < N ? seq[kk].d : null);
    if (!last) {
      const next = bars[bi + 1];
      const j = missedNote([...ks.map(d), d(next[0]), d(next[1]) ?? d(bars[bi + 2]?.[0])], iois);
      if (j != null) {
        log.event('bar', { bar, iois: ms, ok: true, why: 'unheard', unheard: ks[0] + j + 1, by: 'detector' });
        // Line the next bar up: the last onset was its second note.
        const first = j < m - 1 ? win[m - 1] : win[m - 1] + iois[m - 1] * d(ks[m - 1]) / (d(ks[m - 1]) + d(next[0]));
        passBar([first, win[m], ...entries.slice(need)]);
        return;
      }
    }
    const r = barRhythm(ks.slice(0, iois.length).map(d), iois);
    log.event('bar', { bar, iois: ms, ok: r.ok, ...(r.why ? { why: r.why } : {}), by: 'detector' });
    if (r.ok) passBar(entries.slice(m));
    else model();
  }
  // carry: onsets already played in the next bar (the one that timed this
  // bar's last note is also the next bar's first).
  function passBar(carry) {
    clearTimeout(endTimer);
    barDone();
    const bi = barIndexOf[session.cur];
    entries = [...carry];
    wrong = false;
    if (bi + 1 >= bars.length) { session.cur = N; setTimeout(finish, 600); return; }
    session.cur = bars[bi + 1][0];
    showCurrent();
    if (entries.length) judgeIfReady();
  }
  // The band plays the bar (at the piece's tempo), its words lit in time;
  // then she plays it again.
  function model() {
    entries = [];
    wrong = false;
    const ks = bars[barIndexOf[session.cur]];
    log.event('model', { bar: seq[ks[0]].bar });
    const notes = ks.map((k) => ({ d: seq[k].d, p: want(k) }));
    const { audio, lead } = renderBand({ notes, bpm: song.bpm }, a.band.map((m) => member(m).instrument), engine.ctx.sampleRate);
    const { startTime } = engine.play(audio);
    const beatSec = 60 / song.bpm, laid = layout(notes);
    const end = startTime + lead + totalBeats(notes) * beatSec;
    quietUntil = end + 0.3;
    let lit = -1;
    const tick = () => {
      if (!session) return;
      const beat = (engine.now() - startTime - lead) / beatSec;
      const j = laid.findIndex((x) => beat >= x.start && beat < x.start + x.d);
      if (j !== lit) {
        if (lit >= 0) page.mark(seq[ks[lit]].i, '');
        if (j >= 0) page.mark(seq[ks[j]].i, 'current');
        lit = j;
      }
      if (engine.now() > end) { if (lit >= 0) page.mark(seq[ks[lit]].i, ''); modelRaf = 0; return; }
      modelRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  // The grown-up's step: a bar (rhythm pieces), or one note / the rest of
  // the bar / the whole piece at the grain.
  function grownupStep() {
    if (!session || session.cur >= N) return;
    hideSetup();
    if (rhythm) {
      if (modelRaf) { cancelAnimationFrame(modelRaf); modelRaf = 0; engine.stopAll(); quietUntil = 0; }
      log.event('bar', { bar: seq[session.cur].bar, ok: true, by: 'grownup' });
      passBar([]);
      return;
    }
    const end = grain === 'note' ? session.cur + 1 : grain === 'bar' ? bars[barIndexOf[session.cur]].at(-1) + 1 : N;
    while (session && session.cur < end) advance('grownup');
  }
  // ...and back: to the start of the bar she's partway through, else the
  // step before (one note / the bar before / the top at the piece grain).
  // The page is redrawn up to there.
  function grownupBack() {
    if (!session || session.cur >= N) return;
    const k = session.cur, bi = barIndexOf[k];
    let to;
    if (rhythm) {
      if (modelRaf) { cancelAnimationFrame(modelRaf); modelRaf = 0; engine.stopAll(); quietUntil = 0; }
      clearTimeout(endTimer);
      to = entries.length ? bars[bi][0] : bars[Math.max(0, bi - 1)][0];
      entries = [];
      wrong = false;
    } else to = grain === 'note' ? Math.max(0, k - 1) : grain === 'bar' ? (k > bars[bi][0] ? bars[bi][0] : bars[Math.max(0, bi - 1)][0]) : 0;
    log.event('back', { from: k, to, by: 'grownup' });
    hideSetup();
    if (barRect) barRect.remove();
    barRect = null;
    for (const r of doneRects) r.remove();
    doneRects = [];
    for (const i of page.targets) page.mark(i, '');
    const pass = seq[to].pass;
    passLabel.textContent = pass ? '2nd time' : '';
    if (grain === 'note') for (let j = 0; j < to; j++) { if (seq[j].pass === pass) page.mark(seq[j].i, 'hit'); }
    else if (grain === 'bar') {
      for (let b = 0; b < barIndexOf[to]; b++) {
        const ks = bars[b];
        if (seq[ks[0]].pass === pass) doneRects.push(page.span(seq[ks[0]].i, seq[ks.at(-1)].i, 'bar-done'));
      }
    }
    session.cur = to;
    showCurrent();
  }
  // Two-finger tap: on; two-finger swipe right: back.
  let swipe = null;
  const xs = (e) => [...e.touches].reduce((s, t) => s + t.clientX, 0) / e.touches.length;
  const onTouch = (e) => { if (e.touches.length === 2) { e.preventDefault(); swipe = { x0: xs(e), x: xs(e) }; } };
  const onMove = (e) => { if (swipe && e.touches.length === 2) swipe.x = xs(e); };
  const onEnd = () => {
    if (!swipe) return;
    const dx = swipe.x - swipe.x0;
    swipe = null;
    if (dx > 60) grownupBack(); else if (dx > -60) grownupStep();
  };
  const onKey = (e) => { if (e.key === 'ArrowRight') grownupStep(); else if (e.key === 'ArrowLeft') grownupBack(); };
  stageEl.addEventListener('touchstart', onTouch, { passive: false });
  stageEl.addEventListener('touchmove', onMove);
  stageEl.addEventListener('touchend', onEnd);
  stageEl.addEventListener('touchcancel', () => { swipe = null; });
  addEventListener('keydown', onKey);

  function finish() {
    if (!session) return;
    session.off();
    session = null;
    finished = true;
    hideSetup();
    engine.expect?.(null);
    engine.listen(false);
    log.endSession({ completed: true });
    adv.finishStep(step, { grain, labels });
    for (const i of page.targets) page.mark(i, 'hit');
    engine.play(renderJingle(engine.ctx.sampleRate));
    const r = pageBox.getBoundingClientRect();
    for (let j = 0; j < 4; j++) setTimeout(() => sparkle(pageBox, r.width * (0.2 + 0.6 * Math.random()), r.height * (0.15 + 0.5 * Math.random()), ['#ffd84a', '#ff8fb3', '#55e0d6', '#5fc24a'], 16), j * 180);
    // The headliner's piece opens the party; the others go back to the map,
    // which asks who joins the band.
    const joined = a.joined;
    a.joined = null;
    if (!joined) { setTimeout(() => { if (screen.isConnected) location.hash = '#/adventure'; }, 1800); return; }
    setTimeout(() => {
      if (screen.isConnected) welcome(stageEl, joined, h('a', { class: 'btn primary huge', href: '#/adventure/party' }, '🎉 Party!'));
    }, 900);
  }

  begin();
  return () => {
    gen++;
    removeEventListener('keydown', onKey);
    clearTimeout(endTimer);
    if (modelRaf) { cancelAnimationFrame(modelRaf); engine.stopAll(); }
    if (session) { session.off(); session = null; log.endSession({ aborted: true }); }
    if (!finished) adv.quitStep(step);
    engine.expect?.(null);
    engine.listen(false);
  };
}

// --- party: her band plays a piece with her (this week's last piece
// first; the piece buttons pick another) ---
function party(root) {
  const a = adv.current();
  let song = PIECES[adv.STEPS.at(-2)];
  const ids = a.band;
  let playing = null, raf = 0, played = false;

  const imgs = ids.map((id) => h('img', { class: 'member-sprite', src: spriteOf(id) }));
  const staffBox = h('div', { class: 'staff-box book-box' });
  const playBtn = h('button', { class: 'btn primary huge', onclick: () => (playing ? stop() : start()) }, '▶');
  const pieceBtns = PARTY.map((pid) => h('button', {
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
