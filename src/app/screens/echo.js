// Call and response with a band member (experiment).
//   🦜 Copy me — the partner plays a phrase; she plays it back. Phrases start
//      at one note and grow slowly as she succeeds. There's no time limit and
//      it never moves on by itself: misses replay the phrase (slower after
//      six), and ⏭ skips (a notch easier). When the mic misses a note she
//      played, a grown-up's two-finger tap (→) on her turn fills in just
//      that note (the current one), as if it had been heard; the round is
//      won only when that was the last note, same as a homework step
//      (grownup.js). A touch that began during the call or between rounds
//      does nothing, even if it lifts on her turn. A round of Copy me is GOAL 💎:
//      empty slots fill in as she goes, and the last one plays a short
//      party ending ("🎉 The end!"), then 🏠 or ▶ again.
//   💬 Answer me — the partner asks, she answers with anything; her turn ends
//      when she pauses (or at a grown-up step, once she's played something).
// The app ignores the mic while the partner is playing. Notes show as blocks
// in speech bubbles and on a staff.
import { h, flash, sparkle } from '../dom.js';
import { getState, save, meUrl } from '../store.js';
import { createStaff } from '../staff.js';
import { BIOMES } from '../build.js';
import { material, texture, BAND, bandSprite } from '../pixels.js';
import { sameNote, outOfRange } from '../music.js';
import { engine } from '../engine.js';
import { renderVoice, renderJingle, renderYay } from '../instruments.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';
import { labelMode, labelFor, fingerFor, handFor } from '../labels.js';
import { createHand } from '../hand.js';
import { grownupGestures } from '../grownup.js';

const PARTNERS = [
  { id: 'slime', voice: 'chip' },
  { id: 'bee', voice: 'bell' },
  { id: 'frog', voice: 'piano' },
];
const POOL = [60, 62, 64, 65, 67];
// Copy-me levels: phrase length and the notes it may use. (The first real
// session climbed 1 → 4 notes in 90 s and felt rushed; steps are smaller now.)
const LEVELS = [
  { len: 1, pool: [67] }, // just G, her first homework note
  { len: 1, pool: POOL },
  { len: 2, pool: [60, 62, 64] },
  { len: 2, pool: POOL },
  { len: 3, pool: POOL },
  { len: 4, pool: POOL },
  { len: 5, pool: POOL },
  { len: 6, pool: [...POOL, 69, 71, 72] },
];
const LEVEL_UP = 3; // wins in a row to move up
const GOAL = 8; // 💎 that finish a round of Copy me (she'd pile them up forever)
const ENDING_MS = 6500; // the party ending, before 🏠 / ▶ again show up
const BPM = 72;
const ANSWER_PAUSE = 1.6; // s of silence that ends her answer
const MAX_ANSWER = 8;

// A little melody: a walk through the pool, mostly steps.
function phrase(len, pool) {
  let i = Math.floor(Math.random() * pool.length);
  const out = [pool[i]];
  while (out.length < len) {
    const step = [-1, -1, 1, 1, 2, -2, 0][Math.floor(Math.random() * 7)];
    i = Math.max(0, Math.min(pool.length - 1, i + step));
    out.push(pool[i]);
  }
  return out.map((p, k) => ({ d: k === out.length - 1 && len > 1 ? 2 : 1, p }));
}

export function echo(root) {
  const st = getState();
  let mode = st.echoMode ?? 'copy';
  let partnerIdx = Math.max(0, PARTNERS.findIndex((p) => p.id === st.echoPartner));
  // Start a notch below where she left off, to warm up.
  let level = Math.max(0, Math.min(LEVELS.length - 1, (st.echoLevel ?? 0) - 1));
  let streak = 0, gems = 0, ended = false, sessionAt = performance.now();
  let round = null; // { notes, k, wrong, replays, state: 'call'|'turn'|'done', heard: [], turnAt, helped: Set of k filled by a grown-up }
  let quietUntil = 0, silenceTimer = 0, listenerOff = null, callRaf = 0, alive = true;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); };

  // --- scene ---
  const biome = BIOMES.find((b) => b.name === st.worldSky) ?? BIOMES[2];
  const partnerImg = h('img', { class: 'e-sprite' });
  const meImg = h('img', { class: 'e-sprite', src: meUrl() });
  const partnerBubble = h('div', { class: 'e-bubble left' });
  const myBubble = h('div', { class: 'e-bubble right' });
  // GOAL slots from the start, so she can see the finish line coming.
  const gemSlots = Array.from({ length: GOAL }, () => h('span', { class: 'gem-slot' }));
  const gemsEl = h('div', { class: 'e-gems' }, gemSlots);
  const drawGems = () => gemSlots.forEach((g, i) => { g.classList.toggle('full', i < gems); g.textContent = i < gems ? '💎' : ''; });
  const ear = h('div', { class: 'e-ear' }, '👂');
  const scene = h('div', { class: `build echo-scene biome-${biome.name}`, style: `background:${biome.sky}` },
    ...(biome.stars ? [h('div', { class: 'moon' }), ...Array.from({ length: 24 }, (_, k) => h('div', { class: 'star-px', style: `left:${(k * 37) % 97}%;top:${(k * 53) % 45 + 3}%` }))] : []),
    gemsEl,
    h('div', { class: 'e-actor left' }, partnerBubble, ear, partnerImg, h('div', { class: 'member-block', style: `background-image:url(${texture(biome.ground)})` })),
    h('div', { class: 'e-actor right' }, myBubble, meImg, h('div', { class: 'member-block', style: `background-image:url(${texture(biome.ground)})` })),
    h('div', { class: 'build-ground', style: `background-image:url(${texture(biome.ground)})` }));
  const staffBox = h('div', { class: 'staff-box' });
  let staff = null;
  const hand = createHand();
  scene.append(h('div', { class: 'hand-box' }, hand.el));
  const showHand = (m) => hand.show(labelMode() === 'fingers' && m != null ? fingerFor(m) : null, handFor(m) ?? 'right');

  const block = (p, cls = '') => h('div', {
    class: 'e-block ' + cls, style: p == null ? '' : `background-image:url(${material(p).url})`,
  }, p == null ? '' : labelFor(p).text);

  function setPartner(i) {
    partnerIdx = i;
    st.echoPartner = PARTNERS[i].id;
    save();
    partnerImg.src = bandSprite(BAND.find((m) => m.id === PARTNERS[i].id));
    for (const b of partnerBtns) b.classList.toggle('on', b.dataset.id === PARTNERS[i].id);
  }

  function drawStaff(notes) {
    if (staffBox.clientWidth < 100) return;
    const s = Math.max(12, Math.min(20, Math.round(innerHeight / 46)));
    staff = createStaff({ notes: notes.length ? notes : [{ d: 1, p: null }] }, { s, letters: labelMode(), width: staffBox.clientWidth - 6, visible: 1 });
    staffBox.replaceChildren(staff.el);
  }

  // --- rounds ---
  async function nextRound() {
    if (!alive) return;
    const lvl = LEVELS[level];
    const notes = mode === 'copy' ? phrase(lvl.len, lvl.pool) : phrase(3 + Math.floor(Math.random() * 2), POOL);
    round = { notes, k: 0, wrong: 0, replays: 0, state: 'call', heard: [], turnAt: Infinity, helped: new Set() };
    log.event('call', { notes: notes.map((n) => n.p), level: mode === 'copy' ? level : undefined });
    partnerBubble.replaceChildren(...notes.map((n) => block(n.p, 'hidden')));
    myBubble.replaceChildren(...(mode === 'copy' ? notes.map(() => block(null, 'slot')) : []));
    drawStaff(notes);
    await call();
    if (round?.state === 'call') turn();
  }

  // The partner plays the phrase; its bubble fills in as it goes.
  async function call(bpm = BPM) {
    if (!round) return;
    round.state = 'call';
    showHand(null);
    scene.classList.remove('your-turn');
    await engine.start();
    const { audio, starts, soundEnd } = renderVoice(round.notes, bpm, PARTNERS[partnerIdx].voice, engine.ctx.sampleRate);
    const { startTime } = engine.play(audio);
    // Her turn starts once the phrase has died away; until then the mic is
    // ignored so the partner's notes don't count as hers.
    const end = startTime + soundEnd;
    quietUntil = end;
    const blocks = [...partnerBubble.children];
    blocks.forEach((b) => b.classList.add('hidden'));
    let shown = 0;
    await new Promise((resolve) => {
      const tick = () => {
        if (!alive) return resolve();
        const t = engine.now() - startTime;
        while (shown < starts.length && t >= starts[shown]) {
          blocks[shown].classList.remove('hidden');
          flash(blocks[shown], 'drop', 250);
          flash(partnerImg, 'hop', 300);
          shown++;
        }
        if (engine.now() >= end) return resolve();
        callRaf = requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function turn() {
    if (!round) return;
    round.state = 'turn';
    round.turnAt = performance.now();
    scene.classList.add('your-turn');
    if (mode === 'copy') showHand(round.notes[0].p);
    if (mode === 'copy' && staff) staff.mark(0, 'current');
  }

  function onNote(n) {
    if (!round || round.state !== 'turn' || n.time < quietUntil) return;
    const ps = round.notes.map((x) => x.p);
    if (n.voice || (mode === 'answer' ? n.midi < 48 : outOfRange(n.midi, Math.min(...ps), Math.max(...ps)))) {
      log.event('judge', { got: n.midi, grade: 'ignored', ...(n.voice ? { why: 'voice' } : {}) }); // speech, most likely
      return;
    }
    if (mode === 'answer') {
      round.heard.push({ time: n.time, midi: n.midi });
      log.event('answer', { midi: n.midi });
      const b = block(n.midi);
      myBubble.append(b);
      flash(b, 'drop', 250);
      flash(meImg, 'hop', 300);
      clearTimeout(silenceTimer);
      if (round.heard.length >= MAX_ANSWER) return endAnswer();
      silenceTimer = setTimeout(endAnswer, ANSWER_PAUSE * 1000);
      return;
    }
    const want = round.notes[round.k].p;
    const ok = sameNote(n.midi, want, st.strictOctave !== false);
    log.event('judge', { k: round.k, want, got: n.midi, grade: ok ? 'hit' : 'wrong' });
    const slot = myBubble.children[round.k];
    if (!ok) {
      round.wrong++;
      staff?.ghost(round.k, n.midi);
      flash(slot, 'shake', 400);
      // Hints, never a time-out: replay after 3 misses, slower after 6.
      if (round.wrong === 3 || round.wrong === 6) replay(round.wrong === 6 ? BPM * 0.7 : BPM);
      return;
    }
    advance();
  }

  // The current note is done (heard, or a grown-up's step): fill it, move
  // the staff marker and hand on, and win the round after the last one.
  function advance() {
    fill(round.k);
    round.k++;
    if (round.k < round.notes.length) { staff?.mark(round.k, 'current'); showHand(round.notes[round.k].p); return; }
    showHand(null);
    success(round.helped.size ? { by: 'grownup', helped: [...round.helped], heard: round.notes.length - round.helped.size } : undefined);
  }

  // Note k of the phrase is done: its block drops into her bubble.
  function fill(k) {
    myBubble.children[k].replaceWith(block(round.notes[k].p));
    flash(myBubble.children[k], 'drop', 250);
    flash(meImg, 'hop', 300);
    staff?.mark(k, 'hit');
    staff?.burst(k);
  }

  // A grown-up step: on her turn, the CURRENT note counts as heard (the mic
  // missed it) and the phrase moves on one note, like a homework step; the
  // round is won only if it was the last note. During the call, between
  // rounds, or for a touch that began before her turn, it's ignored. In
  // answer mode it ends her answer now, if she's played anything.
  function grownupStep({ since = performance.now() } = {}) {
    if (!round || round.state !== 'turn' || since < round.turnAt) return;
    if (mode === 'answer') {
      if (!round.heard.length) return;
      log.event('answer-end', { heard: round.heard.length, by: 'grownup' });
      return endAnswer();
    }
    round.helped.add(round.k);
    log.event('judge', { k: round.k, want: round.notes[round.k].p, grade: 'grownup', by: 'grownup' });
    advance();
  }

  function success(extra) {
    round.state = 'done';
    scene.classList.remove('your-turn');
    gems++;
    streak++;
    drawGems();
    flash(gemSlots[gems - 1], 'pop', 450);
    const r = scene.getBoundingClientRect();
    sparkle(scene, r.width * 0.5, r.height * 0.4, ['#ffd84a', '#55e0d6', '#ff8fb3', '#ffffff'], 18);
    flash(partnerImg, 'hop', 350);
    flash(meImg, 'hop', 350);
    if (streak >= LEVEL_UP && level < LEVELS.length - 1) { level++; streak = 0; }
    st.echoLevel = level;
    save();
    log.event('round', { ok: true, level, ...extra });
    if (gems >= GOAL) ending();
    else later(nextRound, 2600);
  }

  // The 8th 💎: a short party, then a clear end. A full-screen layer goes
  // up at once and swallows every tap (header too) while it plays; the mic
  // is ignored (round is 'done'). Then just 🏠 and ▶ again.
  function ending() {
    ended = true;
    log.event('end', { gems, level, ms: Math.round(performance.now() - sessionAt) });
    const others = BAND.filter((m) => m.art && m.id !== PARTNERS[partnerIdx].id);
    const dancer = (src, cls = '') => h('img', { class: 'e-dancer ' + cls, src });
    const her = dancer(meUrl(), 'her');
    const dancers = [
      ...others.slice(0, 1).map((m) => dancer(bandSprite(m))),
      dancer(bandSprite(BAND.find((m) => m.id === PARTNERS[partnerIdx].id))),
      her,
      ...others.slice(1).map((m) => dancer(bandSprite(m))),
    ];
    dancers.forEach((d, i) => d.style.setProperty('--i', i));
    const colors = ['#ffd84a', '#ff8fb3', '#55e0d6', '#ffffff', '#7be36b', '#e8433a', '#8fa8ff'];
    const confetti = Array.from({ length: 70 }, (_, i) => h('div', {
      class: 'e-confetti',
      style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${0.6 + Math.random() * 3}s;animation-duration:${2 + Math.random() * 1.6}s;--r:${Math.round(Math.random() * 720 - 360)}deg`,
    }));
    const home = h('a', { class: 'btn huge e-end-home', href: '#/', title: 'Home' }, '🏠');
    const again = h('button', { class: 'btn primary huge e-end-again' }, '▶ again');
    let going = false;
    again.addEventListener('pointerdown', (e) => { if (e.button === 0 && !going) { going = true; playAgain(); } });
    again.addEventListener('click', (e) => { if (e.detail === 0 && !going) { going = true; playAgain(); } });
    const end = h('div', { class: 'e-end' },
      ...confetti,
      h('div', { class: 'e-end-title' }, h('span', { class: 'e-end-pop' }, '🎉'), h('span', {}, 'The end!')),
      h('div', { class: 'e-end-gems' }, Array.from({ length: GOAL }, (_, i) => h('span', { style: `animation-delay:${0.8 + i * 0.12}s` }, '💎'))),
      h('div', { class: 'e-end-band' }, dancers),
      h('div', { class: 'e-end-buttons' }, home, again));
    // Swallow everything until the buttons are up (and the buttons' own taps
    // don't leak to the stage's grown-up gestures).
    for (const ev of ['pointerdown', 'click', 'touchstart']) end.addEventListener(ev, (e) => e.stopPropagation());
    screenEl.append(end);
    endEl = end;
    const party = (k) => {
      const r = end.getBoundingClientRect(), b = her.getBoundingClientRect();
      sparkle(end, b.left - r.left + b.width / 2 + (Math.random() - 0.5) * r.width * 0.6, b.top - r.top + b.height * 0.3, colors, 14);
      flash(dancers[k % dancers.length], 'hop', 350);
    };
    const sound = (render) => { if (engine.ctx) engine.play(render(engine.ctx.sampleRate)); };
    later(() => sound(renderJingle), 800);
    later(() => sound(renderYay), 2300);
    later(() => sound(renderJingle), 3500);
    for (let k = 0; k < 14; k++) later(() => party(k), 900 + k * 360);
    later(() => end.classList.add('done'), ENDING_MS);
    later(() => end.classList.add('ready'), ENDING_MS + 500);
  }

  function playAgain() {
    log.event('again', { level });
    endEl?.remove();
    endEl = null;
    lastEnded = true; // the finished session is kept as finished
    ended = false;
    restart(); // same level, a fresh session
    gems = 0;
    streak = 0;
    drawGems();
  }

  function replay(bpm = BPM) {
    if (ended || !round || round.state !== 'turn') return;
    round.replays++;
    round.k = 0;
    round.helped.clear(); // the phrase starts over, so do the grown-up's fills
    myBubble.replaceChildren(...round.notes.map(() => block(null, 'slot')));
    drawStaff(round.notes);
    call(bpm).then(() => round?.state === 'call' && turn());
  }

  // ⏭: a different phrase, a notch easier.
  function skip() {
    if (ended || !round || round.state === 'done') return;
    round.state = 'done';
    scene.classList.remove('your-turn');
    streak = 0;
    if (level > 0) level--;
    st.echoLevel = level;
    save();
    log.event('round', { ok: false, skipped: true, level });
    later(nextRound, 600);
  }

  function endAnswer() {
    clearTimeout(silenceTimer);
    if (!round || round.state !== 'turn' || !round.heard.length) return;
    round.state = 'done';
    scene.classList.remove('your-turn');
    flash(partnerImg, 'hop', 350);
    later(nextRound, 900);
  }

  function setMode(m) {
    if (ended) return;
    mode = m;
    st.echoMode = m;
    save();
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === m);
    replayBtn.style.visibility = skipBtn.style.visibility = gemsEl.style.visibility = m === 'copy' ? '' : 'hidden';
    restart();
  }

  function restart() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    clearTimeout(silenceTimer);
    cancelAnimationFrame(callRaf);
    engine.stopAll();
    round = null;
    log.endSession({ aborted: !lastEnded, gems });
    lastEnded = false;
    log.startSession('echo', { mode, partner: PARTNERS[partnerIdx].id, level, ...(mode === 'copy' ? { goal: GOAL } : {}) });
    sessionAt = performance.now();
    later(nextRound, 700);
  }

  // --- controls ---
  const modeBtns = [['copy', '🦜'], ['answer', '💬']].map(([m, icon]) =>
    h('button', { class: 'seg' + (m === mode ? ' on' : ''), 'data-mode': m, onclick: () => setMode(m) }, icon));
  const partnerBtns = PARTNERS.map((p, i) => h('button', { class: 'bp partner', 'data-id': p.id, onclick: () => { if (ended) return; setPartner(i); restart(); } },
    h('img', { src: bandSprite(BAND.find((m) => m.id === p.id)) })));
  const replayBtn = h('button', { class: 'btn', title: 'Hear it again', onclick: () => replay() }, '🔁');
  const skipBtn = h('button', { class: 'btn', title: 'A different one', onclick: skip }, '⏭\uFE0F');
  const overlay = h('div', { class: 'overlay', style: 'display:none' });
  const stageEl = h('div', { class: 'stage' }, scene, staffBox, overlay);

  let endEl = null, lastEnded = false;
  const screenEl = h('div', { class: 'screen echo' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'segs' }, modeBtns),
      h('div', { class: 'e-partners' }, partnerBtns),
      h('div', { class: 'spacer' }),
      replayBtn, skipBtn),
    stageEl,
    testKeyboard());
  root.append(screenEl);
  drawGems();
  const gesturesOff = grownupGestures(stageEl, { step: grownupStep });
  setPartner(partnerIdx);
  setMode(mode);
  listen();

  async function listen() {
    const ok = await Promise.race([engine.listen(true).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 1500))]);
    if (!ok || engine.ctx.state !== 'running') {
      overlay.replaceChildren(h('button', { class: 'btn primary huge', onclick: () => { overlay.style.display = 'none'; listen(); restart(); } }, '▶ Start'));
      overlay.style.display = '';
      return;
    }
    listenerOff?.();
    listenerOff = engine.onNote(onNote);
  }

  return () => {
    alive = false;
    for (const t of timers) clearTimeout(t);
    clearTimeout(silenceTimer);
    cancelAnimationFrame(callRaf);
    engine.stopAll();
    listenerOff?.();
    gesturesOff();
    log.endSession({ aborted: !ended, gems });
    engine.listen(false);
  };
}
