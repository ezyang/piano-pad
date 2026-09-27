// Homework pieces, baked into the app (storage is disposable, so they live
// in code; a new piece is a deploy). Titles are neutral: no book titles or
// lyrics in this public repo. Notes are {d: beats, p: midi, f?: finger},
// with `f` only where the C-position finger numbers don't apply.
const n = (d, ...ps) => ps.map((p) => ({ d, p }));

// C five-finger position. The ✋ follows the notes: C3..G3 is the left hand
// (pinky on C3), C4..G4 the right (thumb on middle C).
const L = { C: 48, D: 50, E: 52, F: 53, G: 55 };
const R = { C: 60, D: 62, E: 64, F: 65, G: 67 };
const stairs = (h) => [
  ...n(1, h.C, h.D, h.E, h.F), ...n(1, h.G, h.G), ...n(2, h.G),
  ...n(1, h.G, h.F, h.E, h.D), ...n(1, h.C, h.C), ...n(2, h.C),
];

export const PIECES = {
  // Right hand, then left hand.
  updown: {
    id: 'updown',
    title: 'Homework: Up and Down',
    by: 'teacher', bpm: 80, clef: 'grand',
    notes: [
      ...n(1, 60, 60, 62, 62), ...n(1, 64, 64), ...n(2, 65), ...n(1, 64, 62, 60, 62), ...n(1, 64, 65), ...n(2, 67),
      ...n(1, 55, 55, 53, 53), ...n(1, 52, 52), ...n(2, 50), ...n(1, 52, 53, 55, 53), ...n(1, 52, 50), ...n(2, 48),
    ],
  },
  // Left hand, then right hand; the easier of the two.
  stairs: {
    id: 'stairs',
    title: 'Homework: Stairs',
    by: 'teacher', bpm: 80, clef: 'grand',
    notes: [...stairs(L), ...stairs(R)],
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
    ].map((x) => ({ ...x, f: 2 })),
  },
};
