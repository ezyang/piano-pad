// Practice notation, laid out like a page: the song wraps into systems (lines)
// that each start with a clef and are justified to the full width. Treble,
// bass, or grand staff (middle C and up on treble). Engraving-style spacing,
// so width isn't a cue for rhythm; she reads the symbols. Optional letter
// names under the notes.
//
// Only `visible` systems show at once. show(i) pages so the line with note i
// is on screen with (when there's room) the next line below it: a discrete
// line-by-line step, never motion tied to time.
import { layout, isSharp } from './music.js';
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
// 'letters' | 'fingers' | 'none' (or a boolean for letters/none).
const labelMode = (letters) => (letters === true ? 'letters' : letters === false ? 'none' : letters);

function metrics(s, clef, letters) {
  const top = s * 3.2; // room for ledger lines above
  const staves = [];
  if (clef === 'grand') {
    staves.push({ clef: 'treble', bottom: top + 4 * s });
    staves.push({ clef: 'bass', bottom: top + 4 * s + 4.6 * s + 4 * s });
  } else {
    staves.push({ clef, bottom: top + 4 * s });
  }
  const last = staves[staves.length - 1].bottom;
  const letterY = last + s * 3.4;
  return { staves, letterY, height: labelMode(letters) !== 'none' ? letterY + s * 1.1 : last + s * 3 };
}
export const systemHeight = (s, clef, letters) => metrics(s, clef, letters).height;

export function createStaff(song, { s = 20, width = 1000, letters = 'letters', visible = 2 } = {}) {
  const mode = labelMode(letters);
  const label = (g, m, x, y) => {
    const { text, fallback } = labelFor(m, mode);
    if (text) g.append(svg('text', { x, y, class: 'letter' + (mode === 'fingers' && !fallback ? ' finger' : '') + (fallback ? ' fallback' : '') }, text));
  };
  const clef = resolveClef(song);
  const laid = layout(song.notes);
  const { staves, letterY, height: H } = metrics(s, clef, letters);
  const staffOf = (m) => (clef === 'grand' ? staves[m >= 60 ? 0 : 1] : staves[0]);
  const yOf = (m) => { const st = staffOf(m); return st.bottom - (step(m) - REF[st.clef]) * (s / 2); };

  // Horizontal: engraving-style spacing, bars grouped greedily into systems.
  const unit = s * 3.2;
  const space = (d) => unit * d ** 0.6;
  const barGap = s * 0.9;
  const clefW = s * 4.4;
  const bars = [];
  laid.forEach((n, i) => {
    const b = Math.floor(n.start / 4);
    (bars[b] ??= { notes: [] }).notes.push(i);
  });
  const barList = bars.filter(Boolean).map((b) => ({ ...b, w: b.notes.reduce((a, i) => a + space(laid[i].d), 0) + barGap }));
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
      for (const i of b.notes) {
        headXs[i] = cx + s * 0.9;
        systemOf[i] = si;
        cx += space(laid[i].d) * stretch;
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
    }
    const y0 = staves[0].bottom - 4 * s, y1 = staves[staves.length - 1].bottom;
    root.append(svg('line', { x1: 1, x2: 1, y1: y0, y2: y1, class: 'bl thin' }));
    barXs.forEach((bx, k) => {
      root.append(svg('line', { x1: bx, x2: bx, y1: y0, y2: y1, class: 'bl' }));
      if (lastSys && k === barXs.length - 1) {
        root.append(svg('line', { x1: bx + s * 0.35, x2: bx + s * 0.35, y1: y0, y2: y1, class: 'bl', 'stroke-width': s * 0.3 }));
      }
    });
    return root;
  });
  const fxs = svgs.map(() => svg('g', { class: 'fx' }));

  // Ledger lines for pitch m at x.
  const ledgers = (g, m, x) => {
    const st = staffOf(m), ref = REF[st.clef], sp = step(m);
    const line = (k) => g.append(svg('line', { x1: x - s, x2: x + s, y1: st.bottom - ((k - ref) * s) / 2, y2: st.bottom - ((k - ref) * s) / 2, class: 'ledger' }));
    for (let k = ref - 2; k >= sp; k -= 2) line(k);
    for (let k = ref + 10; k <= sp; k += 2) line(k);
  };
  const stemUp = (m) => step(m) < REF[staffOf(m).clef] + 4;

  // Beamed ti-ti pairs (same staff, same line).
  const beamed = new Set(), pairs = [];
  for (let i = 0; i + 1 < laid.length; i++) {
    const a = laid[i], b = laid[i + 1];
    if (a.d === 0.5 && b.d === 0.5 && a.p != null && b.p != null && a.start % 1 === 0 &&
        staffOf(a.p) === staffOf(b.p) && systemOf[i] === systemOf[i + 1]) {
      beamed.add(i); beamed.add(i + 1); pairs.push(i); i++;
    }
  }

  let restStaff = staves[0];
  laid.forEach((n, i) => {
    const g = groups[i], hx = headXs[i];
    if (n.p == null) {
      for (let k = 0; k < n.d; k++) {
        g.append(svg('text', { x: hx + (k * space(n.d)) / n.d, y: restStaff.bottom - 1.5 * s, class: 'rest-glyph', 'font-size': s * 3.2 }, '\u{1D13D}'));
      }
      return;
    }
    restStaff = staffOf(n.p);
    const y = yOf(n.p);
    ledgers(g, n.p, hx);
    g.append(svg('circle', { cx: hx, cy: y, r: s * 1.15, class: 'halo' }));
    if (isSharp(n.p)) g.append(svg('text', { x: hx - s * 1.3, y: y + s * 0.45, class: 'acc', 'font-size': s * 1.5 }, '♯'));
    g.append(svg('ellipse', { cx: hx, cy: y, rx: s * 0.68, ry: s * 0.5, transform: `rotate(-20 ${hx} ${y})`, class: n.d >= 2 ? 'head hollow' : 'head' }));
    const up = stemUp(n.p);
    const sx = up ? hx + s * 0.62 : hx - s * 0.62, sy = up ? y - s * 3.4 : y + s * 3.4;
    if (n.d < 4 && !beamed.has(i)) g.append(svg('line', { x1: sx, x2: sx, y1: y, y2: sy, class: 'stem' }));
    if (n.d === 0.5 && !beamed.has(i)) g.append(svg('path', { d: up ? `M${sx} ${sy} q${s * 0.9} ${s * 0.9} ${s * 0.5} ${s * 2}` : `M${sx} ${sy} q${s * 0.9} ${-s * 0.9} ${s * 0.5} ${-s * 2}`, class: 'flag' }));
    if (n.d === 3) g.append(svg('circle', { cx: hx + s * 1.1, cy: y - (step(n.p) % 2 === REF[staffOf(n.p).clef] % 2 ? s * 0.5 : 0), r: s * 0.17, class: 'dot' }));
    label(g, n.p, hx, letterY);
  });
  for (const i of pairs) {
    const a = laid[i], b = laid[i + 1];
    const up = (step(a.p) + step(b.p)) / 2 < REF[staffOf(a.p).clef] + 4;
    const off = up ? s * 0.62 : -s * 0.62;
    const ax = headXs[i] + off, bx = headXs[i + 1] + off, ay = yOf(a.p), by = yOf(b.p);
    const beamY = up ? Math.min(ay, by) - s * 3.4 : Math.max(ay, by) + s * 3.4;
    groups[i].append(svg('line', { x1: ax, x2: ax, y1: ay, y2: beamY, class: 'stem' }),
      svg('line', { x1: ax, x2: bx, y1: beamY, y2: beamY, class: 'beam', 'stroke-width': s * 0.45 }));
    groups[i + 1].append(svg('line', { x1: bx, x2: bx, y1: by, y2: beamY, class: 'stem' }));
  }
  groups.forEach((g, i) => svgs[systemOf[i]].append(g));
  svgs.forEach((r, k) => r.append(fxs[k]));

  const V = Math.max(1, Math.min(visible, systems.length));
  const strip = h('div', { class: 'staff-systems' }, svgs);
  const el = h('div', { class: 'staff-page', style: `height:${V * H}px` }, strip);
  let first = 0;

  return {
    el, laid,
    targets: laid.map((n, i) => i).filter((i) => laid[i].p != null),
    // state: current | hit | perfect | good | ok | wrong | miss | fixed | '' (clear)
    mark(i, state) {
      groups[i].setAttribute('class', 'n' + (laid[i].p == null ? ' rest' : '') + (state ? ' ' + state : ''));
    },
    // Show the note she actually played, faintly, beside note i.
    ghost(i, midi) {
      const hx = headXs[i] + s * 1.6, y = yOf(midi);
      const g = svg('g', { class: 'ghost' });
      ledgers(g, midi, hx);
      g.append(svg('ellipse', { cx: hx, cy: y, rx: s * 0.68, ry: s * 0.5, transform: `rotate(-20 ${hx} ${y})`, class: 'head' }));
      label(g, midi, hx, letterY - s * 1.3);
      fxs[systemOf[i]].append(g);
      setTimeout(() => g.remove(), 1200);
    },
    // Instant feedback on note i: a ring bursting from the notehead, with a
    // check (hit) or cross (miss) above it.
    burst(i, kind = 'hit') {
      const n = laid[i];
      if (n.p == null) return;
      const hx = headXs[i], y = yOf(n.p);
      const g = svg('g', { class: 'burst ' + kind });
      g.append(svg('circle', { cx: hx, cy: y, r: s * 1.1 }),
        svg('text', { x: hx, y: y - s * 1.8, 'font-size': s * 1.5 }, kind === 'miss' ? '✕' : '✓'));
      fxs[systemOf[i]].append(g);
      setTimeout(() => g.remove(), 900);
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
