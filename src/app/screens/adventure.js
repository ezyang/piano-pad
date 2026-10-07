// Today's adventure (see adventure.js): a map of the four stops, always in
// the same order, and the band she's gathering; plus the pieces and party.
//   #/adventure             the map
//   #/adventure/piece/<id>  a piece played the whole way (see piece())
//   #/adventure/party       her band plays a piece (this week's last first),
//                           then free Build! or Copy me
import { h, flash, sparkle } from '../dom.js';
import { getState, meUrl } from '../store.js';
import { createStaff, systemHeight, roomBelow } from '../staff.js';
import { createBook } from '../book.js';
import { sameNote, outOfRange, totalBeats, layout } from '../music.js';
import { barRhythm, missedNote } from '../scoring.js';
import { bandMember, bandSprite, texture, pieceGem, jewelStyle } from '../pixels.js';
import { engine } from '../engine.js';
import { renderBand, renderJingle, renderYay, renderDrumroll } from '../instruments.js';
import { bandAudio } from '../band-render.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';
import { createHand } from '../hand.js';
import { PIECES } from '../homework.js';
import * as adv from '../adventure.js';
import { jewelTurn, gem, PAIR } from '../jewels.js';

const member = bandMember;
const spriteOf = (id) => (id === 'piano' ? meUrl() : bandSprite(member(id)));
// A band member's sprite (hers is her character, as she drew it).
const memberImg = (a, id, cls = 'member-sprite') => h('img', { class: cls, src: spriteOf(id) });

const STOPS = {
  zebra: ['🦓', 'Zebra'], sea: ['🌊', 'Sea'], ode: ['🎶', 'Ode'], party: ['🎉', 'Party!'],
  train: ['🚂', 'Train'], g: ['🎵', 'G song'], stairs: ['🪜', 'Stairs'], updown: ['⛰️', 'Up and Down'], // earlier homework (party only)
};
const PARTY = ['zebra', 'sea', 'ode', 'train', 'g', 'stairs', 'updown'];
// The jewel a piece earns: its gem (homework.js `gem`, pixels.js pieceGem).
const jewelOf = (id) => pieceGem(PIECES[id], Object.keys(PIECES).indexOf(id));

export function adventure(root, sub, id) {
  const a = adv.current();
  if (sub === 'piece' && PIECES[id] && adv.unlocked(a, id)) return piece(root, id);
  if (sub === 'party' && adv.unlocked(a, 'party')) return party(root);
  if (sub) { location.replace('#/adventure'); return; }
  return map(root);
}

// Welcome a band member who just joined: big sprite, a jingle, tap to close.
// The headliner (a surprise guest, adventure.js GUESTS) comes as a reveal
// first: "Who's coming?" over a wiggling ⭐ box and a drum roll, then the
// guest pops in (after REVEAL_MS, or sooner if she taps), says hello on its
// instrument, and `then` (the Party button) appears.
const REVEAL_MS = 1800;
function welcome(parent, id, then) {
  if (!adv.GUESTS.includes(id)) return greetMember(parent, h('div', { class: 'overlay adv-welcome' }), id, then);
  const box = h('div', { class: 'overlay adv-welcome adv-reveal' },
    h('div', { class: 'joined' }, 'Who’s coming?'),
    h('div', { class: 'adv-surprise' }, '⭐'));
  parent.append(box);
  const roll = engine.ctx ? engine.play(renderDrumroll(engine.ctx.sampleRate, REVEAL_MS / 1000)) : null;
  let shown = false;
  const go = (early) => {
    if (shown || !box.isConnected) return;
    shown = true;
    if (early === true && roll) try { roll.source.stop(); } catch { /* ended */ }
    box.classList.remove('adv-reveal');
    box.replaceChildren();
    greetMember(parent, box, id, then);
  };
  box.addEventListener('pointerdown', () => go(true), { once: true });
  setTimeout(go, REVEAL_MS);
}
// The guest's hello on its own instrument: C E G C, up.
const HELLO = [60, 64, 67, 72].map((p, i) => ({ p, d: i < 3 ? 0.5 : 1.5 }));

function greetMember(parent, box, id, then) {
  const m = member(id), guest = adv.GUESTS.includes(id);
  const img = h('img', { class: 'adv-welcome-sprite' + (guest ? ' adv-guest-in' : ''), src: spriteOf(id) });
  box.append(h('div', { class: 'joined' }, img,
    h('div', {}, guest ? `${m.name} is here!` : `${m.name} joined the band!`),
    guest && m.hi ? h('div', { class: 'adv-hi' }, m.hi) : null));
  if (then) box.append(then);
  if (!then) box.addEventListener('click', () => box.remove());
  if (!box.isConnected) parent.append(box);
  const bounce = setInterval(() => (box.isConnected ? flash(img, 'hop', 350) : clearInterval(bounce)), 700);
  if (!guest) flash(img, 'hop', 350); // a guest pops in (CSS adv-guest-in) instead
  if (engine.ctx) {
    const sr = engine.ctx.sampleRate;
    if (!guest) engine.play(renderJingle(sr));
    else {
      engine.play(renderYay(sr));
      setTimeout(() => box.isConnected && engine.play(renderBand({ notes: HELLO, bpm: 150 }, [m.instrument], sr).audio), 400);
    }
  }
  const r = parent.getBoundingClientRect();
  for (let i = 0; i < (guest ? 7 : 4); i++) setTimeout(() => sparkle(box, r.width * (0.25 + 0.5 * Math.random()), r.height * (0.2 + 0.4 * Math.random()), ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff'], 16), i * 200);
  if (!then) setTimeout(() => box.remove(), guest ? 4000 : 3500);
}

// Her, her two picks (mysteries until she picks), the headliner.
function lineup(a, big = false) {
  const picked = a.band.filter((id) => adv.PICKS.includes(id));
  // The guest stays a ⭐ box (no silhouette) until it joins.
  const slots = [['piano', true], [picked[0], !!picked[0]], [picked[1], !!picked[1]], [a.guest, a.band.includes(a.guest)]];
  return h('div', { class: 'adv-band' + (big ? ' big' : '') }, slots.map(([id, here]) => h('div', { class: 'member' },
    here ? memberImg(a, id) : id === a.guest ? h('div', { class: 'member-sprite adv-mystery adv-star' }, '⭐') : h('div', { class: 'member-sprite adv-mystery' }, '?'),
    h('div', { class: 'member-name' }, here ? member(id).name : '?'),
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

// A pair of a piece's gems (what a turn earns).
const pair = (m) => Array.from({ length: PAIR }, () => gem(m));
// The jewels a piece earns, in its colour: a dashed ring with the pair
// until she has them, then the jewels themselves (×2, ×3 ... for more
// turns), with "🔁 ➜ 💎💎": playing it again earns another pair.
function jewelBadge(a, step, cls = '') {
  const n = adv.pairsAfter(a, step), m = jewelOf(step);
  return h('div', { class: 'adv-jewel ' + cls + (n ? ' got' : ''), style: jewelStyle(m) },
    h('div', { class: 'adv-jewel-ring' }, ...pair(m), n > 1 ? h('span', { class: 'adv-jewel-count' }, `×${n}`) : null),
    n ? h('div', { class: 'adv-jewel-again' }, '🔁 ➜ ', ...pair(m)) : null);
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
    // The jewel this piece earns, under it (the promise up front).
    return step === 'party' ? el : h('div', { class: 'adv-stop-wrap' }, el, jewelBadge(a, step, 'adv-stop-turn'));
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
// only each hand's first note labelled; 'fingers' (pre-staff only; a
// staff page treats it as 'book') letters and every note's finger, from
// the piece's hand position.
export function bookPage(song, width, height, labels = 'book') {
  if (song.clef === 'grand') return createBook(song, { width, height, labels });
  // Each hand's first note: by the notes' `hand` when they have one, else the set-ups.
  const handed = song.notes.some((x) => x.hand);
  const firsts = new Set(handed ? ['R', 'L'].map((hd) => song.notes.findIndex((x) => x.hand === hd)).filter((i) => i >= 0) : (song.setup ?? []).map((x) => x.at));
  const rows = [...(song.rhythm ? ['rhythm'] : []), ...(labels === 'letters' ? ['letters'] : [])];
  const size = Math.max(14, Math.min(22, Math.round(width / 38)));
  const letters = rows.length ? rows : 'none';
  return createStaff(song, {
    // The whole page at once when it fits, like the book.
    s: size, width, visible: Math.max(2, Math.floor((height - 20) / systemHeight(size, song.clef, letters, roomBelow(song)))),
    letters,
    fingersAbove: labels === 'book' || labels === 'fingers' ? true : (i) => (firsts.has(i) ? song.notes[i].f ?? null : null),
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
// A piece played twice: when the first time through ends, a short
// celebration ("Yay! One more time!": her character cheers, the first of two
// stars fills, a little ta-da) for BETWEEN_MS or until she taps, then the
// second time. Notes are ignored meanwhile; the stars (⭐☆) stay in the
// header. Smaller than the end-of-piece celebration on purpose. For rhythm
// pieces the first time's last bar is judged like the piece's last bar (it
// doesn't wait for the second time's first note).
const BETWEEN_MS = 2600;
function piece(root, id) {
  const a = adv.current();
  const song = PIECES[id], step = id, st = getState();
  const rhythm = !!song.rhythm;
  const grain = rhythm ? 'bar' : ['note', 'bar', 'piece'].includes(st.feedback) ? st.feedback : 'note';
  const labels = ['book', 'letters', 'first', 'fingers'].includes(st.bookLabels) ? st.bookLabels : 'book';
  let session = null, finished = false, gen = 0, jeweling = null;
  const jewel = jewelOf(id);

  const pageBox = h('div', { class: 'staff-box book-box' });
  const overlay = h('div', { class: 'overlay', style: 'display:none' });
  const setupHands = h('div', { class: 'adv-setup-hands' });
  const setupText = h('div', { class: 'adv-setup-text' });
  const setupBox = h('div', { class: 'adv-setup', style: 'display:none' }, setupHands, setupText);
  const passLabel = h('span', { class: 'adv-pass' });
  // Her character comes along, off the page (below it), with the pair of
  // jewels this piece earns beside her: "🦓 ➜ 💎💎" ("🔁 ➜ 💎💎" on a replay).
  // She reacts only at the bar/piece grain, never per note.
  const buddy = memberImg(a, 'piano', 'adv-buddy-sprite');
  const promise = h('div', { class: 'adv-promise' }, h('span', { class: 'adv-promise-icon' }, adv.jewelsAfter(a, step) ? '🔁' : STOPS[step][0]), h('span', { class: 'adv-promise-arrow' }, '➜'), h('span', { class: 'adv-promise-gem', style: jewelStyle(jewel) }, ...pair(jewel)));
  const buddyRow = h('div', { class: 'adv-buddy' },
    h('div', { class: 'adv-buddy-stand' }, buddy, h('div', { class: 'adv-buddy-block', style: `background-image:url(${texture('grass')})` })), promise);
  const hop = () => flash(buddy, 'hop', 350);
  const stageEl = h('div', { class: 'stage adv-page' }, setupBox, pageBox, buddyRow, overlay);
  const screen = h('div', { class: 'screen play adv-homework' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, song.title), passLabel),
    stageEl,
    testKeyboard());
  root.append(screen);

  const page = bookPage(song, pageBox.clientWidth - 12, stageEl.clientHeight - 150 - buddyRow.offsetHeight, labels);
  pageBox.replaceChildren(page.el);
  // The notes in the order she plays them: { i: note on the page, p, d, bar, pass }.
  const pageBars = Math.ceil(totalBeats(song.notes) / 4);
  const seq = [];
  for (let pass = 0; pass < (song.repeat || song.twice ? 2 : 1); pass++) {
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
  const twice = seq.at(-1).pass > 0;
  const passEnd = (k) => k + 1 >= N || seq[k + 1].pass !== seq[k].pass; // k: the last note of a time through
  // The header: ☆☆ the first time, ⭐☆ 2nd time, ⭐⭐ when done (n: stars earned).
  const setStars = (n, text = '') => passLabel.replaceChildren(...(twice ? [h('span', { class: 'adv-pass-stars' }, '⭐'.repeat(n) + '☆'.repeat(2 - n)), text] : []));
  setStars(0);

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
    log.startSession('homework', { adventure: a.id, step, grain, labels, ...(rhythm ? { rhythm: true, pitched: !!song.pitched } : {}), ...(song.repeat || song.twice ? { repeat: true } : {}), ...(song.twice ? { twice: true } : {}),
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
    if (k > 0 && seq[k].pass !== seq[k - 1].pass) {
      if (!session.between) { celebrateBetween(); return; }
      secondTime();
    }
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
    setStars(1, '2nd time');
    flash(passLabel, 'pop', 400);
  }
  // The first time through is done: celebrate a little, then the second.
  // session.between: unset → 'on' (showing) → 'done'.
  let betweenBox = null, betweenTimer = 0;
  function celebrateBetween() {
    session.between = 'on';
    engine.expect?.(null);
    hideSetup();
    log.event('between', { pass: 1, of: 2 });
    const sprite = memberImg(a, 'piano', 'adv-between-sprite');
    const star = h('span', { class: 'adv-between-star' }, '⭐');
    betweenBox = h('div', { class: 'adv-between', onclick: () => endBetween() },
      sprite,
      h('div', { class: 'adv-between-stars' }, star, h('span', { class: 'adv-between-todo' }, '☆')),
      h('div', { class: 'adv-between-text' }, 'Yay! One more time!'));
    stageEl.append(betweenBox);
    setStars(1);
    flash(sprite, 'cheer', 1500);
    hop();
    if (engine.ctx) engine.play(renderYay(engine.ctx.sampleRate));
    setTimeout(() => {
      if (!betweenBox) return;
      const r = star.getBoundingClientRect(), b = betweenBox.getBoundingClientRect();
      sparkle(betweenBox, r.left - b.left + r.width / 2, r.top - b.top + r.height / 2, ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff'], 14);
    }, 250);
    betweenTimer = setTimeout(endBetween, BETWEEN_MS);
  }
  function clearBetween() {
    clearTimeout(betweenTimer);
    betweenBox?.remove();
    betweenBox = null;
  }
  function endBetween() {
    if (!session || session.between !== 'on') return;
    clearBetween();
    session.between = 'done';
    showCurrent();
  }
  function barDone() {
    hop();
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
    const barEnd = session.cur >= N || seq[session.cur].bar !== seq[k].bar;
    if (grain === 'bar' && barEnd) { barDone(); log.event('bar', { bar: seq[k].bar, by }); }
    else if (grain === 'note' && barEnd && session.cur < N) hop(); // a bar, not a note
    if (session.cur >= N) setTimeout(finish, 600);
    else showCurrent();
  }

  function onNote(n) {
    if (!session || n.time < session.tStart || session.cur >= N) return;
    if (session.between === 'on') { log.event('judge', { got: n.midi, grade: 'ignored', why: 'between' }); return; }
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
    const bi = barIndexOf[session.cur], ks = bars[bi], m = ks.length, last = passEnd(ks.at(-1)); // the end of a time through
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
    if (seq[session.cur].pass !== seq[session.cur - 1].pass) entries = []; // a fresh start after the celebration
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
    if (jeweling?.open) { jeweling.close('grownup'); return; } // ends the jewel turn (placing it if she hadn't)
    if (!session || session.cur >= N) return;
    if (session.between === 'on') { endBetween(); return; }
    hideSetup();
    if (rhythm) {
      if (modelRaf) { cancelAnimationFrame(modelRaf); modelRaf = 0; engine.stopAll(); quietUntil = 0; }
      log.event('bar', { bar: seq[session.cur].bar, ok: true, by: 'grownup' });
      passBar([]);
      return;
    }
    const end = grain === 'note' ? session.cur + 1 : grain === 'bar' ? bars[barIndexOf[session.cur]].at(-1) + 1 : seq.findIndex((x, k) => k >= session.cur && passEnd(k)) + 1;
    while (session && session.cur < end) advance('grownup');
  }
  // ...and back: to the start of the bar she's partway through, else the
  // step before (one note / the bar before / the top at the piece grain).
  // The page is redrawn up to there.
  function grownupBack() {
    if (!session || session.cur >= N) return;
    const k = session.cur, bi = barIndexOf[k];
    if (session.between === 'on') { clearBetween(); session.between = null; }
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
    if (!pass) session.between = null; // back into the first time: celebrate its end again
    setStars(pass, pass ? '2nd time' : '');
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
    if (twice) { setStars(2); flash(passLabel, 'pop', 400); }
    engine.play(renderJingle(engine.ctx.sampleRate));
    const r = pageBox.getBoundingClientRect();
    for (let j = 0; j < 4; j++) setTimeout(() => sparkle(pageBox, r.width * (0.2 + 0.6 * Math.random()), r.height * (0.15 + 0.5 * Math.random()), ['#ffd84a', '#ff8fb3', '#55e0d6', '#5fc24a'], 16), j * 180);
    flash(buddy, 'cheer', 1500);
    // Then her jewels (the reward), then on: the headliner's piece opens the
    // party; the others go back to the
    // map, which asks who joins the band. (a.joined waits, so leaving early
    // still welcomes them on the map.)
    const next = () => {
      if (!screen.isConnected) return;
      const joined = a.joined;
      if (!joined) { location.hash = '#/adventure'; return; }
      a.joined = null;
      welcome(stageEl, joined, h('a', { class: 'btn primary huge', href: '#/adventure/party' }, '🎉 Party!'));
      warmParty(a); // render the party's first piece while she looks at the welcome
    };
    setTimeout(() => {
      if (!screen.isConnected) return;
      adv.startJewel(step, jewel);
      jeweling = jewelTurn(stageEl, {
        m: jewel, icon: STOPS[step][0],
        done: (stats) => {
          jeweling = null;
          adv.endJewel('finish', stats);
          promise.classList.add('got');
          buddy.src = spriteOf('piano');
          flash(buddy, 'cheer', 1500);
          setTimeout(next, 1200);
        },
      });
    }, 1600);
  }

  begin();
  return () => {
    gen++;
    removeEventListener('keydown', onKey);
    clearTimeout(endTimer);
    clearBetween();
    if (modelRaf) { cancelAnimationFrame(modelRaf); engine.stopAll(); }
    if (session) { session.off(); session = null; log.endSession({ aborted: true }); }
    if (!finished) adv.quitStep(step);
    if (jeweling) { const stats = jeweling.quit(); if (stats) adv.endJewel('quit', stats); jeweling = null; }
    engine.expect?.(null);
    engine.listen(false);
  };
}

// --- party: her band plays a piece with her (this week's last piece
// first; the piece buttons pick another) ---
// Kid-proof (small siblings mash it): the button reacts on touch-down, the
// band starts performing at once (the audio follows when it's rendered, see
// band-render.js), and every tap while it plays is ignored (counted in the
// log) until the piece ends and ▶ comes back. Played louder than elsewhere
// (BOOST) so it carries over a talking room.
// Log (adventure session): step events with step 'party':
//   play   { piece, by: 'tap' | 'auto' }            a play starting
//   played { piece, by, how: 'end' | 'left', soundMs, ignored, taps? }
//     soundMs: tap → sound starting (null if it never did), ignored: taps
//     while it played, taps: their [ms after the play, 'play' | piece id]
const BOOST = 6; // dB, through a clean limiter (instruments.js)
const partyAudio = (a, song) => bandAudio(song, a.band.map((id) => member(id).instrument), engine.ctx.sampleRate, { boost: BOOST });
function warmParty(a) { if (engine.ctx) partyAudio(a, PIECES[adv.STEPS.at(-2)]); }
function party(root) {
  const a = adv.current();
  let song = PIECES[adv.STEPS.at(-2)];
  const ids = a.band;
  let playing = null, raf = 0, played = false;

  const imgs = ids.map((id) => memberImg(a, id));
  const staffBox = h('div', { class: 'staff-box book-box' });
  const playBtn = h('button', { class: 'btn primary huge party-play' }, '▶');
  const pieceBtns = PARTY.map((pid) => h('button', {
    class: 'btn big' + (PIECES[pid] === song ? ' on' : ''), 'data-piece': pid, title: STOPS[pid][1],
  }, STOPS[pid][0]));
  const members = ids.map((id, i) => h('div', { class: 'member' },
    imgs[i], h('div', { class: 'member-name' }, member(id).name),
    h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` })));
  const scene = h('div', { class: 'band-stage' }, members);
  const partyEl = h('div', { class: 'screen band adv-party' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/adventure', title: 'Map' }, '🗺️'),
      h('div', { class: 'song-title' }, '🎉 Party!')),
    scene,
    h('div', { class: 'row center' }, pieceBtns, playBtn),
    h('div', { class: 'row center' }, h('a', { class: 'btn big', href: '#/world' }, '⛏️ Build!'), h('a', { class: 'btn big', href: '#/echo' }, '🐸 Copy me!')),
    staffBox);
  root.append(partyEl);
  let staff;
  function drawStaff() {
    for (const b of pieceBtns) b.classList.toggle('on', PIECES[b.dataset.piece] === song);
    staff = bookPage(song, staffBox.clientWidth - 12, innerHeight * 0.42);
    staffBox.replaceChildren(staff.el);
  }
  drawStaff();

  // React on touch-down, not on click (which waits for the finger to lift);
  // a keyboard's Enter/Space still arrives as a click with detail 0.
  const press = (btn, what) => {
    btn.addEventListener('pointerdown', (e) => { if (e.button === 0) { btn.classList.add('pressed'); tap(what); } });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => btn.classList.remove('pressed'));
    btn.addEventListener('click', (e) => { if (e.detail === 0) tap(what); });
  };
  press(playBtn, 'play');
  pieceBtns.forEach((b) => press(b, b.dataset.piece));

  function tap(what) {
    if (playing) {
      if (playing.ignored.length < 200) playing.ignored.push([Math.round(performance.now() - playing.at), what]);
      flash(playBtn, 'pop', 350); // "yes, it's playing"
      return;
    }
    if (what !== 'play') { song = PIECES[what]; drawStaff(); }
    start('tap');
  }

  // Sparkles and a note over a band member.
  const cheer = (i, n = 6) => {
    const r = scene.getBoundingClientRect(), m = imgs[i].getBoundingClientRect();
    const x = m.left - r.left + m.width / 2, y = m.top - r.top + m.height * 0.3;
    sparkle(scene, x, y, ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff'], n);
    const note = h('div', { class: 'note-float', style: `left:${x + (Math.random() - 0.5) * m.width * 0.6}px;top:${y}px` }, Math.random() < 0.5 ? '♪' : '♫');
    scene.append(note);
    setTimeout(() => note.remove(), 1200);
  };

  // Ask the worker for every party piece now, one at a time (this one
  // first), so a tap rarely has to wait for a render.
  let prepared = false;
  async function prepare() {
    if (prepared || !engine.ctx) return;
    prepared = true;
    const order = [song, ...PARTY.map((pid) => PIECES[pid]).filter((p) => p !== song)];
    for (const p of order) {
      if (!scene.isConnected) return;
      await partyAudio(a, p);
    }
  }

  async function start(by) {
    const me = { song, by, at: performance.now(), ignored: [], soundMs: null, t0: Infinity, last: -1, lastBeat: -1, warm: 0 };
    playing = me;
    playBtn.textContent = '🔊';
    playBtn.classList.add('playing');
    scene.classList.add('performing');
    imgs.forEach((img, i) => { flash(img, 'hop', 350); cheer(i, 8); });
    adv.note('play', { step: 'party', piece: song.id, by });
    raf = requestAnimationFrame(loop); // performs right away, in time once the audio is on
    await engine.start();
    prepare();
    const { audio, lead } = await partyAudio(a, song);
    if (playing !== me) return; // left the screen meanwhile
    const { startTime } = engine.play(audio);
    me.soundMs = Math.round(performance.now() - me.at + (startTime - engine.now()) * 1000);
    me.beatSec = 60 / song.bpm;
    me.t0 = startTime + lead;
    me.end = me.t0 + totalBeats(song.notes) * me.beatSec + 0.3;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const p = playing;
    const now = engine.ctx ? engine.now() : 0;
    if (now < p.t0) { // waiting for the sound: keep the band bouncing
      const k = Math.floor((performance.now() - p.at) / 300);
      if (k !== p.warm) { p.warm = k; const i = k % imgs.length; flash(imgs[i], 'hop', 300); if (k % 2) cheer(i, 4); }
      return;
    }
    const beat = (now - p.t0) / p.beatSec;
    const idx = staff.laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
    if (idx !== p.last && idx >= 0) {
      if (p.last >= 0) staff.mark(p.last, '');
      p.last = idx;
      staff.mark(idx, 'current');
      staff.show(idx);
      ids.forEach((id, i) => { if (member(id).instrument !== 'drums') { flash(imgs[i], 'hop', 300); if (Math.random() < 0.5) cheer(i, 4); } });
    }
    const whole = Math.floor(beat);
    if (whole !== p.lastBeat && beat >= 0) {
      p.lastBeat = whole;
      ids.forEach((id, i) => { if (member(id).instrument === 'drums') flash(imgs[i], 'hop', 250); });
    }
    if (now > p.end) {
      stop('end');
      if (!played) { played = true; adv.finishStep('party', { piece: song.id }); }
    }
  }

  function stop(how) {
    const p = playing;
    cancelAnimationFrame(raf);
    if (p.t0 !== Infinity) engine.stopAll();
    if (p.last >= 0) staff.mark(p.last, '');
    playing = null;
    playBtn.textContent = '▶';
    playBtn.classList.remove('playing');
    scene.classList.remove('performing');
    adv.note('played', { step: 'party', piece: p.song.id, by: p.by, how, soundMs: p.soundMs, ignored: p.ignored.length, ...(p.ignored.length ? { taps: p.ignored } : {}) });
  }

  adv.startStep('party', { band: ids });
  prepare();
  setTimeout(() => { if (staffBox.isConnected && !playing) start('auto'); }, 500);
  return () => {
    if (playing) stop('left');
    if (!played) adv.quitStep('party');
  };
}
