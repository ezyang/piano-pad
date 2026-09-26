// Call and response with a band member (experiment).
//   🦜 Copy me — the partner plays a phrase; she plays it back. Phrases start
//      at one note and grow as she succeeds (and ease off if she struggles).
//   💬 Answer me — the partner asks, she answers with anything; her turn ends
//      when she pauses. 💾 saves the conversation as a song.
// The app ignores the mic while the partner is playing. Notes show as blocks
// in speech bubbles and on a staff.
import { h, flash, sparkle } from '../dom.js';
import { getState, save, newSong } from '../store.js';
import { createStaff } from '../staff.js';
import { BIOMES } from '../build.js';
import { material, texture, characterUrl, BAND, bandSprite } from '../pixels.js';
import { pitchClass, letter, isSharp, quantize } from '../music.js';
import { engine } from '../engine.js';
import { renderVoice } from '../instruments.js';
import { testKeyboard } from '../keyboard.js';
import * as log from '../telemetry.js';

const PARTNERS = [
  { id: 'slime', voice: 'chip' },
  { id: 'bee', voice: 'bell' },
  { id: 'frog', voice: 'piano' },
];
const POOL = [60, 62, 64, 65, 67];
// Copy-me levels: phrase length and the notes it may use.
const LEVELS = [
  { len: 1, pool: [67] }, // just G, her first homework note
  { len: 1, pool: POOL },
  { len: 2, pool: POOL },
  { len: 3, pool: POOL },
  { len: 4, pool: POOL },
  { len: 5, pool: POOL },
  { len: 6, pool: [...POOL, 69, 71, 72] },
];
const BPM = 90;
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
  let level = Math.min(LEVELS.length - 1, st.echoLevel ?? 0);
  let streak = 0, gems = 0;
  let round = null; // { notes, k, wrong, replays, state: 'call'|'turn'|'done', heard: [] }
  let quietUntil = 0, silenceTimer = 0, listenerOff = null, callRaf = 0, alive = true;
  const conversation = []; // answer mode: [{ call: notes, answer: [{time, midi}] }]
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); };

  // --- scene ---
  const biome = BIOMES.find((b) => b.name === st.worldSky) ?? BIOMES[2];
  const partnerImg = h('img', { class: 'e-sprite' });
  const meImg = h('img', { class: 'e-sprite', src: characterUrl(st.character) });
  const partnerBubble = h('div', { class: 'e-bubble left' });
  const myBubble = h('div', { class: 'e-bubble right' });
  const gemsEl = h('div', { class: 'e-gems' });
  const ear = h('div', { class: 'e-ear' }, '👂');
  const scene = h('div', { class: `build echo-scene biome-${biome.name}`, style: `background:${biome.sky}` },
    ...(biome.stars ? [h('div', { class: 'moon' }), ...Array.from({ length: 24 }, (_, k) => h('div', { class: 'star-px', style: `left:${(k * 37) % 97}%;top:${(k * 53) % 45 + 3}%` }))] : []),
    gemsEl,
    h('div', { class: 'e-actor left' }, partnerBubble, ear, partnerImg, h('div', { class: 'member-block', style: `background-image:url(${texture(biome.ground)})` })),
    h('div', { class: 'e-actor right' }, myBubble, meImg, h('div', { class: 'member-block', style: `background-image:url(${texture(biome.ground)})` })),
    h('div', { class: 'build-ground', style: `background-image:url(${texture(biome.ground)})` }));
  const staffBox = h('div', { class: 'staff-box' });
  let staff = null;

  const block = (p, cls = '') => h('div', {
    class: 'e-block ' + cls, style: p == null ? '' : `background-image:url(${material(p).url})`,
  }, p == null || st.showLetters === false ? '' : letter(p) + (isSharp(p) ? '♯' : ''));

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
    staff = createStaff({ notes: notes.length ? notes : [{ d: 1, p: null }] }, { s, letters: st.showLetters !== false, width: staffBox.clientWidth - 6, visible: 1 });
    staffBox.replaceChildren(staff.el);
  }

  // --- rounds ---
  async function nextRound() {
    if (!alive) return;
    const lvl = LEVELS[level];
    const notes = mode === 'copy' ? phrase(lvl.len, lvl.pool) : phrase(3 + Math.floor(Math.random() * 2), POOL);
    round = { notes, k: 0, wrong: 0, replays: 0, state: 'call', heard: [] };
    log.event('call', { notes: notes.map((n) => n.p), level: mode === 'copy' ? level : undefined });
    partnerBubble.replaceChildren(...notes.map((n) => block(n.p, 'hidden')));
    myBubble.replaceChildren(...(mode === 'copy' ? notes.map(() => block(null, 'slot')) : []));
    drawStaff(notes);
    await call();
    if (round?.state === 'call') turn();
  }

  // The partner plays the phrase; its bubble fills in as it goes.
  async function call() {
    if (!round) return;
    round.state = 'call';
    scene.classList.remove('your-turn');
    await engine.start();
    const { audio, starts, soundEnd } = renderVoice(round.notes, BPM, PARTNERS[partnerIdx].voice, engine.ctx.sampleRate);
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
    scene.classList.add('your-turn');
    if (mode === 'copy' && staff) staff.mark(0, 'current');
  }

  function onNote(n) {
    if (!round || round.state !== 'turn' || n.time < quietUntil) return;
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
    const ok = pitchClass(n.midi) === pitchClass(want);
    log.event('judge', { k: round.k, want, got: n.midi, grade: ok ? 'hit' : 'wrong' });
    const slot = myBubble.children[round.k];
    if (!ok) {
      round.wrong++;
      staff?.ghost(round.k, n.midi);
      flash(slot, 'shake', 400);
      if (round.wrong >= 6) return giveUp();
      if (round.wrong === 3 && round.replays < 1) { // play it again as a hint
        round.replays++;
        round.k = 0;
        myBubble.replaceChildren(...round.notes.map(() => block(null, 'slot')));
        drawStaff(round.notes);
        call().then(() => round?.state === 'call' && turn());
      }
      return;
    }
    slot.replaceWith(block(want));
    flash(myBubble.children[round.k], 'drop', 250);
    flash(meImg, 'hop', 300);
    staff?.mark(round.k, 'hit');
    staff?.burst(round.k);
    round.k++;
    if (round.k < round.notes.length) staff?.mark(round.k, 'current');
    else success();
  }

  function success() {
    round.state = 'done';
    scene.classList.remove('your-turn');
    gems++;
    streak++;
    gemsEl.append(h('span', { class: 'gem' }, '💎'));
    const r = scene.getBoundingClientRect();
    sparkle(scene, r.width * 0.5, r.height * 0.4, ['#ffd84a', '#55e0d6', '#ff8fb3', '#ffffff'], 18);
    flash(partnerImg, 'hop', 350);
    flash(meImg, 'hop', 350);
    if (streak >= 2 && level < LEVELS.length - 1) { level++; streak = 0; }
    st.echoLevel = level;
    save();
    log.event('round', { ok: true, level });
    later(nextRound, 1400);
  }

  function giveUp() {
    round.state = 'done';
    scene.classList.remove('your-turn');
    streak = 0;
    if (level > 0) level--;
    st.echoLevel = level;
    save();
    log.event('round', { ok: false, level });
    later(nextRound, 900);
  }

  function endAnswer() {
    clearTimeout(silenceTimer);
    if (!round || round.state !== 'turn' || !round.heard.length) return;
    round.state = 'done';
    scene.classList.remove('your-turn');
    conversation.push({ call: round.notes, answer: round.heard });
    saveBtn.style.visibility = '';
    flash(partnerImg, 'hop', 350);
    later(nextRound, 900);
  }

  // Answer mode: the whole conversation becomes a song.
  function saveConversation() {
    if (!conversation.length) return;
    const notes = [];
    for (const { call: c, answer } of conversation) {
      notes.push(...c);
      notes.push(...quantize(answer).notes);
    }
    const song = newSong('me');
    song.title = song.title.replace('My Song', 'Our Song');
    song.notes = notes;
    song.bpm = BPM;
    save();
    location.hash = `#/song/${song.id}`;
  }

  function setMode(m) {
    mode = m;
    st.echoMode = m;
    save();
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === m);
    saveBtn.style.visibility = m === 'answer' && conversation.length ? '' : 'hidden';
    replayBtn.style.visibility = m === 'copy' ? '' : 'hidden';
    restart();
  }

  function restart() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    clearTimeout(silenceTimer);
    cancelAnimationFrame(callRaf);
    engine.stopAll();
    round = null;
    log.endSession({ aborted: true, gems });
    log.startSession('echo', { mode, partner: PARTNERS[partnerIdx].id, level });
    later(nextRound, 700);
  }

  // --- controls ---
  const modeBtns = [['copy', '🦜'], ['answer', '💬']].map(([m, icon]) =>
    h('button', { class: 'seg' + (m === mode ? ' on' : ''), 'data-mode': m, onclick: () => setMode(m) }, icon));
  const partnerBtns = PARTNERS.map((p, i) => h('button', { class: 'bp partner', 'data-id': p.id, onclick: () => { setPartner(i); restart(); } },
    h('img', { src: bandSprite(BAND.find((m) => m.id === p.id)) })));
  const replayBtn = h('button', { class: 'btn', title: 'Hear it again', onclick: () => { if (round?.state === 'turn') { round.k = 0; myBubble.replaceChildren(...round.notes.map(() => block(null, 'slot'))); drawStaff(round.notes); call().then(() => round?.state === 'call' && turn()); } } }, '🔁');
  const saveBtn = h('button', { class: 'btn', title: 'Save our song', onclick: saveConversation, style: 'visibility:hidden' }, '💾');
  const overlay = h('div', { class: 'overlay', style: 'display:none' });

  root.append(h('div', { class: 'screen echo' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'segs' }, modeBtns),
      h('div', { class: 'e-partners' }, partnerBtns),
      h('div', { class: 'spacer' }),
      replayBtn, saveBtn),
    h('div', { class: 'stage' }, scene, staffBox, overlay),
    testKeyboard()));
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
    log.endSession({ aborted: true, gems });
    engine.listen(false);
  };
}
