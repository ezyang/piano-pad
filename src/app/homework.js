// Homework pieces, baked into the app (storage is disposable, so they live
// in code; a new piece is a deploy). Titles are neutral: no book titles or
// lyrics in this public repo. Notes are {d: beats, p: midi, f?: finger},
// with `f` exactly where the book prints a finger number. `setup` is how
// each hand starts (shown before that hand plays): from note index `at`,
// which hand, which finger goes where.
const n = (d, ...ps) => ps.map((p) => ({ d, p }));
// Put the book's finger numbers on notes (null: none printed).
const fingers = (notes, fs) => notes.map((x, i) => (fs[i] != null ? { ...x, f: fs[i] } : x));

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
  // A rhythm piece on one note (ta-a, ta, ti-ti). Written high, as in the
  // book (G5, right-hand finger 2); any octave counts in the app.
  g: {
    id: 'homework-g',
    title: 'Homework: G',
    by: 'teacher', bpm: 80, clef: 'treble',
    notes: [
      ...n(2, 79, 79),
      ...n(1, 79, 79), ...n(2, 79),
      ...n(0.5, 79, 79), ...n(1, 79), ...n(0.5, 79, 79), ...n(1, 79),
      ...n(1, 79, 79), ...n(2, 79),
    ].map((x, i) => (i === 0 ? { ...x, f: 2 } : x)), // the book marks only the first
    setup: [{ at: 0, hand: 'right', finger: 2, text: 'Right hand: finger 2 on G' }],
  },
};
