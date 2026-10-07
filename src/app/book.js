// Pre-staff notation, drawn like her lesson book: no staff lines; black note
// heads with the letter inside (half notes open), higher pitch drawn higher;
// the right hand's row (stems up) above the left hand's (stems down); bar
// lines through both. Finger numbers only where a note has `f` (where the
// book prints one). `labels` takes scaffolding away (⚙︎ Homework labels):
//   'book'    as printed
//   'letters' letters kept; finger numbers only on each hand's first note
//   'first'   each hand's first note keeps its letter and finger; the other
//             heads are blank, so she reads by direction
//   'fingers' letters kept, and every note gets its finger number (the
//             book's where printed, else from the piece's hand position)
// (`firsts`: the indices of each hand's first note, from the piece's setup.)
// Fingers not printed come from the piece's `position` (labels.js; C
// position by default), so a hand that sits elsewhere (the left thumb on C3,
// going down) is numbered right.
// Same interface as staff.js where the pieces need it:
// { el, laid, targets, mark(i, state), show(i), span(i0, i1, cls) }.
import { svg } from './dom.js';
import { layout, letter } from './music.js';
import { C_POSITION } from './labels.js';

const NAT = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // steps above C in its octave
const BEATS = 4;

export function createBook(song, { width = 800, height = 800, labels = 'book' } = {}) {
  const firsts = new Set((song.setup ?? []).map((x) => x.at));
  const setupFinger = new Map((song.setup ?? []).map((x) => [x.at, x]));
  const laid = layout(song.notes);
  const nBars = Math.max(1, Math.ceil(laid.reduce((a, n) => Math.max(a, n.start + n.d), 0) / BEATS));
  const perLine = width < 520 ? 2 : 4;
  const lines = Math.ceil(nBars / perLine);
  const barW = (width - 12) / perLine;
  const beatW = barW / BEATS;
  const rh = (p) => p >= 60;
  // Steps above the hand's C (C4 for the right hand, C3 for the left).
  const lift = (p) => NAT[((p % 12) + 12) % 12] + 7 * (Math.floor(p / 12) - (rh(p) ? 5 : 4));
  // Each row is as tall as the notes it holds (at least C..G).
  // Notes below the hand's C (a left hand going down from C3) hang below it.
  const lifts = (hand) => laid.filter((n) => n.p != null && rh(n.p) === hand).map((n) => lift(n.p));
  const dip = (hand) => Math.max(0, ...lifts(hand).map((l) => -l));
  const reach = (hand) => Math.max(4 - dip(hand), ...lifts(hand));
  const rhUp = reach(true), lhUp = reach(false), rhDown = dip(true), lhDown = dip(false);
  // Vertical metrics, in head radii. A line, top to bottom: right-hand
  // finger numbers and stems (up), the right hand's row, a gap, the left
  // hand's row, its stems (down) and finger numbers.
  const metrics = (r) => {
    const step = r * 0.95, stem = r * 3, fRow = r * 1.4;
    const rhC = r * 0.3 + fRow + stem + rhUp * step;
    const lhC = rhC + rhDown * step + r * 3.2 + lhUp * step;
    return { r, step, stem, rhC, lhC, lineH: lhC + lhDown * step + stem + fRow + r * 0.9 };
  };
  // Head radius: as big as the width allows, and small enough for every
  // line to fit the height.
  const r = Math.max(9, Math.min(beatW * 0.36, 19, (height - 10) / (lines * metrics(1).lineH)));
  const { step, stem, rhC, lhC, lineH } = metrics(r);
  const H = lines * lineH;
  const topOf = (hand) => (hand ? rhC - rhUp * step : lhC - lhUp * step) - r; // a row's top edge
  const root = svg('svg', { class: 'book', width, height: H, viewBox: `0 0 ${width} ${H}` });
  const bg = svg('g', {}), fg = svg('g', {});
  root.append(bg, fg);

  const y = (p, top) => top + (rh(p) ? rhC : lhC) - lift(p) * step;
  const pos = laid.map((n) => {
    const bar = Math.floor(n.start / BEATS + 1e-9);
    const line = Math.floor(bar / perLine), top = line * lineH;
    return { line, top, x: 6 + (bar % perLine) * barW + (n.start - bar * BEATS) * beatW + beatW * 0.5 };
  });

  // Bar lines (through both rows), a double bar at the end.
  for (let line = 0; line < lines; line++) {
    const top = line * lineH, y1 = top + topOf(true), y2 = top + lhC + lhDown * step + r;
    const count = Math.min(perLine, nBars - line * perLine);
    for (let k = 0; k <= count; k++) {
      const x = 6 + k * barW;
      fg.append(svg('line', { x1: x, x2: x, y1, y2, class: 'bl' }));
      if (line * perLine + k === nBars) fg.append(svg('line', { x1: x - 5, x2: x - 5, y1, y2, class: 'bl' }));
    }
  }

  // The finger for a note the book doesn't number: from the piece's hand
  // position (by its row: right hand from middle C up).
  const position = song.position ?? C_POSITION;
  const fingerOf = (p) => (rh(p) ? position.R : position.L)[p] ?? null;
  // ...for a hand's first note (it sets the hand), by the set-up's hand.
  const fingerOn = (i) => {
    const s = setupFinger.get(i), p = laid[i].p;
    return s ? (s.hand === 'left' ? position.L : position.R)[p] ?? null : null;
  };
  const groups = laid.map((n, i) => {
    const g = svg('g', { class: 'n' + (n.p == null ? ' rest' : '') });
    fg.append(g);
    if (n.p == null) return g;
    const { x, top } = pos[i], hy = y(n.p, top), up = rh(n.p), open = n.d >= 2;
    g.append(svg('circle', { cx: x, cy: hy, r: r * 1.45, class: 'halo' }));
    const sx = up ? x + r * 0.92 : x - r * 0.92;
    if (n.d < 4) g.append(svg('line', { x1: sx, x2: sx, y1: hy, y2: up ? hy - stem : hy + stem, class: 'stem' }));
    // A whole note is counted through on the page: "(2 - 3 - 4)".
    if (n.d === 4) g.append(svg('text', { x: x + beatW * 1.9, y: hy + r * 0.4, class: 'count', 'font-size': r * 1.05 }, '(2 - 3 - 4)'));
    g.append(svg('ellipse', { cx: x, cy: hy, rx: r * 1.05, ry: r * 0.9, class: 'head' + (open ? ' open' : '') }));
    const first = firsts.has(i);
    if (labels !== 'first' || first) g.append(svg('text', { x, y: hy + r * 0.42, class: 'ltr' + (open ? ' open' : ''), 'font-size': r * 1.15 }, letter(n.p)));
    // Finger numbers sit at the end of the stem, as in the book. Off the
    // book's labels, only a hand's first note keeps one (it sets the hand).
    const f = labels === 'book' ? n.f : labels === 'fingers' ? n.f ?? fingerOf(n.p) : first ? n.f ?? fingerOn(i) : null;
    if (f != null) g.append(svg('text', { x: sx, y: up ? hy - stem - r * 0.35 : hy + stem + r * 1.15, class: 'fing', 'font-size': r * 1.1 }, String(f)));
    return g;
  });

  return {
    el: root, laid,
    targets: laid.map((n, i) => i).filter((i) => laid[i].p != null),
    // state: current | hit | '' (clear)
    mark(i, state) { groups[i].setAttribute('class', 'n' + (laid[i].p == null ? ' rest' : '') + (state ? ' ' + state : '')); },
    // Everything fits on the page; bring the line into view if it doesn't.
    show(i) { if (lines > 1 && root.parentElement?.scrollHeight > root.parentElement?.clientHeight) root.parentElement.scrollTo({ top: pos[i].top - r, behavior: 'smooth' }); },
    // A band behind notes i0..i1 (one bar): cls 'bar-current' | 'bar-done'.
    span(i0, i1, cls) {
      const a = pos[i0], b = pos[i1];
      const x0 = a.x - beatW * 0.5 + 3, x1 = b.x - beatW * 0.5 + laid[i1].d * beatW - 3;
      const rect = svg('rect', { x: x0, y: a.top + topOf(true), width: x1 - x0, height: lhC + lhDown * step + r - topOf(true), rx: r * 0.5, class: cls });
      bg.append(rect);
      return rect;
    },
  };
}
