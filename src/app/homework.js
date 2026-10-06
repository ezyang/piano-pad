// Homework pieces, baked into the app (storage is disposable, so they live
// in code; a new piece is a deploy). Titles are neutral: no book titles or
// lyrics in this public repo. Notes are {d: beats, p: midi, f?: finger},
// with `f` exactly where the book prints a finger number,
// hand?: 'R' | 'L' (stems and fingers drawn the book's way). `setup` is how
// each hand starts (shown before that hand plays): from note index `at`,
// which hand, which finger goes where. `repeat`: a printed repeat sign;
// `twice`: played twice anyway (no sign; repetition is the practice).
// `gem`: the jewel it earns in the adventure (pixels.js GEMS); without one
// a piece gets a gem by its place in this list.
const n = (d, ...ps) => ps.map((p) => ({ d, p }));
// Put the book's finger numbers on notes (null: none printed).
const fingers = (notes, fs) => notes.map((x, i) => (fs[i] != null ? { ...x, f: fs[i] } : x));
// Which hand plays (on a staff: right hand stems up, left hand stems down).
const rh = (notes) => notes.map((x) => ({ ...x, hand: 'R' }));
const lh = (notes) => notes.map((x) => ({ ...x, hand: 'L' }));

// C five-finger position. The ✋ follows the notes: C3..G3 is the left hand
// (pinky on C3), C4..G4 the right (thumb on middle C).
const L = { C: 48, D: 50, E: 52, F: 53, G: 55 };
const R = { C: 60, D: 62, E: 64, F: 65, G: 67 };
const stairs = (h) => [
  ...n(1, h.C, h.D, h.E, h.F), ...n(1, h.G, h.G), ...n(2, h.G),
  ...n(1, h.G, h.F, h.E, h.D), ...n(1, h.C, h.C), ...n(2, h.C),
];
const _ = null;
const LEFT = { hand: 'left', finger: 5, text: 'Left hand: pinky on C' };
const RIGHT = { hand: 'right', finger: 1, text: 'Right hand: thumb on C' };

export const PIECES = {
  // --- this week (lesson of 2026-09-30) ---
  // Hands take turns near middle C: the right hand plays G A B (finger 2 on
  // G), the left hand D E (finger 3 on D, between the two black keys). A
  // real treble staff with one sharp (no F appears); repeated (played twice).
  // Rhythm-gated like the G song, and the pitch must be right too.
  zebra: {
    id: 'zebra',
    title: 'Homework: Zebra',
    gem: 'gold', by: 'teacher', bpm: 80, clef: 'treble', sharps: ['F'], repeat: true, rhythm: true, pitched: true,
    notes: fingers([
      ...rh([...n(0.5, 67, 67, 67, 67), ...n(1, 67, 67)]), // m1
      ...lh([...n(1, 62, 64), ...n(2, 62)]), // m2
      ...rh([...n(0.5, 69, 69, 69, 69), ...n(1, 69, 69)]), // m3
      ...lh([...n(1, 62, 64), ...n(2, 62)]), // m4
      ...rh([...n(0.5, 67, 67, 67, 67), ...n(1, 67, 67)]), // m5 = m1
      ...lh([...n(1, 62, 64), ...n(2, 62)]), // m6 = m4
      ...rh([...n(2, 71), ...n(1, 69, 69)]), // m7
      ...rh(n(4, 67)), // m8
    ], { 0: 2, 6: 3, 7: 2, 8: 3, 9: 2, 15: 3, 18: 2, 24: 3, 27: 4, 28: 3, 30: 2 }),
    setup: [{ at: 0, hands: [{ hand: 'left', finger: 3 }, { hand: 'right', finger: 2 }], text: 'Left hand: finger 3 on D. Right hand: finger 2 on G.' }],
  },
  // C position, right hand first. The whole notes are counted "(2 - 3 - 4)".
  train: {
    id: 'train',
    title: 'Homework: Train',
    gem: 'ruby', twice: true, by: 'teacher', bpm: 80, clef: 'grand',
    notes: [
      ...fingers([...n(1, R.C, R.D, R.C, R.D), ...n(1, R.E, R.D, R.E, R.D), ...n(1, R.C, R.D, R.E, R.F), ...n(4, R.G)],
        { 0: 1, 4: 3, 5: 2, 6: 3, 7: 2 }),
      ...fingers([...n(1, L.G, L.F, L.G, L.F), ...n(1, L.E, L.F, L.E, L.F), ...n(1, L.G, L.F, L.E, L.D), ...n(4, L.C)],
        { 0: 1, 4: 3, 5: 2, 6: 3, 7: 2 }),
    ],
    setup: [{ at: 0, ...RIGHT }, { at: 13, ...LEFT }],
  },
  // C position, left hand first.
  ode: {
    id: 'ode',
    title: 'Homework: Ode',
    gem: 'diamond', twice: true, by: 'teacher', bpm: 80, clef: 'grand',
    notes: [
      ...fingers([...n(1, L.E, L.E, L.F, L.G), ...n(1, L.G, L.F, L.E, L.D), ...n(1, L.C, L.C, L.D, L.E), ...n(1, L.E, L.D), ...n(2, L.D)],
        { 0: 3, 3: 1, 8: 5, 12: 3, 13: 4 }),
      ...fingers([...n(1, R.E, R.E, R.F, R.G), ...n(1, R.G, R.F, R.E, R.D), ...n(1, R.C, R.C, R.D, R.E), ...n(1, R.D, R.C), ...n(2, R.C)],
        { 0: 3, 3: 5, 8: 1 }),
    ],
    setup: [{ at: 0, ...LEFT }, { at: 15, ...RIGHT }],
  },

  // --- earlier homework (the party can still play these) ---
  // Right hand, then left hand.
  updown: {
    id: 'updown',
    title: 'Homework: Up and Down',
    by: 'teacher', bpm: 80, clef: 'grand',
    notes: fingers([
      ...n(1, 60, 60, 62, 62), ...n(1, 64, 64), ...n(2, 65), ...n(1, 64, 62, 60, 62), ...n(1, 64, 65), ...n(2, 67),
      ...n(1, 55, 55, 53, 53), ...n(1, 52, 52), ...n(2, 50), ...n(1, 52, 53, 55, 53), ...n(1, 52, 50), ...n(2, 48),
    ], { 0: 1, 14: 1 }), // the book marks only each hand's first note
    setup: [{ at: 0, ...RIGHT }, { at: 14, ...LEFT }],
  },
  // Left hand, then right hand; the easier of the two.
  stairs: {
    id: 'stairs',
    title: 'Homework: Stairs',
    by: 'teacher', bpm: 80, clef: 'grand',
    notes: [
      ...fingers(stairs(L), [5, 4, 3, 2, 1, _, _, 1, 2, 3, 4, 5, _, _]),
      ...fingers(stairs(R), [1, 2, 3, 4, 5, _, _, 5, 4, 3, 2, 1, _, _]),
    ],
    setup: [{ at: 0, ...LEFT }, { at: 14, ...RIGHT }],
  },
  // A rhythm piece on one note (ta-a, ta, ti-ti). The book writes it high
  // (G5) for the teacher's duet; here it's G4, which the detector hears far
  // better (piano-audio: G5 0/4, G4 14/14), and any G counts. `rhythm`: it
  // goes bar by bar, on the rhythm (see scoring.js barRhythm).
  g: {
    id: 'homework-g',
    title: 'Homework: G',
    by: 'teacher', bpm: 80, clef: 'treble', rhythm: true,
    notes: [
      ...n(2, 67, 67),
      ...n(1, 67, 67), ...n(2, 67),
      ...n(0.5, 67, 67), ...n(1, 67), ...n(0.5, 67, 67), ...n(1, 67),
      ...n(1, 67, 67), ...n(2, 67),
    ].map((x, i) => (i === 0 ? { ...x, f: 2 } : x)), // the book marks only the first
    setup: [{ at: 0, hand: 'right', finger: 2, text: 'Right hand: finger 2 on the G above middle C' }],
  },
};
