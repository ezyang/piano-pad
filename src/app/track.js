// The song track: a rhythm notation line (real note symbols + Piano Safari
// syllables) above rows of pitch blocks, one row per natural note.
import { layout, totalBeats, rowsFor, rowOf, notationGroups, letter, isSharp, SYLLABLE, REST_SYLLABLE } from './music.js';
import { material } from './pixels.js';
import { resolveClef } from './staff.js';
import { h, svg } from './dom.js';

export const RHYTHM_H = 78;

// Row height that fills `avail` px of vertical space.
export const fitRowH = (song, avail, max = 96) =>
  Math.round(Math.max(36, Math.min(max, (avail - RHYTHM_H) / rowsFor(song.notes, resolveClef(song)).length)));

export function createTrack(song, { rowH = 58, ppb = Math.round(rowH * 1.7), extraBeats = 2, onTap, labels = true } = {}) {
  const laid = layout(song.notes);
  const rows = rowsFor(song.notes, resolveClef(song));
  const beats = Math.max(8, Math.ceil((totalBeats(song.notes) + extraBeats) / 4) * 4);
  const pad = 24; // left padding inside the scroller
  const x = (beat) => pad + beat * ppb;
  const width = x(beats) + pad;
  const rowsH = rows.length * rowH;
  const yOfRow = (i) => (rows.length - 1 - i) * rowH; // higher notes on top

  // Rhythm line.
  const line = svg('svg', { class: 'rhythm-line', width, height: RHYTHM_H, viewBox: `0 0 ${width} ${RHYTHM_H}` });
  for (let b = 0; b <= beats; b += 4) line.append(svg('line', { x1: x(b) - 4, x2: x(b) - 4, y1: 8, y2: 50, class: 'bar' }));
  line.append(svg('line', { x1: 0, x2: width, y1: 36, y2: 36, class: 'staffline' }));
  for (const g of notationGroups(laid)) line.append(drawGroup(g, x));

  // Rows and blocks.
  const grid = h('div', { class: 'rows', style: `width:${width}px;height:${rowsH}px` });
  rows.forEach((m, i) => {
    grid.append(h('div', { class: 'row-bg' + (i % 2 ? ' alt' : ''), style: `top:${yOfRow(i)}px;height:${rowH}px` }));
  });
  for (let b = 0; b <= beats; b++) {
    grid.append(h('div', { class: 'beat-line' + (b % 4 === 0 ? ' bar' : ''), style: `left:${x(b) - 3}px` }));
  }
  const blocks = laid.map((n) => {
    const w = n.d * ppb - 6;
    if (n.p == null) {
      return h('div', {
        class: 'block rest', style: `left:${x(n.start)}px;top:${yOfRow(Math.floor((rows.length - 1) / 2))}px;width:${w}px;height:${rowH - 6}px`,
      }, h('span', {}, REST_SYLLABLE));
    }
    const mat = material(n.p);
    return h('div', {
      class: 'block', style: `left:${x(n.start)}px;top:${yOfRow(rowOf(rows, n.p)) + 3}px;width:${w}px;height:${rowH - 6}px;` +
        `background-image:url(${mat.url});background-size:${ppb / 2}px 100%`,
    }, h('span', { class: 'letter' }, letter(n.p) + (isSharp(n.p) ? '♯' : '')));
  });
  grid.append(...blocks);
  if (onTap) {
    const end = totalBeats(song.notes);
    grid.append(h('div', { class: 'append-hint', style: `left:${x(end)}px;width:${Math.min(ppb, width - x(end) - pad)}px` }, '+'));
  }
  const playhead = h('div', { class: 'playhead', style: 'display:none' });
  grid.append(playhead);

  const inner = h('div', { class: 'track-inner', style: `width:${width}px` }, line, grid);
  const scroller = h('div', { class: 'track' }, inner);
  const labelCol = h('div', { class: 'labels' },
    h('div', { class: 'label-rhythm', style: `height:${RHYTHM_H}px` }, '♩'),
    ...rows.map((m, i) => {
      const mat = material(m);
      return h('div', { class: 'label', style: `height:${rowH}px;top:${RHYTHM_H + yOfRow(i)}px` },
        h('span', { class: 'swatch', style: `background-image:url(${mat.url})` }), letter(m));
    }),
  );
  const el = h('div', { class: 'track-wrap', style: `--rows-h:${rowsH}px` }, labels ? labelCol : null, scroller);

  if (onTap) {
    grid.addEventListener('pointerdown', (e) => {
      const r = grid.getBoundingClientRect();
      const beat = (e.clientX - r.left - pad) / ppb;
      const rowIdx = rows.length - 1 - Math.floor((e.clientY - r.top) / rowH);
      if (rowIdx < 0 || rowIdx >= rows.length) return;
      const index = laid.findIndex((n) => beat >= n.start && beat < n.start + n.d);
      onTap({ beat, midi: rows[rowIdx], index });
    });
  }

  return {
    el, blocks, laid, rows, x, ppb,
    setPlayhead(beat) {
      if (beat == null) { playhead.style.display = 'none'; return; }
      playhead.style.display = '';
      playhead.style.transform = `translateX(${x(beat)}px)`;
    },
    // Keep a beat position in view: 'continuous' pins it at 30% of the width
    // (a scrolling score); otherwise page smoothly when it nears the edge.
    follow(beat, how = 'page') {
      const w = scroller.clientWidth, px = x(beat), target = Math.max(0, px - w * 0.3);
      if (how === 'continuous') { if (target > scroller.scrollLeft) scroller.scrollLeft = target; return; }
      const rel = px - scroller.scrollLeft;
      if (rel < w * 0.1 || rel > w * 0.7) scroller.scrollTo({ left: target, behavior: 'smooth' });
    },
    scrollToEnd() {
      scroller.scrollLeft = Math.max(0, x(totalBeats(song.notes)) - scroller.clientWidth * 0.6);
    },
    blockTop(i) {
      const n = laid[i];
      return n.p == null ? yOfRow(Math.floor((rows.length - 1) / 2)) : yOfRow(rowOf(rows, n.p)) + 3;
    },
    grid,
  };
}

// --- notation glyphs ---

const HEAD_Y = 36;

function head(x, filled) {
  return svg('ellipse', { cx: x, cy: HEAD_Y, rx: 7.5, ry: 5.5, transform: `rotate(-22 ${x} ${HEAD_Y})`, class: filled ? 'head' : 'head hollow' });
}
const stem = (x) => svg('line', { x1: x + 6.5, x2: x + 6.5, y1: HEAD_Y - 2, y2: 6, class: 'stem' });
const syl = (x, text) => svg('text', { x, y: 70, class: 'syl' }, text);

function drawGroup(g, x) {
  const out = svg('g', { class: 'glyph' });
  const n = g.notes[0];
  const cx = x(n.start) + 18;
  if (g.kind === 'titi') {
    const cx2 = x(g.notes[1].start) + 18;
    out.append(head(cx, true), stem(cx), head(cx2, true), stem(cx2),
      svg('line', { x1: cx + 6.5, x2: cx2 + 6.5, y1: 7, y2: 7, class: 'beam' }),
      syl(cx, 'ti'), syl(cx2, 'ti'));
  } else if (g.kind === 'rest') {
    for (let b = 0; b < n.d; b++) {
      const rx = x(n.start + b) + 14;
      out.append(svg('path', { d: `M${rx} 20 l7 8 l-6 6 l7 8 c-6 -3 -10 1 -5 7`, class: 'rest' }));
    }
    out.append(syl(cx, REST_SYLLABLE));
  } else {
    const d = n.d;
    out.append(head(cx, d < 2));
    if (d < 4) out.append(stem(cx));
    if (d === 0.5) out.append(svg('path', { d: `M${cx + 6.5} 6 q10 8 6 20`, class: 'flag' }));
    if (d === 3) out.append(svg('circle', { cx: cx + 14, cy: HEAD_Y, r: 2.2, class: 'dot' }));
    out.append(syl(cx, SYLLABLE[d] ?? 'ta'));
  }
  return out;
}

// Small standalone glyph for toolbar buttons.
export function glyphIcon(kind) {
  const s = svg('svg', { viewBox: kind === 'ta-a-a-a' ? '-12 0 84 78' : '0 0 60 78', width: 40, height: 52, class: 'rhythm-line icon' });
  const x = (b) => b * 22;
  if (kind === 'titi') s.append(drawGroup({ kind: 'titi', notes: [{ start: 0, d: 0.5, p: 1 }, { start: 1, d: 0.5, p: 1 }] }, x));
  else if (kind === 'rest') s.append(drawGroup({ kind: 'rest', notes: [{ start: 0, d: 1, p: null }] }, x));
  else s.append(drawGroup({ kind, notes: [{ start: 0, d: { ta: 1, 'ta-a': 2, 'ta-a-a': 3, 'ta-a-a-a': 4 }[kind], p: 1 }] }, x));
  return s;
}
