// Practice: notation on a staff, a tower that builds as she plays.
//   learn — waits for the right note (a wrong one shows a ghost note)
//   go    — "keep going": any note advances; wrong ones are marked, a quick
//           fix right after a mistake repairs it; hesitations are counted
//   beat  — count-in and a moving playhead; graded on timing
import { h } from '../dom.js';
import { getSong, getState, save } from '../store.js';
import { createStaff } from '../staff.js';
import { createBuild } from '../build.js';
import { pitchClass, totalBeats } from '../music.js';
import { characterUrl, BAND, bandSprite } from '../pixels.js';
import { engine } from '../engine.js';
import { testKeyboard } from '../keyboard.js';
import { renderJingle, renderTick } from '../instruments.js';

const MODES = [['learn', '🐢 Learn'], ['go', '🏃 Keep going'], ['beat', '🥁 Beat']];
const GRADE_SCORE = { perfect: 1, good: 0.75, ok: 0.45, wrong: 0.2, miss: 0 };
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
    staff = createStaff(song, { s: Math.max(14, Math.min(22, Math.round(innerHeight / 40))) });
    staffBox.replaceChildren(staff.el);
    build = createBuild(staff.targets.length, characterUrl(st.character));
    sceneBox.replaceChildren(build.el);
  }

  // --- header ---
  const modeBtns = MODES.map(([m, label]) =>
    h('button', { class: 'seg' + (m === mode ? ' on' : ''), 'data-mode': m, onclick: () => setMode(m) }, label));
  function setMode(m) {
    if (session) return;
    mode = m;
    st.playMode = m;
    save();
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === m);
    speedBox.style.display = m === 'beat' ? '' : 'none';
  }
  const bpmLabel = h('span', { class: 'bpm' }, String(bpm));
  const setBpm = (v) => { if (session) return; bpm = Math.max(40, Math.min(160, v)); song.playBpm = bpm; save(); bpmLabel.textContent = String(bpm); };
  const speedBox = h('div', { class: 'speed' },
    h('button', { class: 'btn small', onclick: () => setBpm(bpm - 10) }, '🐌'), bpmLabel,
    h('button', { class: 'btn small', onclick: () => setBpm(bpm + 10) }, '🐇'));
  const meterFill = h('div', { class: 'meter-fill' });
  const ear = h('div', { class: 'ear', title: 'Microphone' }, '👂', h('div', { class: 'meter' }, meterFill));
  const overlay = h('div', { class: 'overlay' });
  const count = h('div', { class: 'countin' });

  root.append(h('div', { class: 'screen play' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: `#/song/${song.id}` }, '⬅'),
      h('div', { class: 'song-title' }, song.title),
      h('div', { class: 'spacer' }),
      h('div', { class: 'segs' }, modeBtns),
      speedBox, ear),
    h('div', { class: 'stage' }, sceneBox, staffBox, count, overlay),
    testKeyboard()));
  rebuild();
  setMode(mode);
  showStart();
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
    overlay.style.display = 'none';
    try {
      await engine.listen(true);
    } catch (err) {
      overlay.replaceChildren(h('div', { class: 'panel' }, 'I need the microphone to hear the piano! 🎤', h('br'), String(err.message ?? err)),
        h('button', { class: 'btn primary', onclick: begin }, 'Try again'));
      overlay.style.display = '';
      return;
    }
    rebuild();
    const t = staff.targets;
    session = {
      mode, cur: 0, wrong: 0, grades: new Map(), times: [], lastWrong: null,
      off: engine.onNote(onNote),
    };
    if (mode === 'beat') {
      const beatSec = 60 / bpm;
      Object.assign(session, {
        beatSec,
        t0: engine.now() + 4 * beatSec + 0.15,
        window: Math.min(0.4, 0.5 * beatSec),
      });
      session.expected = new Map(t.map((i, k) => [k, session.t0 + staff.laid[i].start * beatSec]));
      session.end = session.t0 + totalBeats(song.notes) * beatSec + 0.4;
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
    staff.follow(staff.laid[i].start);
  }

  function onNote(n) {
    if (!session) return;
    const t = staff.targets;
    if (session.mode === 'learn') {
      const k = session.cur;
      if (k >= t.length) return;
      if (pitchClass(n.midi) === pc(k)) {
        staff.mark(t[k], 'hit');
        build.place(k, n.midi);
        session.cur++;
        if (session.cur >= t.length) setTimeout(finish, 700);
        else markCurrent();
      } else {
        session.wrong++;
        staff.ghost(t[k], n.midi);
        build.shake();
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
        staff.mark(t[k - 1], 'fixed');
        build.place(k - 1, n.midi);
        session.lastWrong = null;
        return;
      }
      if (k >= t.length) return;
      session.times[k] = n.time;
      if (pitchClass(n.midi) === pc(k)) {
        session.grades.set(k, 'hit');
        staff.mark(t[k], 'hit');
        build.place(k, n.midi);
        session.lastWrong = null;
      } else {
        session.grades.set(k, 'wrong');
        staff.mark(t[k], 'wrong');
        staff.ghost(t[k], n.midi);
        build.place(k, n.midi, 'cracked');
        session.lastWrong = { k, time: n.time };
      }
      session.cur++;
      if (session.cur >= t.length) setTimeout(finish, FIX_WINDOW * 1000); // leave time for a last fix
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
    if (best < 0) return;
    if (pitchClass(n.midi) !== pc(best)) {
      session.grades.set(best, 'wrong');
      staff.mark(t[best], 'wrong');
      staff.ghost(t[best], n.midi);
      build.place(best, n.midi, 'cracked');
      return;
    }
    const grade = bestErr < 0.08 ? 'perfect' : bestErr < 0.16 ? 'good' : 'ok';
    session.grades.set(best, grade);
    staff.mark(t[best], 'hit ' + grade);
    build.place(best, n.midi);
  }

  function beatTick() {
    const now = engine.now();
    const beat = (now - session.t0) / session.beatSec;
    if (beat < 0) {
      count.textContent = String(Math.ceil(-beat));
      count.style.display = '';
    } else {
      count.style.display = 'none';
    }
    staff.setPlayhead(Math.max(0, beat));
    if (beat > 0) staff.follow(beat, 'continuous');
    for (const [k, time] of session.expected) {
      if (!session.grades.has(k) && now > time + session.window) {
        session.grades.set(k, 'miss');
        staff.mark(staff.targets[k], 'miss');
      }
    }
    if (now > session.end) finish();
  }

  // Gaps much longer than the music asks for, relative to her own pace.
  function hesitations(s) {
    const t = staff.targets, ratios = [];
    for (let k = 1; k < t.length; k++) {
      const beats = staff.laid[t[k]].start - staff.laid[t[k - 1]].start;
      const gap = s.times[k] - s.times[k - 1];
      if (beats > 0 && Number.isFinite(gap)) ratios.push({ r: gap / beats, gap });
    }
    if (!ratios.length) return 0;
    const med = [...ratios].sort((a, b) => a.r - b.r)[ratios.length >> 1].r;
    return ratios.filter((x) => x.r > 1.7 * med && x.gap > 0.5).length;
  }

  async function finish() {
    if (!session) return;
    const s = session;
    session = null;
    s.off();
    await engine.listen(false);
    staff.setPlayhead(null);
    count.style.display = 'none';
    const n = staff.targets.length;

    let stars, detail;
    if (s.mode === 'learn') {
      stars = s.wrong <= 1 ? 3 : s.wrong <= 4 ? 2 : 1;
      detail = `wrong notes: ${s.wrong}`;
    } else if (s.mode === 'go') {
      let right = 0;
      for (let k = 0; k < n; k++) right += { hit: 1, fixed: 0.6 }[s.grades.get(k)] ?? 0;
      const hes = hesitations(s);
      const score = 0.6 * (right / n) + 0.4 * Math.max(0, 1 - hes / Math.max(1, (n - 1) / 3));
      stars = score >= 0.9 ? 3 : score >= 0.7 ? 2 : score >= 0.4 ? 1 : 0;
      detail = `notes ${Math.round(right * 10) / 10}/${n} · hesitations ${hes}`;
    } else {
      const score = [...Array(n).keys()].reduce((a, k) => a + GRADE_SCORE[s.grades.get(k) ?? 'miss'], 0) / Math.max(1, n);
      stars = score >= 0.85 ? 3 : score >= 0.6 ? 2 : score >= 0.3 ? 1 : 0;
      const c = { perfect: 0, good: 0, ok: 0, wrong: 0, miss: 0 };
      for (let k = 0; k < n; k++) c[s.grades.get(k) ?? 'miss']++;
      detail = `✨ ${c.perfect} · 👍 ${c.good + c.ok} · wrong ${c.wrong} · missed ${c.miss}`;
    }
    song.plays = (song.plays ?? 0) + 1;
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

    setTimeout(() => {
      overlay.replaceChildren(h('div', { class: 'panel results' },
        h('div', { class: 'stars' }, [0, 1, 2].map((k) => h('span', { class: 'star' + (k < stars ? ' on' : '') }, '★'))),
        joined ? h('div', { class: 'joined' },
          h('img', { class: 'join-sprite hop', src: bandSprite(joined) }),
          h('div', {}, `${joined.name} joined your band!`)) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary big', onclick: () => { rebuild(); showStart(); } }, '🔁 Again'),
          h('a', { class: 'btn big', href: `#/band/${song.id}` }, '🎸 Band'),
          h('a', { class: 'btn big', href: `#/song/${song.id}` }, '✏️')),
        h('div', { class: 'detail' }, detail)));
      overlay.style.display = '';
    }, stars >= 2 ? 1200 : 300);
  }

  return () => {
    cancelAnimationFrame(raf);
    if (session) { session.off(); session = null; }
    engine.listen(false);
  };
}
