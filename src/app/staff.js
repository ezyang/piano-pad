// Practice notation, laid out like a page: the song wraps into systems (lines)
// that each start with a clef and are justified to the full width. Treble,
// bass, or grand staff (middle C and up on treble). Engraving-style spacing,
// so width isn't a cue for rhythm; she reads the symbols. Optional letter
// names under the notes.
//
// Only `visible` systems show at once. show(i) pages so the line with note i
// is on screen with (when there's room) the next line below it: a discrete
// line-by-line step, never motion tied to time.
import { layout, isSharp, bars as barsOf, meter } from './music.js';
import { labelFor } from './labels.js';
import { h, svg } from './dom.js';

const STEP_OF = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C# D D# E F F# G G# A A# B
const step = (m) => Math.floor(m / 12) * 7 + STEP_OF[((m % 12) + 12) % 12]; // diatonic index
const REF = { treble: step(64), bass: step(43) }; // bottom line: E4 / G2

export function resolveClef(song) {
  if (song.clef && song.clef !== 'auto') return song.clef;
  const ps = song.notes.filter((n) => n.p != null).map((n) => n.p);
  if (!ps.length || ps.every((p) => p >= 57)) return 'treble';
  if (ps.every((p) => p <= 64)) return 'bass';
  return 'grand';
}

// Vertical metrics for one system. `letters` is the label mode under notes:
// 'letters' | 'fingers' | 'book' | 'rhythm' | 'none' (or a boolean for
// letters/none), or a list of them for several rows (e.g. rhythm words
// with letters below).
const labelMode = (letters) => (letters === true ? 'letters' : letters === false ? 'none' : Array.isArray(letters) ? letters[0] ?? 'none' : letters);
const labelRows = (letters) => (Array.isArray(letters) ? letters : [labelMode(letters)]).filter((m) => m !== 'none');
const ROW = 1.7; // label row pitch, in staff spaces
const CHORD_ROW = 1.25; // a chord's letters, stacked (staff spaces)

// below: extra staff spaces under the staff (left-hand fingers under down stems).
// above: extra staff spaces over the staff (stacked chord fingers).
function metrics(s, clef, letters, below = 0, above = 0) {
  const top = s * (3.2 + above); // room for ledger lines above
  const staves = [];
  if (clef === 'grand') {
    staves.push({ clef: 'treble', bottom: top + 4 * s });
    staves.push({ clef: 'bass', bottom: top + 4 * s + 4.6 * s + 4 * s });
  } else {
    staves.push({ clef, bottom: top + 4 * s });
  }
  const last = staves[staves.length - 1].bottom;
  const letterY = last + s * (3.4 + below);
  const rows = labelRows(letters).length;
  return { staves, letterY, height: rows ? letterY + s * 1.1 + (rows - 1) * s * ROW : last + s * (3 + below) };
}
export const systemHeight = (s, clef, letters, below = 0, above = 0) => metrics(s, clef, letters, below, above).height;
// Room a song needs over the staff for a chord's stacked fingers (5 over 1).
export const roomAbove = (song) => (song.notes.some((n) => n.f != null && n.also?.some((o) => o.f != null && (o.hand ?? n.hand) === n.hand)) ? 1.4 : 0);
// Notes may carry `hand: 'R' | 'L'` (as the book draws them: right hand
// stems up, fingers above; left hand stems down, fingers below the stem).
// Otherwise stems go by pitch. Room a song needs for that under the staff:
export const roomBelow = (song) => (song.notes.some((n) => (n.hand === 'L' || n.also?.some((o) => o.hand === 'L')) && n.p != null) ? 3.6 : 0);
// Extra rows for a chord's stacked letters.
const chordRows = (song) => Math.max(0, ...song.notes.map((n) => n.also?.length ?? 0));

// Book extras: song.sharps (a key signature: letters, e.g. ['F']),
// song.repeat (an end-repeat sign), and `fingersAbove` (finger numbers above
// the staff, as a book prints them: each note's `f`, or fingersAbove(i)
// when it's a function of the note index).
export function createStaff(song, { s = 20, width = 1000, letters = 'letters', visible = 2, fingersAbove = false } = {}) {
  const mode = labelMode(letters), rows = labelRows(letters);
  const label = (g, m, x, y, finger, beats) => rows.forEach((md, r) => {
    const { text, fallback } = labelFor(m, md, finger, beats, song.position);
    if (text) g.append(svg('text', { x, y: y + r * s * ROW, class: 'letter' + (md === 'fingers' && !fallback ? ' finger' : '') + (fallback ? ' fallback' : '') + (md === 'rhythm' ? ' word' : '') }, text));
  });
  const clef = resolveClef(song);
  const laid = layout(song.notes);
  const m0 = metrics(s, clef, letters, roomBelow(song), roomAbove(song));
  const { staves, letterY } = m0;
  const H = m0.height + (rows.length ? chordRows(song) * s * CHORD_ROW : 0);
  // On a grand staff a note with a hand goes on that hand's staff (the
  // left hand's middle C on its ledger line above the bass), else by pitch.
  const staffOf = (m, hand) => (clef !== 'grand' ? staves[0] : staves[hand === 'R' ? 0 : hand === 'L' ? 1 : m >= 60 ? 0 : 1]);
  const yOf = (m, hand) => { const st = staffOf(m, hand); return st.bottom - (step(m) - REF[st.clef]) * (s / 2); };

  // Horizontal: engraving-style spacing, bars grouped greedily into systems.
  const unit = s * 3.2;
  const space = (d) => unit * d ** 0.6;
  const barGap = s * 0.9;
  const sharps = song.sharps ?? [];
  const clefW = s * 4.4 + sharps.length * s * 1.1;
  // Bars of exactly 4 beats (3 in 3/4, song.beats): a note across a bar
  // line is drawn as tied pieces (music.js pieces()), the first one being
  // "the" note i.
  const barList = barsOf(laid, meter(song)).map((ps) => ({ pieces: ps, w: ps.reduce((a, p) => a + space(p.d), 0) + barGap }));
  const avail = width - clefW - s * 1.5;
  const systems = [];
  for (const b of barList) {
    const cur = systems[systems.length - 1];
    if (cur && cur.w + b.w <= avail) { cur.bars.push(b); cur.w += b.w; } else systems.push({ bars: [b], w: b.w });
  }
  if (!systems.length) systems.push({ bars: [], w: 0 });

  const groups = laid.map((n) => svg('g', { class: 'n' + (n.p == null ? ' rest' : '') }));
  const headXs = [], systemOf = [];
  const svgs = systems.map((sys, si) => {
    const lastSys = si === systems.length - 1;
    const stretch = lastSys ? 1 : avail / sys.w; // justify all but the last line
    const root = svg('svg', { class: 'staff', width, height: H, viewBox: `0 0 ${width} ${H}` });
    let cx = clefW;
    const barXs = [];
    for (const b of sys.bars) {
      for (const pc of b.pieces) {
        pc.x = cx + s * 0.9;
        pc.sys = si;
        if (!pc.tieFrom) { headXs[pc.i] = pc.x; systemOf[pc.i] = si; }
        cx += space(pc.d) * stretch;
      }
      cx += barGap * stretch * 0.45;
      barXs.push(cx);
      cx += barGap * stretch * 0.55;
    }
    const lineEnd = barXs.length ? barXs[barXs.length - 1] : width - s;
    for (const st of staves) {
      for (let k = 0; k < 5; k++) root.append(svg('line', { x1: 0, x2: lineEnd, y1: st.bottom - k * s, y2: st.bottom - k * s, class: 'sl' }));
      root.append(st.clef === 'treble'
        ? svg('text', { x: s * 0.3, y: st.bottom - s, class: 'clef-glyph', 'font-size': s * 4 }, '\u{1D11E}')
        : svg('text', { x: s * 0.3, y: st.bottom - 0.4 * s, class: 'clef-glyph', 'font-size': s * 4 }, '\u{1D122}'));
      // Key signature: F♯ on the top line (treble) / its line (bass), and so on.
      const KEY = { treble: { F: 77, C: 72, G: 79 }, bass: { F: 53, C: 48, G: 55 } };
      sharps.forEach((l, k) => {
        const p = KEY[st.clef][l];
        if (p != null) root.append(svg('text', { x: s * 4.2 + k * s * 1.1, y: st.bottom - (step(p) - REF[st.clef]) * (s / 2) + s * 0.5, class: 'acc', 'font-size': s * 1.7 }, '♯'));
      });
    }
    const y0 = staves[0].bottom - 4 * s, y1 = staves[staves.length - 1].bottom;
    root.append(svg('line', { x1: 1, x2: 1, y1: y0, y2: y1, class: 'bl thin' }));
    barXs.forEach((bx, k) => {
      root.append(svg('line', { x1: bx, x2: bx, y1: y0, y2: y1, class: 'bl' }));
      if (lastSys && k === barXs.length - 1) {
        root.append(svg('line', { x1: bx + s * 0.35, x2: bx + s * 0.35, y1: y0, y2: y1, class: 'bl', 'stroke-width': s * 0.3 }));
        // End repeat: two dots before the double bar, on each staff.
        if (song.repeat) for (const st of staves) for (const dy of [1.5, 2.5]) root.append(svg('circle', { cx: bx - s * 0.55, cy: st.bottom - dy * s, r: s * 0.22, class: 'dot' }));
      }
    });
    return root;
  });
  const fxs = svgs.map(() => svg('g', { class: 'fx' }));

  // Ledger lines for pitch m at x.
  const ledgers = (g, m, x, hand) => {
    const st = staffOf(m, hand), ref = REF[st.clef], sp = step(m);
    const line = (k) => g.append(svg('line', { x1: x - s, x2: x + s, y1: st.bottom - ((k - ref) * s) / 2, y2: st.bottom - ((k - ref) * s) / 2, class: 'ledger' }));
    for (let k = ref - 2; k >= sp; k -= 2) line(k);
    for (let k = ref + 10; k <= sp; k += 2) line(k);
  };
  const byPitch = (m, hand) => step(m) < REF[staffOf(m, hand).clef] + 4;
  const stemUp = (n) => (n.hand === 'R' ? true : n.hand === 'L' ? false : byPitch(n.p, n.hand));

  // Beamed ti-ti pairs (same staff, same line).
  const beamed = new Set(), pairs = [];
  for (let i = 0; i + 1 < laid.length; i++) {
    const a = laid[i], b = laid[i + 1];
    if (a.d === 0.5 && b.d === 0.5 && a.p != null && b.p != null && a.start % 1 === 0 &&
        !a.also && !b.also && staffOf(a.p, a.hand) === staffOf(b.p, b.hand) && systemOf[i] === systemOf[i + 1]) {
      beamed.add(i); beamed.add(i + 1); pairs.push(i); i++;
    }
  }

  const piecesOf = laid.map(() => []);
  for (const b of barList) for (const pc of b.pieces) piecesOf[pc.i].push(pc);
  const tails = laid.map(() => []); // groups of the tied-over pieces, by note
  let restStaff = staves[0];
  laid.forEach((n, i) => piecesOf[i].forEach((pc, k) => {
    let g = groups[i];
    if (k > 0) {
      g = svg('g', { class: 'n' + (n.p == null ? ' rest' : '') });
      tails[i].push({ g, sys: pc.sys });
    }
    const hx = pc.x, d = pc.d;
    if (n.p == null) {
      const count = Math.max(1, Math.floor(d));
      for (let r = 0; r < count; r++) {
        g.append(svg('text', { x: hx + (r * space(d)) / count, y: restStaff.bottom - 1.5 * s, class: 'rest-glyph', 'font-size': s * 3.2 }, '\u{1D13D}'));
      }
      return;
    }
    restStaff = staffOf(n.p, n.hand);
    const y = yOf(n.p, n.hand);
    const head = (p, hand) => {
      const hy = yOf(p, hand);
      ledgers(g, p, hx, hand);
      if (k === 0) g.append(svg('circle', { cx: hx, cy: hy, r: s * 1.15, class: 'halo' }));
      if (k === 0 && isSharp(p)) g.append(svg('text', { x: hx - s * 1.3, y: hy + s * 0.45, class: 'acc', 'font-size': s * 1.5 }, '♯'));
      g.append(svg('ellipse', { cx: hx, cy: hy, rx: s * 0.68, ry: s * 0.5, transform: `rotate(-20 ${hx} ${hy})`, class: d >= 2 ? 'head hollow' : 'head' }));
      return hy;
    };
    head(n.p, n.hand);
    const up = stemUp(n);
    // Notes played with it (`also`): on its stem when they're on its staff
    // in the same hand, else (the other hand) with a stem of their own.
    let y2 = y;
    for (const o of n.also ?? []) {
      const hand = o.hand ?? n.hand, oy = head(o.p, hand);
      if (staffOf(o.p, hand) === staffOf(n.p, n.hand) && (hand ?? null) === (n.hand ?? null)) y2 = up ? Math.max(y2, oy) : Math.min(y2, oy);
      else if (d < 4) {
        const oup = stemUp({ p: o.p, hand }), ox = oup ? hx + s * 0.62 : hx - s * 0.62;
        g.append(svg('line', { x1: ox, x2: ox, y1: oy, y2: oup ? oy - s * 3.4 : oy + s * 3.4, class: 'stem' }));
      }
    }
    const sx = up ? hx + s * 0.62 : hx - s * 0.62, sy = up ? y - s * 3.4 : y + s * 3.4;
    if (d < 4 && !beamed.has(i)) g.append(svg('line', { x1: sx, x2: sx, y1: y2, y2: sy, class: 'stem' }));
    if (d === 0.5 && !beamed.has(i)) g.append(svg('path', { d: up ? `M${sx} ${sy} q${s * 0.9} ${s * 0.9} ${s * 0.5} ${s * 2}` : `M${sx} ${sy} q${s * 0.9} ${-s * 0.9} ${s * 0.5} ${-s * 2}`, class: 'flag' }));
    if (d === 3) g.append(svg('circle', { cx: hx + s * 1.1, cy: y - (step(n.p) % 2 === REF[staffOf(n.p, n.hand).clef] % 2 ? s * 0.5 : 0), r: s * 0.17, class: 'dot' }));
    // Tie to the next piece (on the far side of the head from the stem);
    // across a line break, out to the line's end / in from its start.
    const next = piecesOf[i][k + 1], tieY = y + (up ? s * 0.75 : -s * 0.75), bow = up ? s * 0.9 : -s * 0.9;
    const tie = (x1, x2) => g.append(svg('path', { d: `M${x1} ${tieY} Q${(x1 + x2) / 2} ${tieY + bow} ${x2} ${tieY}`, class: 'tie' }));
    if (next) tie(hx + s * 0.5, next.sys === pc.sys ? next.x - s * 0.5 : hx + s * 2.6);
    if (k > 0 && piecesOf[i][k - 1].sys !== pc.sys) tie(hx - s * 2.6, hx - s * 0.5);
    if (k > 0) return; // labels and fingers once, on the note itself
    // A chord's letters stack under it, top note first (as the heads stand).
    const ps = [n.p, ...(n.also ?? []).map((o) => o.p)].sort((a, b) => b - a);
    ps.forEach((p, j) => label(g, p, hx, letterY + j * s * CHORD_ROW, p === n.p ? n.f : null, n.d));
    const fingerAt = (f, p, hand, yy, j) => {
      if (f == null) return;
      if (hand === 'L') g.append(svg('text', { x: hx, y: Math.max(staffOf(p, hand).bottom + 2 * s, yy + s * (n.d < 4 ? 3.4 : 0.5)) + s * 1.6 + j * s * 1.3, class: 'letter finger-above', 'font-size': s * 1.3 }, String(f)));
      else g.append(svg('text', { x: hx, y: Math.min(staffOf(p, hand).bottom - 5.4 * s, yy - s * 4.2) + j * s * 1.4, class: 'letter finger-above', 'font-size': s * 1.3 }, String(f)));
    };
    const f = typeof fingersAbove === 'function' ? fingersAbove(i) : fingersAbove ? n.f : null;
    // A chord's other fingers: under the note's own (5 over 1, the pair
    // raised a row), or on the other hand's side.
    const fn = typeof fingersAbove === 'function';
    const sameHand = (o) => (o.hand ?? n.hand ?? null) === (n.hand ?? null);
    const stacked = f != null && (n.also ?? []).some((o) => o.f != null && sameHand(o));
    fingerAt(f, n.p, n.hand, y, stacked ? -1 : 0);
    if (fingersAbove) (n.also ?? []).forEach((o) => {
      const hand = o.hand ?? n.hand, same = sameHand(o);
      fingerAt(fn && f == null ? null : o.f, o.p, hand, same ? y : yOf(o.p, hand), 0);
    });
  }));
  for (const i of pairs) {
    const a = laid[i], b = laid[i + 1];
    const up = a.hand ? stemUp(a) : (step(a.p) + step(b.p)) / 2 < REF[staffOf(a.p, a.hand).clef] + 4;
    const off = up ? s * 0.62 : -s * 0.62;
    const ax = headXs[i] + off, bx = headXs[i + 1] + off, ay = yOf(a.p, a.hand), by = yOf(b.p, b.hand);
    const beamY = up ? Math.min(ay, by) - s * 3.4 : Math.max(ay, by) + s * 3.4;
    groups[i].append(svg('line', { x1: ax, x2: ax, y1: ay, y2: beamY, class: 'stem' }),
      svg('line', { x1: ax, x2: bx, y1: beamY, y2: beamY, class: 'beam', 'stroke-width': s * 0.45 }));
    groups[i + 1].append(svg('line', { x1: bx, x2: bx, y1: by, y2: beamY, class: 'stem' }));
  }
  groups.forEach((g, i) => svgs[systemOf[i]].append(g));
  tails.forEach((ts) => ts.forEach(({ g, sys }) => svgs[sys].append(g)));
  svgs.forEach((r, k) => r.append(fxs[k]));
  const bgs = svgs.map((r) => { const g = svg('g', { class: 'bg' }); r.prepend(g); return g; });

  const V = Math.max(1, Math.min(visible, systems.length));
  const strip = h('div', { class: 'staff-systems' }, svgs);
  const el = h('div', { class: 'staff-page', style: `height:${V * H}px` }, strip);
  let first = 0;

  return {
    el, laid,
    targets: laid.map((n, i) => i).filter((i) => laid[i].p != null),
    // state: current | hit | perfect | good | ok | wrong | miss | fixed | '' (clear)
    mark(i, state) {
      const cls = 'n' + (laid[i].p == null ? ' rest' : '') + (state ? ' ' + state : '');
      groups[i].setAttribute('class', cls);
      for (const t of tails[i]) t.g.setAttribute('class', cls);
    },
    // Show the note she actually played, faintly, beside note i.
    ghost(i, midi) {
      const hx = headXs[i] + s * (isSharp(midi) ? 2.6 : 1.6), y = yOf(midi); // room for its ♯
      const g = svg('g', { class: 'ghost' });
      ledgers(g, midi, hx);
      // A black key shows its ♯ in every label mode (blueprints have no
      // letters), so a heard F♯ never looks like an F being refused.
      if (isSharp(midi)) g.append(svg('text', { x: hx - s * 1.25, y: y + s * 0.5, class: 'acc', 'font-size': s * 1.7 }, '♯'));
      g.append(svg('ellipse', { cx: hx, cy: y, rx: s * 0.68, ry: s * 0.5, transform: `rotate(-20 ${hx} ${y})`, class: 'head' }));
      label(g, midi, hx, letterY - s * 1.3);
      fxs[systemOf[i]].append(g);
      setTimeout(() => g.remove(), 1200);
    },
    // Instant feedback on note i: a ring bursting from the notehead, with a
    // check (hit), cross (miss) or ✨ (twinkle: a long note held) above it.
    burst(i, kind = 'hit') {
      const n = laid[i];
      if (n.p == null) return;
      const hx = headXs[i], y = yOf(n.p, n.hand);
      const g = svg('g', { class: 'burst ' + kind });
      g.append(svg('circle', { cx: hx, cy: y, r: s * 1.1 }),
        svg('text', { x: hx, y: y - s * 1.8, 'font-size': s * 1.5 }, kind === 'miss' ? '✕' : kind === 'twinkle' ? '✨' : '✓'));
      fxs[systemOf[i]].append(g);
      setTimeout(() => g.remove(), kind === 'twinkle' ? 1400 : 900);
      return g;
    },
    // After a run: mark a timing problem. Gap marks (stall/rushed/dragged)
    // sit between note `prev` and note i; early/late sit above note i.
    review(i, kind, prev) {
      const sameLine = prev != null && systemOf[prev] === systemOf[i];
      const x = kind === 'early' || kind === 'late' || !sameLine ? headXs[i] - (sameLine ? 0 : s * 1.6) : (headXs[prev] + headXs[i]) / 2;
      const y = s * 1.2;
      const g = svg('g', { class: 'review ' + kind });
      if (kind === 'stall') {
        g.append(svg('rect', { x: x - s * 0.45, y: y - s * 0.55, width: s * 0.3, height: s * 1.1, rx: 1 }),
          svg('rect', { x: x + s * 0.15, y: y - s * 0.55, width: s * 0.3, height: s * 1.1, rx: 1 }));
      } else {
        g.append(svg('text', { x, y: y + s * 0.4, 'font-size': s * 1.3 }, { rushed: '»', dragged: '«', early: '‹', late: '›' }[kind]));
      }
      fxs[systemOf[i]].append(g);
    },
    // A band behind notes i0..i1 on one line (a bar): cls 'bar-current' | 'bar-done'.
    span(i0, i1, cls) {
      const rect = svg('rect', { x: headXs[i0] - s * 1.5, y: s * 0.4, width: headXs[i1] - headXs[i0] + s * 3, height: H - s * 0.8, rx: s * 0.5, class: cls });
      bgs[systemOf[i0]].append(rect);
      return rect;
    },
    // Page so note i's line shows, with the next line below when there's room.
    show(i) {
      const si = systemOf[i] ?? 0;
      const want = Math.max(0, Math.min(si - Math.max(0, V - 2), systems.length - V));
      if (want === first) return;
      first = want;
      strip.style.transform = `translateY(${-first * H}px)`;
    },
  };
}
