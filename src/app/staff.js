// Treble-staff notation for practice: real noteheads/stems/beams/rests on a
// five-line staff, the letter under each note, and the rhythm syllable below
// that. Horizontal spacing is proportional to duration, so a playhead moving
// at constant speed lines up with the beats.
import { layout, totalBeats, isSharp, letter, SYLLABLE, REST_SYLLABLE } from './music.js';
import { h, svg } from './dom.js';

const STEP_OF = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C# D D# E F F# G G# A A# B
const step = (m) => Math.floor(m / 12) * 7 + STEP_OF[((m % 12) + 12) % 12]; // diatonic index
const E4 = step(64), B4 = step(71);

export function createStaff(song, { s = 20, ppb = Math.round(s * 4.6), extraBeats = 1 } = {}) {
  const laid = layout(song.notes);
  const beats = Math.max(4, Math.ceil((totalBeats(song.notes) + extraBeats) / 4) * 4);
  const pad = s * 1.2;
  const x = (beat) => pad + beat * ppb;
  const headX = (n) => x(n.start) + s * 0.9;
  const width = x(beats) + pad;
  const top = s * 3.2; // room for ledger lines above
  const bottom = top + 4 * s; // bottom staff line (E4)
  const yOf = (m) => bottom - (step(m) - E4) * (s / 2);
  const letterY = bottom + s * 3.4;
  const sylY = bottom + s * 4.6;
  const H = sylY + s * 0.8;

  const root = svg('svg', { class: 'staff', width, height: H, viewBox: `0 0 ${width} ${H}` });
  for (let i = 0; i < 5; i++) root.append(svg('line', { x1: 0, x2: width, y1: bottom - i * s, y2: bottom - i * s, class: 'sl' }));
  for (let b = 0; b <= beats; b += 4) {
    const bx = b === 0 ? x(0) - s * 0.4 : x(b) - s * 0.15;
    root.append(svg('line', { x1: bx, x2: bx, y1: bottom - 4 * s, y2: bottom, class: b === 0 ? 'bl thin' : 'bl' }));
  }
  const fx = svg('g', { class: 'fx' }); // ghosts etc. go on top

  const groups = laid.map((n) => svg('g', { class: 'n' + (n.p == null ? ' rest' : '') }));
  // Pair up ti-ti for beaming.
  const beamed = new Set(), pairs = [];
  for (let i = 0; i + 1 < laid.length; i++) {
    const a = laid[i], b = laid[i + 1];
    if (a.d === 0.5 && b.d === 0.5 && a.p != null && b.p != null && a.start % 1 === 0) { beamed.add(i); beamed.add(i + 1); pairs.push(i); i++; }
  }

  laid.forEach((n, i) => {
    const g = groups[i];
    const hx = headX(n);
    if (n.p == null) {
      for (let k = 0; k < n.d; k++) {
        g.append(svg('text', { x: x(n.start + k) + s * 0.9, y: bottom - 2 * s, class: 'rest-glyph', 'font-size': s * 3.2 }, '\u{1D13D}'));
      }
      g.append(svg('text', { x: hx, y: sylY, class: 'syl' }, REST_SYLLABLE));
      return;
    }
    const y = yOf(n.p);
    // ledger lines
    for (let st = E4 - 2; st >= step(n.p); st -= 2) g.append(svg('line', { x1: hx - s * 1.0, x2: hx + s * 1.0, y1: bottom - (st - E4) * s / 2, y2: bottom - (st - E4) * s / 2, class: 'ledger' }));
    for (let st = E4 + 10; st <= step(n.p); st += 2) g.append(svg('line', { x1: hx - s * 1.0, x2: hx + s * 1.0, y1: bottom - (st - E4) * s / 2, y2: bottom - (st - E4) * s / 2, class: 'ledger' }));
    g.append(svg('circle', { cx: hx, cy: y, r: s * 1.15, class: 'halo' }));
    if (isSharp(n.p)) g.append(svg('text', { x: hx - s * 1.3, y: y + s * 0.45, class: 'acc', 'font-size': s * 1.5 }, '♯'));
    const hollow = n.d >= 2;
    g.append(svg('ellipse', { cx: hx, cy: y, rx: s * 0.68, ry: s * 0.5, transform: `rotate(-20 ${hx} ${y})`, class: hollow ? 'head hollow' : 'head' }));
    const up = step(n.p) < B4;
    const sx = up ? hx + s * 0.62 : hx - s * 0.62;
    const sy = up ? y - s * 3.4 : y + s * 3.4;
    if (n.d < 4 && !beamed.has(i)) g.append(svg('line', { x1: sx, x2: sx, y1: y, y2: sy, class: 'stem' }));
    if (n.d === 0.5 && !beamed.has(i)) g.append(svg('path', { d: up ? `M${sx} ${sy} q${s * 0.9} ${s * 0.9} ${s * 0.5} ${s * 2}` : `M${sx} ${sy} q${s * 0.9} ${-s * 0.9} ${s * 0.5} ${-s * 2}`, class: 'flag' }));
    if (n.d === 3) g.append(svg('circle', { cx: hx + s * 1.1, cy: y - (step(n.p) % 2 === E4 % 2 ? s * 0.5 : 0), r: s * 0.17, class: 'dot' }));
    g.append(svg('text', { x: hx, y: letterY, class: 'letter' }, letter(n.p) + (isSharp(n.p) ? '♯' : '')));
    g.append(svg('text', { x: hx, y: sylY, class: 'syl' }, beamed.has(i) ? 'ti' : SYLLABLE[n.d] ?? ''));
  });

  // Beamed pairs: stems in a shared direction with a beam across.
  for (const i of pairs) {
    const a = laid[i], b = laid[i + 1];
    const up = (step(a.p) + step(b.p)) / 2 < B4;
    const ax = headX(a) + (up ? s * 0.62 : -s * 0.62), bx = headX(b) + (up ? s * 0.62 : -s * 0.62);
    const ay = yOf(a.p), by = yOf(b.p);
    const beamY = up ? Math.min(ay, by) - s * 3.4 : Math.max(ay, by) + s * 3.4;
    groups[i].append(svg('line', { x1: ax, x2: ax, y1: ay, y2: beamY, class: 'stem' }));
    groups[i + 1].append(svg('line', { x1: bx, x2: bx, y1: by, y2: beamY, class: 'stem' }));
    groups[i].append(svg('line', { x1: ax, x2: bx, y1: beamY, y2: beamY, class: 'beam', 'stroke-width': s * 0.45 }));
  }
  root.append(...groups, fx);

  const playhead = svg('line', { x1: 0, x2: 0, y1: top - s * 2, y2: letterY + s * 0.5, class: 'staff-playhead', style: 'display:none' });
  root.append(playhead);

  const clef = svg('svg', { class: 'staff clef', width: s * 3.4, height: H, viewBox: `0 0 ${s * 3.4} ${H}` });
  for (let i = 0; i < 5; i++) clef.append(svg('line', { x1: 0, x2: s * 3.4, y1: bottom - i * s, y2: bottom - i * s, class: 'sl' }));
  clef.append(svg('line', { x1: 1, x2: 1, y1: bottom - 4 * s, y2: bottom, class: 'bl thin' }));
  clef.append(svg('text', { x: s * 0.3, y: bottom - s, class: 'clef-glyph', 'font-size': s * 4 }, '\u{1D11E}'));

  const scroller = h('div', { class: 'staff-scroll' }, root);
  const el = h('div', { class: 'staff-wrap' }, clef, scroller);

  return {
    el, laid, x, s,
    targets: laid.map((n, i) => i).filter((i) => laid[i].p != null),
    // state: current | hit | perfect | good | ok | wrong | miss | fixed | '' (clear)
    mark(i, state) {
      const g = groups[i];
      g.setAttribute('class', 'n' + (laid[i].p == null ? ' rest' : '') + (state ? ' ' + state : ''));
    },
    // Show the note she actually played, faintly, beside note i.
    ghost(i, midi) {
      const n = laid[i], hx = headX(n) + s * 1.6, y = yOf(midi);
      const g = svg('g', { class: 'ghost' });
      for (let st = E4 - 2; st >= step(midi); st -= 2) g.append(svg('line', { x1: hx - s, x2: hx + s, y1: bottom - (st - E4) * s / 2, y2: bottom - (st - E4) * s / 2, class: 'ledger' }));
      for (let st = E4 + 10; st <= step(midi); st += 2) g.append(svg('line', { x1: hx - s, x2: hx + s, y1: bottom - (st - E4) * s / 2, y2: bottom - (st - E4) * s / 2, class: 'ledger' }));
      g.append(svg('ellipse', { cx: hx, cy: y, rx: s * 0.68, ry: s * 0.5, transform: `rotate(-20 ${hx} ${y})`, class: 'head' }));
      g.append(svg('text', { x: hx, y: letterY - s * 1.3, class: 'letter' }, letter(midi) + (isSharp(midi) ? '♯' : '')));
      fx.append(g);
      setTimeout(() => g.remove(), 1200);
    },
    setPlayhead(beat) {
      if (beat == null) { playhead.style.display = 'none'; return; }
      playhead.style.display = '';
      playhead.setAttribute('x1', x(beat)); playhead.setAttribute('x2', x(beat));
    },
    follow(beat, how = 'page') {
      const w = scroller.clientWidth, px = x(beat), target = Math.max(0, px - w * 0.3);
      if (how === 'continuous') { if (target > scroller.scrollLeft) scroller.scrollLeft = target; return; }
      const rel = px - scroller.scrollLeft;
      if (rel < w * 0.1 || rel > w * 0.7) scroller.scrollTo({ left: target, behavior: 'smooth' });
    },
  };
}
