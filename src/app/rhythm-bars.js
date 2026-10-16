// Rhythm pieces (Reading, Zebra), bar by bar: the judging, apart from the screen
// (adventure.js piece() owns the page, the band's model and the grown-up's
// step), so it can be replayed in tests (test/rhythm-bars.mjs).
//
// entries: onset times (seconds) for the current bar's notes and on into the
// next bar (null: a note she played that the detector missed). A bar passes
// when its rhythm is roughly right at her own tempo (scoring.js barRhythm)
// and, if `pitched`, every note was the right letter:
//   - she plays on: the next bar's first onset times this bar's last note
//     (m + 1 onsets, the extra ones carried into the next bar);
//   - she stops at the bar line (a 5-year-old looks at the page): all m
//     notes heard and no onset for pauseWait() → judged on the m - 1
//     intervals she did play ('paused');
//   - one short and a long stop (UNHEARD_MS): the detector likely missed a
//     note → passes ('unheard-end' at the end of a time through, else
//     'unheard-paused');
//   - the end of a time through needs only its m notes.
// An off bar (or a wrong letter) → model(): the band plays it.
import { barRhythm, missedNote } from './scoring.js';

// How long after the bar's last onset a stop counts as a pause: 1.5× that
// note's length at her tempo, at least PAUSE_MS. On 10/12 she played on
// into the next bar 590–720 ms after a ta (her ta ≈ 650 ms) and 1220–1380
// ms after a ta-a, so that's ≈ 1 s after a ta, ≈ 2 s after a ta-a.
export const PAUSE_MS = 700, PAUSE_X = 1.5, PAUSE_MAX_MS = 3000;
export const UNHEARD_MS = 3000;

// seq[k]: { p, d, bar, pass }; bars: runs of k, one per bar.
// cur(): the k she's at (the current bar's first note).
// same(midi, p): the right letter. passEnd(k): k ends a time through.
// on: { judge(data), bar(data), heard(k), pass(carry), model() }.
//   pass(carry) moves the owner on a bar; it then calls start(carry).
export function rhythmBars({ seq, bars, pitched, same, passEnd, cur, bpm, on, timer = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) } }) {
  const N = seq.length;
  const barIndexOf = [];
  bars.forEach((ks, b) => { for (const k of ks) barIndexOf[k] = b; });
  const want = (k) => seq[k].p;
  const d = (kk) => (kk != null && kk < N ? seq[kk].d : null);
  let entries = [], wrong = false, endTimer = 0, pauseTimer = 0;
  let beat = 60 / (bpm || 90); // her beat (s), from the last bar timed

  const clearTimers = () => { timer.clear(endTimer); timer.clear(pauseTimer); endTimer = pauseTimer = 0; };
  const barStart = () => bars[barIndexOf[cur()]][0];

  function note(midi, time) {
    const k0 = barStart(), k = k0 + entries.length;
    if (k >= N) return;
    const is = (kk) => kk < N && same(midi, want(kk));
    if (is(k)) entries.push(time);
    else if (pitched && is(k + 1) && !same(want(k + 1), want(k))) entries.push(null, time); // k went unheard
    else {
      // Before the bar's first note she's finding her place; and the letter
      // she just played again is the detector re-hearing a held note (on
      // 10/12 a ringing B4 came back as B3 700 ms on). Neither fails a bar.
      const jl = entries.findLastIndex((x) => x != null);
      const why = !entries.length ? 'before-bar' : jl >= 0 && same(midi, want(k0 + jl)) ? 'echo' : null;
      on.judge({ k, want: want(k), got: midi, grade: 'other', ...(why ? { why } : {}) });
      if (!pitched || why) return;
      wrong = true;
      // A wrong letter and then a stop: the band shows her the bar.
      clearTimers();
      const bi = barIndexOf[cur()];
      pauseTimer = timer.set(() => { pauseTimer = 0; if (barIndexOf[cur()] === bi && wrong) decide(bi, entries, true); }, UNHEARD_MS);
      return;
    }
    const kk = k0 + entries.length - 1;
    on.judge({ k: kk, want: want(kk), got: midi, grade: 'hit', by: 'detector' });
    on.heard(kk);
    judge();
  }

  function judge() {
    const bi = barIndexOf[cur()], ks = bars[bi], m = ks.length, last = passEnd(ks.at(-1)); // the end of a time through
    const bar = seq[ks[0]].bar;
    clearTimers();
    if (entries.length === m - 1 && !wrong) {
      // One short and she's stopped: likely a note not heard; don't leave her waiting.
      endTimer = timer.set(() => {
        endTimer = 0;
        if (barIndexOf[cur()] !== bi || entries.length !== m - 1 || wrong) return;
        on.bar({ bar, ok: true, why: last ? 'unheard-end' : 'unheard-paused', by: 'detector' });
        pass([]);
      }, UNHEARD_MS);
    }
    if (!last && entries.length === m) {
      // All of the bar heard: if she stops here, judge what she played.
      pauseTimer = timer.set(() => {
        pauseTimer = 0;
        if (barIndexOf[cur()] === bi && entries.length === m) decide(bi, entries.slice(0, m), true);
      }, pauseWait(ks, entries.slice(0, m)));
    }
    const need = last ? m : m + 1;
    if (entries.length < need) return;
    decide(bi, entries.slice(0, need), false);
  }

  // win: the onsets judged (m + 1, or m at the end or after a pause).
  function decide(bi, win, paused) {
    clearTimers();
    const ks = bars[bi], m = ks.length, bar = seq[ks[0]].bar;
    const why = paused ? { paused: true } : {};
    if (wrong) { on.bar({ bar, ok: false, why: 'wrong-note', ...why, by: 'detector' }); fail(); return; }
    const gap = win.indexOf(null);
    if (gap >= 0) { on.bar({ bar, ok: true, why: 'unheard', unheard: ks[0] + gap, ...why, by: 'detector' }); pass(entries.slice(m)); return; }
    const iois = win.slice(1).map((x, j) => x - win[j]);
    const ms = iois.map((x) => Math.round(x * 1000));
    if (win.length > m) {
      const next = bars[bi + 1];
      const j = missedNote([...ks.map(d), d(next[0]), d(next[1]) ?? d(bars[bi + 2]?.[0])], iois);
      if (j != null) {
        on.bar({ bar, iois: ms, ok: true, why: 'unheard', unheard: ks[0] + j + 1, by: 'detector' });
        // Line the next bar up: the last onset was its second note.
        const first = j < m - 1 ? win[m - 1] : win[m - 1] + iois[m - 1] * d(ks[m - 1]) / (d(ks[m - 1]) + d(next[0]));
        pass([first, win[m], ...entries.slice(win.length)]);
        return;
      }
    }
    const r = barRhythm(ks.slice(0, iois.length).map(d), iois);
    const verdict = r.why ? { why: r.why, ...why } : paused ? { why: 'paused' } : {};
    on.bar({ bar, iois: ms, ok: r.ok, ...verdict, by: 'detector' });
    if (!r.ok) { fail(); return; }
    beat = beatOf(ks, win);
    pass(entries.slice(m));
  }

  // How long to wait, after the bar's last onset, before taking a stop as a pause.
  // win: the bar's onsets so far, for her tempo in it.
  function pauseWait(ks, win = []) {
    return Math.min(PAUSE_MAX_MS, Math.max(PAUSE_MS, PAUSE_X * d(ks.at(-1)) * beatOf(ks, win) * 1000));
  }
  // Her beat (s) in a bar: the median interval per beat, else the last bar's.
  function beatOf(ks, win) {
    const beats = [];
    for (let j = 1; j < win.length && j < ks.length + 1; j++) {
      if (win[j] != null && win[j - 1] != null) beats.push((win[j] - win[j - 1]) / d(ks[j - 1]));
    }
    if (!beats.length) return beat;
    beats.sort((a, b) => a - b);
    return beats[beats.length >> 1];
  }

  function pass(carry) {
    clearTimers();
    entries = [];
    wrong = false;
    on.pass(carry);
  }
  function fail() {
    reset();
    on.model();
  }
  // The owner has moved on a bar: judge the onsets already played in it.
  function start(carry) {
    entries = [...carry];
    wrong = false;
    if (entries.length) judge();
  }
  // Start the bar over (the band's model, the mic switch, the grown-up's
  // step or back).
  function reset() {
    clearTimers();
    entries = [];
    wrong = false;
  }

  return { note, start, reset, pauseWait, get entries() { return entries; } };
}
