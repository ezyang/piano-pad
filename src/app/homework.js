// This week's homework, baked into the app (storage is disposable, so the
// piece lives in code; a new piece is a deploy). C five-finger position: the
// first half is the right hand (thumb on middle C), the second half the left
// hand (pinky on the C below), so ✋ switches hands at the midpoint.
const q = (...ps) => ps.map((p) => ({ d: 1, p }));
const half = (p) => ({ d: 2, p });

export const HOMEWORK = {
  id: 'homework',
  title: 'Homework: Up and Down',
  by: 'teacher',
  bpm: 80,
  clef: 'grand',
  notes: [
    // RH: C C D D | E E F- | E D C D | E F G-
    ...q(60, 60, 62, 62), ...q(64, 64), half(65), ...q(64, 62, 60, 62), ...q(64, 65), half(67),
    // LH: G G F F | E E D- | E F G F | E D C-
    ...q(55, 55, 53, 53), ...q(52, 52), half(50), ...q(52, 53, 55, 53), ...q(52, 50), half(48),
  ],
};
