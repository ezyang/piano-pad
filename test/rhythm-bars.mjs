// Tests for rhythm pieces, bar by bar: node test/rhythm-bars.mjs
// Replays a real Zebra session (the notes the detector heard, ms + midi)
// through rhythm-bars.js with a virtual clock.
import assert from 'node:assert/strict';
import { rhythmBars, PAUSE_MS } from '../src/app/rhythm-bars.js';
import { sameNote } from '../src/app/music.js';

// Zebra (its page, played twice): [midi, beats].
const G = 67, A = 69, B = 71, D = 62, E = 64;
const ZEBRA = [[G, 0.5], [G, 0.5], [G, 0.5], [G, 0.5], [G, 1], [G, 1], [D, 1], [E, 1], [D, 2],
  [A, 0.5], [A, 0.5], [A, 0.5], [A, 0.5], [A, 1], [A, 1], [D, 1], [E, 1], [D, 2],
  [G, 0.5], [G, 0.5], [G, 0.5], [G, 0.5], [G, 1], [G, 1], [D, 1], [E, 1], [D, 2],
  [B, 2], [A, 1], [A, 1], [G, 4]];

// A real session: every note the detector heard ([ms, midi]), and 'tap' where
// the grown-up two-finger-tapped the bar on (all but the two one-note bars:
// each bar sat after her last note, waiting for the next bar's first).
const SESSION = [[8329, 64], [10310, 67], [10611, 67], [10943, 67], [11326, 67], [11631, 67], [12233, 67], [12450, 'tap'],
  [13259, 62], [13937, 64], [14592, 62], [15183, 'tap'], [16921, 69], [17317, 69], [17614, 69], [17955, 69], [18266, 69], [19149, 'tap'],
  [20443, 64], [21999, 'tap'], [22798, 67], [23086, 67], [23427, 67], [23769, 67], [24067, 67], [24771, 67], [24866, 'tap'],
  [25435, 62], [26081, 64], [26801, 62], [27666, 'tap'], [28026, 71], [29300, 69], [29908, 69], [30300, 'tap'], [30501, 67],
  [38661, 67], [39028, 67], [39295, 67], [39604, 67], [39961, 67], [40644, 67], [40917, 'tap'], [41643, 62], [42278, 64], [42891, 62], [43750, 'tap'],
  [44953, 69], [45321, 69], [45630, 69], [45984, 69], [46302, 69], [46971, 69], [47267, 'tap'], [48321, 64], [49108, 62], [49966, 'tap'],
  [50331, 67], [50622, 67], [50953, 67], [51332, 67], [51657, 67], [52286, 67], [52550, 'tap'], [53675, 64], [54380, 62], [55286, 'tap'],
  [55759, 71], [56446, 59], [57012, 69], [57604, 69], [57950, 'tap'], [58238, 67]];

// The piece as adventure.js lays it out: { p, d, bar, pass }, and its bars.
function piece(notes, times = 2) {
  const seq = [];
  const pageBars = Math.ceil(notes.reduce((s, [, d]) => s + d, 0) / 4);
  for (let pass = 0; pass < times; pass++) {
    let start = 0;
    for (const [p, d] of notes) { seq.push({ p, d, pass, bar: pass * pageBars + Math.floor(start / 4 + 1e-9) }); start += d; }
  }
  const barKs = [];
  seq.forEach((x, k) => (barKs[x.bar] ??= []).push(k));
  return { seq, bars: barKs.filter(Boolean) };
}

// A judge with a virtual clock (ms) and an owner that moves on a bar on a pass.
function harness(notes = ZEBRA, times = 2) {
  const { seq, bars } = piece(notes, times);
  const N = seq.length;
  let now = 0, cur = 0, timers = [], id = 0;
  const out = { bars: [], models: 0, judges: [], heard: [] };
  const passEnd = (k) => k + 1 >= N || seq[k + 1].pass !== seq[k].pass;
  const barOf = (k) => bars.findIndex((ks) => ks.includes(k));
  const j = rhythmBars({
    seq, bars, pitched: true, same: (x, p) => sameNote(x, p, false), passEnd, cur: () => cur, bpm: 80,
    timer: { set: (fn, ms) => { timers.push({ id: ++id, at: now + ms, fn }); return id; }, clear: (t) => { timers = timers.filter((x) => x.id !== t); } },
    on: {
      judge: (x) => out.judges.push(x),
      bar: (x) => out.bars.push({ ...x, t: now }),
      heard: (k) => out.heard.push([now, k]),
      pass: (carry) => {
        const bi = barOf(cur);
        if (bi + 1 >= bars.length) { cur = N; return; }
        cur = bars[bi + 1][0];
        if (seq[cur].pass !== seq[cur - 1].pass) carry = [];
        j.start(carry);
      },
      model: () => { out.models++; },
    },
  });
  const run = (t) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const x = timers[0];
      if (!x || x.at > t) break;
      timers.shift();
      now = x.at;
      x.fn();
    }
    now = t;
  };
  return {
    j, out, seq, bars,
    get cur() { return cur; }, set cur(k) { cur = k; },
    note(t, midi) { run(t); if (cur < N) j.note(midi, t / 1000); },
    wait(ms) { run(now + ms); },
  };
}

// The session replayed bar by bar, as it went (each bar from where the
// grown-up's tap left her), with no taps: every bar passes on its own.
{
  const hs = harness();
  const segs = [[]];
  for (const [t, x] of SESSION) { if (x === 'tap') segs.push([]); else segs.at(-1).push([t, x]); }
  // The first time ends on its one-note bar, which passes at once; the
  // second time's first notes then belong to the next segment.
  const bySeg = [];
  for (const seg of segs) {
    const before = hs.out.bars.length;
    for (const [t, midi] of seg) hs.note(t, midi);
    hs.wait(5000);
    bySeg.push(hs.out.bars.slice(before));
  }
  const all = hs.out.bars;
  assert.equal(hs.out.models, 0, 'no bar sent to the band');
  assert.equal(hs.cur, hs.seq.length, 'the piece finished');
  assert.equal(all.length, hs.bars.length, 'one verdict per bar');
  assert.ok(all.every((b) => b.ok && b.by === 'detector'), JSON.stringify(all));
  const whys = all.map((b) => b.why ?? 'next-note');
  // Where she stopped at the bar line after hearing it all: 'paused'.
  assert.ok(whys.filter((w) => w === 'paused').length >= 9, whys.join(' '));
  // A pause passes ~1 s after a ta (her ta ≈ 650 ms), not hanging until the next bar.
  const bar0 = all[0];
  assert.equal(bar0.why, 'paused');
  assert.ok(bar0.t - 12233 >= PAUSE_MS && bar0.t - 12233 < 1300, `bar 0 passed ${bar0.t - 12233} ms after her last note`);
  // The stray E before she started, and the ringing B4 heard again as B3, failed nothing.
  assert.ok(hs.out.judges.some((x) => x.why === 'before-bar'));
  assert.ok(hs.out.judges.some((x) => x.why === 'echo' && x.got === 59));
  // Every note heard was marked as heard at once.
  assert.equal(hs.out.heard.length, SESSION.filter(([, x]) => x !== 'tap').length - 2);
  if (process.env.VERBOSE) console.log(all.map((b) => `${b.bar}:${b.why ?? 'next-note'}@${Math.round(b.t)}`).join(' '));
}

// At her tempo, playing on into the next bar never trips the pause: a ta
// then the next bar 700 ms later, a ta-a then 1350 ms later.
{
  const hs = harness();
  const beat = 650;
  let t = 1000;
  for (const [p, d] of ZEBRA.slice(0, 18)) { hs.note(t, p); t += d * beat * 1.08; } // a touch slow
  hs.note(t, ZEBRA[18][0]);
  assert.equal(hs.out.bars.length, 4);
  assert.ok(hs.out.bars.every((b) => b.ok && b.why == null), JSON.stringify(hs.out.bars));
}

// A wrong rhythm still fails when she pauses: the four ti's as slow as the ta.
{
  const hs = harness();
  [0, 600, 1200, 1800, 2400, 3000].forEach((t) => hs.note(1000 + t, G));
  hs.wait(4000);
  assert.equal(hs.out.bars.length, 1);
  assert.equal(hs.out.bars[0].ok, false);
  assert.equal(hs.out.bars[0].why, 'quick-too-slow');
  assert.equal(hs.out.bars[0].paused, true);
  assert.equal(hs.out.models, 1);
  assert.equal(hs.cur, 0, 'she tries the bar again');
}

// ...and passes played right, then a stop: judged on the 5 intervals she played.
{
  const hs = harness();
  [0, 330, 660, 990, 1320, 1980].forEach((t) => hs.note(1000 + t, G));
  hs.wait(PAUSE_MS - 1);
  assert.equal(hs.out.bars.length, 0, 'not before the wait');
  hs.wait(3000);
  assert.deepEqual(hs.out.bars.map((b) => [b.ok, b.why, b.iois.length]), [[true, 'paused', 5]]);
  assert.equal(hs.cur, 6);
}

// A wrong letter, then a stop: the band shows her the bar.
{
  const hs = harness();
  hs.note(1000, D); hs.note(1650, A); // D then A where E belongs
  hs.wait(5000);
  assert.equal(hs.out.models, 0, 'bar 0 is all G; D/A before it are before-bar');
  [0, 330, 660, 990, 1320, 1980].forEach((t) => hs.note(7000 + t, G));
  hs.wait(3000);
  hs.note(12000, D); hs.note(12650, A);
  hs.wait(5000);
  assert.deepEqual(hs.out.bars.map((b) => [b.ok, b.why]), [[true, 'paused'], [false, 'wrong-note']]);
  assert.equal(hs.out.models, 1);
}

// One short and a long stop mid-piece: probably unheard, passes after 3 s.
{
  const hs = harness();
  [0, 330, 660, 990, 1320].forEach((t) => hs.note(1000 + t, G));
  hs.wait(2900);
  assert.equal(hs.out.bars.length, 0);
  hs.wait(200);
  assert.deepEqual(hs.out.bars.map((b) => [b.ok, b.why]), [[true, 'unheard-paused']]);
}

// A one-note bar mid-piece passes on a pause.
{
  const hs = harness([[G, 4], [D, 4], [E, 4]], 1);
  hs.note(1000, G);
  hs.wait(4000);
  assert.deepEqual(hs.out.bars.map((b) => [b.ok, b.why]), [[true, 'paused']]);
}

console.log('rhythm-bars ok');
