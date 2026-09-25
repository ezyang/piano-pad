// Practice: notation on a staff, a tower that builds as she plays.
//   learn — waits for the right note (a wrong one shows a ghost note)
//   go    — "keep going": any note advances; wrong ones are marked, a quick
//           fix right after a mistake repairs it; rhythm is judged against
//           her own tempo (stalls, rushing, dragging)
//   beat  — count-in, then she keeps the beat herself (no moving line);
//           graded on timing
import { h } from '../dom.js';
import { getSong, getState, save } from '../store.js';
import { createStaff, systemHeight, resolveClef } from '../staff.js';
import { createBuild } from '../build.js';
import { pitchClass, totalBeats } from '../music.js';
import { characterUrl, BAND, bandSprite } from '../pixels.js';
import { engine } from '../engine.js';
import { testKeyboard } from '../keyboard.js';
import { renderJingle, renderTick } from '../instruments.js';
import { rhythmReview, scoreLearn, scoreGo, scoreBeat, beatGrade } from '../scoring.js';
import * as log from '../telemetry.js';

const MODES = [['learn', '🐢', 'Learn'], ['go', '🏃', 'Keep going'], ['beat', '🥁', 'Beat']];
const FIX_WINDOW = 1.5; // s: a correct replay of a just-missed note counts as fixing it

export function play(root, id) {
  const song = getSong(id);
  if (!song) { location.hash = '#/'; return; }
  const st = getState();
  let mode = { wait: 'learn' }[st.playMode] ?? st.playMode ?? 'learn';
  let bpm = song.playBpm ?? song.bpm;
  let session = null;
  let raf = 0;

  const sceneBox = h('div', { class: 'scene-box' });
  const staffBox = h('div', { class: 'staff-box' });
  let staff, build;
  function rebuild() {
    // Size the staff so two lines fit when possible (reading ahead), leaving
    // the rest of the height to the building scene.
    const clef = resolveClef(song), letters = st.showLetters !== false;
    const s = Math.max(12, Math.min(22, Math.round(innerHeight / (clef === 'grand' ? 52 : 40))));
    const H = systemHeight(s, clef, letters);
    const avail = stageEl.clientHeight - 150 - 10; // keep ≥150px of scene
    staff = createStaff(song, { s, letters, width: staffBox.clientWidth - 6, visible: avail >= 2 * H ? 2 : 1 });
    staffBox.replaceChildren(staff.el);
    build = createBuild(staff.targets.length, characterUrl(st.character), song.plays ?? 0);
    sceneBox.replaceChildren(build.el);
  }

  // --- header ---
  const modeBtns = MODES.map(([m, icon, label]) =>
    h('button', { class: 'seg' + (m === mode ? ' on' : ''), 'data-mode': m, onclick: () => setMode(m) },
      icon, h('span', { class: 'seg-label' }, ' ' + label)));
  function setMode(m, initial = false) {
    abort();
    mode = m;
    st.playMode = m;
    save();
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === m);
    speedBox.style.visibility = m === 'beat' ? '' : 'hidden'; // keep its space so the header doesn't shift
    if (!initial) { rebuild(); ready(); }
  }
  let gen = 0; // bumps whenever a session is abandoned, to cancel stale async work
  function abort() {
    gen++;
    count.style.display = 'none';
    if (session?.mode === 'beat') engine.stopAll(); // cancel scheduled count-in ticks
    if (!session) return;
    session.off();
    session = null;
    log.endSession({ aborted: true });
  }
  // Untimed modes just start listening; the beat mode waits for Start.
  function ready() {
    if (mode === 'beat') showStart();
    else begin();
  }
  const bpmLabel = h('span', { class: 'bpm' }, String(bpm));
  const setBpm = (v) => {
    if (session) { abort(); rebuild(); ready(); } // tapping controls stops a run in progress
    bpm = Math.max(40, Math.min(160, v));
    song.playBpm = bpm;
    save();
    bpmLabel.textContent = String(bpm);
  };
  const speedBox = h('div', { class: 'speed' },
    h('button', { class: 'btn small', onclick: () => setBpm(bpm - 10) }, '🐌'), bpmLabel,
    h('button', { class: 'btn small', onclick: () => setBpm(bpm + 10) }, '🐇'));
  const meterFill = h('div', { class: 'meter-fill' });
  const ear = h('div', { class: 'ear', title: 'Microphone' }, '👂', h('div', { class: 'meter' }, meterFill));
  const overlay = h('div', { class: 'overlay' });
  const count = h('div', { class: 'countin' });
  const stageEl = h('div', { class: 'stage' }, sceneBox, staffBox, count, overlay);

  root.append(h('div', { class: 'screen play' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: '#/' }, '🏠'),
      h('div', { class: 'song-title' }, song.title),
      h('a', { class: 'btn small', href: `#/song/${song.id}`, title: 'See the blocks / edit' }, '✏️'),
      h('div', { class: 'spacer' }),
      h('div', { class: 'segs' }, modeBtns),
      speedBox, ear),
    stageEl,
    testKeyboard()));
  rebuild();
  setMode(mode, true);
  ready();
  meterLoop();

  function meterLoop() {
    raf = requestAnimationFrame(meterLoop);
    meterFill.style.width = `${engine.listening ? Math.max(0, Math.min(100, (engine.level + 70) * 1.6)) : 0}%`;
    if (session?.mode === 'beat') beatTick();
  }

  function showStart() {
    overlay.replaceChildren(h('button', { class: 'btn primary huge', onclick: begin }, '▶ Start'));
    overlay.style.display = '';
  }

  async function begin() {
    const myGen = ++gen;
    overlay.style.display = 'none';
    try {
      // Without a recent tap (e.g. opened straight onto this screen) iOS
      // won't start audio; fall back to a Start button then.
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
    rebuild();
    const t = staff.targets;
    session = {
      mode, cur: 0, wrong: 0, grades: new Map(), times: [], lastWrong: null,
      off: engine.onNote(onNote),
    };
    log.startSession('practice', {
      song: { id: song.id, title: song.title, by: song.by, clef: resolveClef(song), bpm: song.bpm, notes: song.notes },
      mode, ...(mode === 'beat' ? { bpm } : {}), plays: song.plays ?? 0,
    });
    if (mode === 'beat') {
      const beatSec = 60 / bpm;
      Object.assign(session, {
        beatSec,
        t0: engine.now() + 4 * beatSec + 0.15,
        window: Math.min(0.4, 0.5 * beatSec),
      });
      session.expected = new Map(t.map((i, k) => [k, session.t0 + staff.laid[i].start * beatSec]));
      session.end = session.t0 + totalBeats(song.notes) * beatSec + 0.4;
      log.event('expect', {
        beatSec, window: session.window,
        times: [...session.expected.values()].map(log.ctxMs),
      });
      // Audible count-in; anything heard before the song starts is ignored.
      const sr = engine.ctx.sampleRate;
      for (let k = 4; k >= 1; k--) engine.play(renderTick(sr, k === 4), { when: session.t0 - k * beatSec });
    } else {
      markCurrent();
    }
  }

  const pc = (k) => pitchClass(staff.laid[staff.targets[k]].p);

  function markCurrent() {
    const i = staff.targets[session.cur];
    if (i == null) return;
    staff.mark(i, 'current');
    staff.show(i);
  }

  function onNote(n) {
    if (!session) return;
    const t = staff.targets;
    if (session.mode === 'learn') {
      const k = session.cur;
      if (k >= t.length) return;
      log.event('judge', { k, want: staff.laid[t[k]].p, got: n.midi, grade: pitchClass(n.midi) === pc(k) ? 'hit' : 'wrong' });
      if (pitchClass(n.midi) === pc(k)) {
        staff.mark(t[k], 'hit');
        build.place(k, n.midi);
        session.cur++;
        if (session.cur >= t.length) finishSoon(700);
        else markCurrent();
      } else {
        session.wrong++;
        staff.ghost(t[k], n.midi);
      }
      return;
    }

    if (session.mode === 'go') {
      const k = session.cur;
      const lw = session.lastWrong;
      // A quick, correct replay of the note she just missed fixes it in place.
      if (lw && lw.k === k - 1 && n.time - lw.time < FIX_WINDOW &&
          pitchClass(n.midi) === pc(k - 1) && (k >= t.length || pitchClass(n.midi) !== pc(k))) {
        session.grades.set(k - 1, 'fixed');
        log.event('judge', { k: k - 1, want: staff.laid[t[k - 1]].p, got: n.midi, grade: 'fixed' });
        staff.mark(t[k - 1], 'fixed');
        build.place(k - 1, n.midi);
        session.lastWrong = null;
        return;
      }
      if (k >= t.length) return;
      session.times[k] = n.time;
      log.event('judge', { k, want: staff.laid[t[k]].p, got: n.midi, grade: pitchClass(n.midi) === pc(k) ? 'hit' : 'wrong' });
      if (pitchClass(n.midi) === pc(k)) {
        session.grades.set(k, 'hit');
        staff.mark(t[k], 'hit');
        build.place(k, n.midi);
        session.lastWrong = null;
      } else {
        session.grades.set(k, 'wrong');
        staff.mark(t[k], 'wrong');
        staff.ghost(t[k], n.midi);
        session.lastWrong = { k, time: n.time };
      }
      session.cur++;
      if (session.cur >= t.length) finishSoon(FIX_WINDOW * 1000); // leave time for a last fix
      else markCurrent();
      return;
    }

    // Beat: judge against the nearest unjudged note in time.
    if (n.time < session.t0 - session.window) return; // count-in
    let best = -1, bestErr = Infinity;
    for (const [k, time] of session.expected) {
      if (session.grades.has(k)) continue;
      const err = Math.abs(n.time - time);
      if (err < session.window && err < bestErr) { best = k; bestErr = err; }
    }
    if (best < 0) { log.event('judge', { got: n.midi, grade: 'stray' }); return; }
    if (pitchClass(n.midi) !== pc(best)) {
      log.event('judge', { k: best, want: staff.laid[t[best]].p, got: n.midi, grade: 'wrong', err: Math.round((n.time - session.expected.get(best)) * 1000) });
      session.grades.set(best, 'wrong');
      staff.mark(t[best], 'wrong');
      staff.ghost(t[best], n.midi);
      return;
    }
    const grade = beatGrade(n.time - session.expected.get(best));
    log.event('judge', { k: best, want: staff.laid[t[best]].p, got: n.midi, grade, err: Math.round((n.time - session.expected.get(best)) * 1000) });
    session.grades.set(best, grade);
    staff.mark(t[best], 'hit ' + grade);
    build.place(best, n.midi);
  }

  function beatTick() {
    const now = engine.now();
    const beat = (now - session.t0) / session.beatSec;
    if (beat < 0) {
      count.textContent = String(Math.ceil(-beat));
      count.style.display = 'block';
    } else {
      count.style.display = 'none';
    }
    // Page along with her progress (not smooth scrolling, which would be a
    // timing cue in disguise).
    const next = staff.targets[[...session.expected.keys()].find((k) => !session.grades.has(k)) ?? staff.targets.length - 1];
    if (next != null) staff.show(next);
    for (const [k, time] of session.expected) {
      if (!session.grades.has(k) && now > time + session.window) {
        session.grades.set(k, 'miss');
        log.event('judge', { k, want: staff.laid[staff.targets[k]].p, grade: 'miss' });
        staff.mark(staff.targets[k], 'miss');
      }
    }
    if (now > session.end) finish();
  }

  function finishSoon(ms) {
    const s = session;
    setTimeout(() => { if (session === s) finish(); }, ms);
  }

  async function finish() {
    if (!session) return;
    const s = session;
    session = null;
    s.off();
    await engine.listen(false);
    count.style.display = 'none';
    const t = staff.targets, n = t.length;

    // Score, and leave review marks on the staff for going over it together.
    let result, chips;
    if (s.mode === 'learn') {
      result = scoreLearn(s.wrong);
      chips = [['🎯', s.wrong ? `${s.wrong} wrong ${s.wrong === 1 ? 'try' : 'tries'}` : 'no wrong notes']];
    } else if (s.mode === 'go') {
      const review = rhythmReview(staff.laid, t, s.times);
      for (const [k, m] of review.marks) if (m !== 'ok') staff.review(t[k], m, t[k - 1]);
      result = scoreGo(n, s.grades, review);
      chips = [
        ['🎯', `${Math.round(result.right * 10) / 10}/${n} notes`],
        ['🥁', Number.isFinite(review.rhythm) ? `rhythm ${Math.round(review.rhythm * 100)}%` : 'rhythm –'],
        ['⏸', review.stalls ? `${review.stalls} ${review.stalls === 1 ? 'stop' : 'stops'}` : 'no stops'],
      ];
    } else {
      for (let k = 0; k < n; k++) {
        const g = s.grades.get(k);
        if (g === 'early' || g === 'late') staff.review(t[k], g);
      }
      result = scoreBeat(n, s.grades);
      const c = result.counts;
      chips = [['✨', `${c.perfect} perfect`], ['👍', `${c.good + c.early + c.late} close`], ['❓', `${c.wrong + c.miss} missed`]];
    }
    const { stars } = result;
    log.endSession({ stars, chips: chips.map(([icon, text]) => `${icon} ${text}`), wrong: s.wrong,
      marks: [...staff.el.querySelectorAll('.review')].map((g) => g.getAttribute('class').replace('review ', '')) });
    song.plays = (song.plays ?? 0) + 1;
    song.best = Math.max(song.best ?? 0, stars);
    let joined = null;
    if (stars >= 2 && song.band < BAND.length) {
      joined = BAND[song.band];
      song.band++;
    }
    save();
    if (stars >= 2) {
      build.celebrate();
      engine.play(renderJingle(engine.ctx.sampleRate));
    }

    // Results sit over the scene, leaving the staff (and its marks) visible.
    setTimeout(() => {
      const legend = s.mode === 'go' && staff.el.querySelector('.review')
        ? h('div', { class: 'legend' }, '⏸ stopped · » rushed · « dragged')
        : s.mode === 'beat' && staff.el.querySelector('.review') ? h('div', { class: 'legend' }, '‹ early · › late') : null;
      build.el.append(h('div', { class: 'results-bar' },
        h('div', { class: 'stars' }, [0, 1, 2].map((k) => h('span', { class: 'star' + (k < stars ? ' on' : '') }, '★'))),
        h('div', { class: 'chips' }, chips.map(([icon, text]) => h('span', { class: 'chip' }, icon, ' ', text)), legend),
        joined ? h('div', { class: 'joined' },
          h('img', { class: 'join-sprite hop', src: bandSprite(joined) }),
          h('div', {}, `${joined.name} joined!`)) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary big', onclick: () => { rebuild(); ready(); } }, '🔁'),
          h('a', { class: 'btn big', href: `#/band/${song.id}` }, '🎸'))));
    }, stars >= 2 ? 1200 : 300);
  }

  return () => {
    cancelAnimationFrame(raf);
    abort();
    engine.listen(false);
  };
}
