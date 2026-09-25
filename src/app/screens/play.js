import { h, flash, sparkle } from '../dom.js';
import { getSong, getState, save } from '../store.js';
import { createTrack, fitRowH } from '../track.js';
import { pitchClass, totalBeats, letter } from '../music.js';
import { characterUrl, material, BAND, bandSprite } from '../pixels.js';
import { engine } from '../engine.js';
import { renderJingle } from '../instruments.js';

const SPRITE_W = 40, SPRITE_H = 56;

// Per-note grades in "keep the beat" mode.
const GRADE_SCORE = { perfect: 1, good: 0.75, ok: 0.45, wrong: 0.2, miss: 0 };

export function play(root, id) {
  const song = getSong(id);
  if (!song) { location.hash = '#/'; return; }
  const st = getState();
  let mode = st.playMode ?? 'wait';
  let bpm = song.playBpm ?? song.bpm;
  let session = null;
  let raf = 0;

  const trackBox = h('div', { class: 'track-box play' });
  let track, player, playerImg;
  function build() {
    track = createTrack(song, { extraBeats: 1, rowH: fitRowH(song, innerHeight - 110) });
    playerImg = h('img', { src: characterUrl(st.character), style: `width:${SPRITE_W}px;height:${SPRITE_H}px` });
    player = h('div', { class: 'player' }, playerImg);
    track.grid.append(player);
    trackBox.replaceChildren(track.el);
    placePlayer(-1);
  }
  // Stand on note i (or just before the first note if i < 0).
  function placePlayer(i, hop = false) {
    const first = track.laid.findIndex((n) => n.p != null);
    const j = i < 0 ? first : i;
    if (j < 0) return;
    const n = track.laid[j];
    const left = i < 0 ? track.x(0) - SPRITE_W - 4 : track.x(n.start) + (n.d * track.ppb - 6) / 2 - SPRITE_W / 2;
    const top = track.blockTop(j) - SPRITE_H + 4;
    player.style.transform = `translate(${left}px, ${top}px)`;
    if (hop) flash(playerImg, 'hop', 350);
  }

  // --- header controls ---
  const modeBtns = [['wait', '🐢 Wait for me'], ['beat', '🥁 Keep the beat']].map(([m, label]) =>
    h('button', { class: 'seg' + (m === mode ? ' on' : ''), 'data-mode': m, onclick: () => setMode(m) }, label));
  function setMode(m) {
    if (session) return;
    mode = m;
    st.playMode = m;
    save();
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === m);
    speedBox.style.visibility = m === 'beat' ? '' : 'hidden';
  }
  const bpmLabel = h('span', { class: 'bpm' }, String(bpm));
  const setBpm = (v) => { if (session) return; bpm = Math.max(40, Math.min(160, v)); song.playBpm = bpm; save(); bpmLabel.textContent = String(bpm); };
  const speedBox = h('div', { class: 'speed' },
    h('button', { class: 'btn small', onclick: () => setBpm(bpm - 10) }, '🐌'), bpmLabel,
    h('button', { class: 'btn small', onclick: () => setBpm(bpm + 10) }, '🐇'));
  const ear = h('div', { class: 'ear', title: 'Microphone' }, '👂', h('div', { class: 'meter' }, h('div', { class: 'meter-fill' })));

  const overlay = h('div', { class: 'overlay' });
  const count = h('div', { class: 'countin' });

  root.append(h('div', { class: 'screen play' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: `#/song/${song.id}` }, '⬅'),
      h('div', { class: 'song-title' }, song.title),
      h('div', { class: 'spacer' }),
      h('div', { class: 'segs' }, modeBtns),
      speedBox, ear),
    h('div', { class: 'stage' }, trackBox, count, overlay)));
  build();
  setMode(mode);
  showStart();

  function showStart() {
    overlay.replaceChildren(h('button', { class: 'btn primary huge', onclick: begin }, '▶ Start'));
    overlay.style.display = '';
  }

  async function begin() {
    overlay.style.display = 'none';
    try {
      await engine.listen(true);
    } catch (err) {
      overlay.replaceChildren(h('div', { class: 'panel' }, 'I need the microphone to hear the piano! 🎤', h('br'), String(err.message ?? err)),
        h('button', { class: 'btn primary', onclick: begin }, 'Try again'));
      overlay.style.display = '';
      return;
    }
    build();
    cancelAnimationFrame(raf);
    const targets = track.laid.map((n, i) => i).filter((i) => track.laid[i].p != null);
    session = { targets, grades: new Map(), wrong: 0, cur: 0, off: engine.onNote(onNote) };
    if (mode === 'wait') {
      highlight();
    } else {
      const beatSec = 60 / bpm;
      session.beatSec = beatSec;
      session.t0 = engine.now() + 4 * beatSec + 0.15;
      session.expected = new Map(targets.map((i) => [i, session.t0 + track.laid[i].start * beatSec]));
      session.window = Math.min(0.4, 0.5 * beatSec);
      session.end = session.t0 + totalBeats(song.notes) * beatSec + 0.4;
    }
    tick();
  }

  function highlight() {
    track.blocks.forEach((b) => b.classList.remove('current'));
    const i = session.targets[session.cur];
    if (i != null) {
      track.blocks[i].classList.add('current');
      track.follow(track.laid[i].start);
    }
  }

  function onNote(n) {
    if (!session) return;
    if (mode === 'wait') {
      const i = session.targets[session.cur];
      if (i == null) return;
      if (pitchClass(n.midi) === pitchClass(track.laid[i].p)) {
        hit(i, 'perfect');
        session.cur++;
        highlight();
        if (session.cur >= session.targets.length) setTimeout(finish, 600);
      } else {
        session.wrong++;
        wrongNote(i, n.midi);
      }
      return;
    }
    // Keep the beat: judge against the nearest unjudged note in time.
    let best = -1, bestErr = Infinity;
    for (const [i, t] of session.expected) {
      if (session.grades.has(i)) continue;
      const err = Math.abs(n.time - t);
      if (err < session.window && err < bestErr) { best = i; bestErr = err; }
    }
    if (best < 0) return;
    if (pitchClass(n.midi) !== pitchClass(track.laid[best].p)) {
      session.grades.set(best, 'wrong');
      wrongNote(best, n.midi);
      return;
    }
    hit(best, bestErr < 0.08 ? 'perfect' : bestErr < 0.16 ? 'good' : 'ok');
  }

  function hit(i, grade) {
    session.grades.set(i, grade);
    const b = track.blocks[i];
    b.classList.remove('current', 'wrong');
    b.classList.add('hit', grade);
    flash(b, 'pop', 400);
    const rect = { x: parseFloat(b.style.left) + b.offsetWidth / 2, y: parseFloat(b.style.top) + b.offsetHeight / 2 };
    const mat = material(track.laid[i].p);
    sparkle(track.grid, rect.x, rect.y, grade === 'perfect' ? ['#fff6a8', '#ffd84a', '#ffffff'] : [mat.color, '#ffffff']);
    placePlayer(i, true);
  }

  function wrongNote(i, midi) {
    const b = track.blocks[i];
    if (mode === 'beat') b.classList.add('wrong');
    flash(b, 'shake', 400);
    const bubble = h('div', {
      class: 'bubble', style: `left:${parseFloat(b.style.left) + 6}px;top:${parseFloat(b.style.top) - 34}px`,
    }, h('span', { class: 'swatch', style: `background-image:url(${material(midi).url})` }), letter(midi));
    track.grid.append(bubble);
    setTimeout(() => bubble.remove(), 900);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    const fill = ear.querySelector('.meter-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (engine.level + 70) * 1.6))}%`;
    if (!session || mode !== 'beat') return;
    const now = engine.now();
    const beat = (now - session.t0) / session.beatSec;
    if (beat < 0) {
      const c = Math.ceil(-beat);
      if (count.textContent !== String(c)) { count.textContent = String(c); flash(count, 'pulse', 300); }
      count.style.display = '';
    } else {
      count.style.display = 'none';
    }
    track.setPlayhead(Math.max(0, beat));
    if (beat > 0) track.follow(beat, 'continuous');
    playerImg.classList.toggle('bob', beat > 0 && beat % 1 < 0.15);
    for (const [i, t] of session.expected) {
      if (!session.grades.has(i) && now > t + session.window) {
        session.grades.set(i, 'miss');
        track.blocks[i].classList.add('miss');
      }
    }
    if (now > session.end) finish();
  }

  async function finish() {
    if (!session) return;
    const s = session;
    session = null;
    s.off();
    await engine.listen(false);
    track.setPlayhead(null);
    count.style.display = 'none';

    let stars;
    if (mode === 'wait') stars = s.wrong <= 1 ? 3 : s.wrong <= 4 ? 2 : 1;
    else {
      const score = s.targets.reduce((a, i) => a + GRADE_SCORE[s.grades.get(i) ?? 'miss'], 0) / Math.max(1, s.targets.length);
      stars = score >= 0.85 ? 3 : score >= 0.6 ? 2 : score >= 0.3 ? 1 : 0;
    }
    song.plays = (song.plays ?? 0) + 1;
    let joined = null;
    if (stars >= 2 && song.band < BAND.length) {
      joined = BAND[song.band];
      song.band++;
    }
    save();
    if (stars >= 2) engine.play(renderJingle(engine.ctx.sampleRate));

    overlay.replaceChildren(h('div', { class: 'panel results' },
      h('div', { class: 'stars' }, [0, 1, 2].map((k) => h('span', { class: 'star' + (k < stars ? ' on' : '') }, '★'))),
      mode === 'beat' ? h('div', { class: 'tally' }, tally(s)) : null,
      joined ? h('div', { class: 'joined' },
        h('img', { class: 'join-sprite', src: bandSprite(joined) }),
        h('div', {}, `${joined.name} joined your band!`)) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', onclick: () => { build(); showStart(); } }, '🔁 Again'),
        h('a', { class: 'btn big', href: `#/band/${song.id}` }, '🎸 Band'),
        h('a', { class: 'btn big', href: `#/song/${song.id}` }, '✏️'))));
    overlay.style.display = '';
    if (joined) flash(overlay.querySelector('.join-sprite'), 'hop', 0);
  }

  function tally(s) {
    const c = { perfect: 0, good: 0, ok: 0, wrong: 0, miss: 0 };
    for (const i of s.targets) c[s.grades.get(i) ?? 'miss']++;
    return [['✨', c.perfect], ['👍', c.good + c.ok], ['❓', c.wrong + c.miss]]
      .map(([e, n]) => h('span', {}, `${e} ${n}`));
  }

  return () => {
    cancelAnimationFrame(raf);
    if (session) { session.off(); session = null; }
    engine.listen(false);
  };
}
