import { h, flash } from '../dom.js';
import { getSong, getState, save } from '../store.js';
import { createTrack } from '../track.js';
import { BAND, bandSprite, characterUrl, texture } from '../pixels.js';
import { engine } from '../engine.js';
import { renderBand } from '../instruments.js';
import { totalBeats } from '../music.js';

export function band(root, id) {
  const song = getSong(id);
  if (!song) { location.hash = '#/'; return; }
  const st = getState();
  song.muted ??= [];
  let playing = null;
  let raf = 0;

  const members = BAND.map((m, i) => {
    const unlocked = i < song.band;
    const img = h('img', { class: 'member-sprite' + (unlocked ? '' : ' locked'), src: i === 0 ? characterUrl(st.character) : bandSprite(m) });
    const el = h('button', {
      class: 'member' + (song.muted.includes(m.id) ? ' muted' : ''), disabled: !unlocked || null,
      onclick: () => {
        const k = song.muted.indexOf(m.id);
        if (k >= 0) song.muted.splice(k, 1); else song.muted.push(m.id);
        save();
        el.classList.toggle('muted', k < 0);
      },
    }, img, h('div', { class: 'member-name' }, unlocked ? m.name : '?'),
      h('div', { class: 'member-block', style: `background-image:url(${texture('grass')})` }));
    return { m, el, img, unlocked };
  });

  const track = createTrack(song, { extraBeats: 0, rowH: 40 });
  const playBtn = h('button', { class: 'btn primary huge', onclick: () => (playing ? stop() : start()) }, '▶ Play');
  const need = BAND.length - song.band;

  root.append(h('div', { class: 'screen band' },
    h('header', { class: 'bar' },
      h('a', { class: 'btn', href: `#/song/${song.id}` }, '⬅'),
      h('div', { class: 'song-title' }, song.title),
      h('div', { class: 'spacer' }),
      h('a', { class: 'btn primary', href: `#/play/${song.id}` }, '🎹 Practice')),
    h('div', { class: 'band-stage' }, members.map((x) => x.el)),
    h('div', { class: 'band-hint' }, need > 0
      ? `Play your song with 2 or more stars to meet the next band member! (${need} more to find)`
      : 'Your whole band is here! 🎉 Tap a band member to make them quiet.'),
    h('div', { class: 'row center' }, playBtn),
    h('div', { class: 'track-box small' }, track.el)));

  async function start() {
    if (!song.notes.length) return;
    await engine.start();
    const active = members.filter((x) => x.unlocked && !song.muted.includes(x.m.id));
    const { audio, lead } = renderBand(song, active.map((x) => x.m.instrument), engine.ctx.sampleRate);
    const { startTime } = engine.play(audio);
    const beatSec = 60 / song.bpm;
    playing = { t0: startTime + lead, beatSec, end: startTime + lead + totalBeats(song.notes) * beatSec + 0.3, last: -1, active };
    playBtn.textContent = '⏹ Stop';
    loop();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const beat = (engine.now() - playing.t0) / playing.beatSec;
    track.setPlayhead(Math.max(0, beat));
    if (beat > 0) track.follow(beat, 'continuous');
    // Bounce everyone on each new note; the drummer bounces on every beat.
    const idx = track.laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
    if (idx !== playing.last && idx >= 0) {
      playing.last = idx;
      for (const x of playing.active) if (x.m.instrument !== 'drums') flash(x.img, 'hop', 300);
      if (track.laid[idx].p != null) flash(track.blocks[idx], 'pop', 300);
    }
    const whole = Math.floor(beat);
    if (whole !== playing.lastBeat && beat >= 0) {
      playing.lastBeat = whole;
      for (const x of playing.active) if (x.m.instrument === 'drums') flash(x.img, 'hop', 250);
    }
    if (engine.now() > playing.end) stop();
  }

  function stop() {
    cancelAnimationFrame(raf);
    engine.stopAll();
    playing = null;
    track.setPlayhead(null);
    playBtn.textContent = '▶ Play';
  }

  return () => { if (playing) stop(); };
}
