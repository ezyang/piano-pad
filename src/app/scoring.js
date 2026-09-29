// Scoring for the practice modes. Pure functions so they can be tested in Node.
//
// Rhythm is judged relative to her own tempo (the median beat length of the
// run), not a metronome: slow and steady is perfect. Each gap between two
// played notes is compared with what the notation asks for:
//   stall   — much too long (a hesitation)
//   dragged — noticeably long
//   rushed  — noticeably short
//   ok

export const STALL = 1.7, DRAG = 1.3, RUSH = 0.72;

// laid: laid-out notes; targets: indices of pitched notes; times[k]: when
// target k was played (seconds) or undefined. Returns per-target marks for
// the gap *leading into* target k.
export function rhythmReview(laid, targets, times) {
  const gaps = [];
  for (let k = 1; k < targets.length; k++) {
    const beats = laid[targets[k]].start - laid[targets[k - 1]].start;
    const gap = times[k] - times[k - 1];
    if (beats > 0 && Number.isFinite(gap) && gap > 0) gaps.push({ k, gap, r: gap / beats });
  }
  const marks = new Map();
  if (gaps.length < 2) return { marks, beat: NaN, stalls: 0, rhythm: gaps.length ? 1 : NaN, assessed: gaps.length };
  const beat = [...gaps].sort((a, b) => a.r - b.r)[gaps.length >> 1].r;
  let ok = 0, stalls = 0;
  for (const { k, gap, r } of gaps) {
    const rel = r / beat;
    let m = 'ok';
    if (rel > STALL && gap > 0.5) m = 'stall';
    else if (rel > DRAG) m = 'dragged';
    else if (rel < RUSH) m = 'rushed';
    marks.set(k, m);
    if (m === 'ok') ok++;
    if (m === 'stall') stalls++;
  }
  return { marks, beat, stalls, rhythm: ok / gaps.length, assessed: gaps.length };
}

const starsFor = (score, [a, b, c]) => (score >= a ? 3 : score >= b ? 2 : score >= c ? 1 : 0);

// Learn: only wrong tries matter.
export function scoreLearn(wrong) {
  return { stars: wrong <= 1 ? 3 : wrong <= 4 ? 2 : 1, wrong };
}

// Keep going: right notes, rhythm, and not stopping.
export function scoreGo(n, grades, review) {
  let right = 0;
  for (let k = 0; k < n; k++) right += { hit: 1, fixed: 0.6 }[grades.get(k)] ?? 0;
  const notes = right / Math.max(1, n);
  const rhythm = Number.isFinite(review.rhythm) ? review.rhythm : 1;
  const steady = review.assessed ? 1 - review.stalls / review.assessed : 1;
  const score = 0.45 * notes + 0.3 * rhythm + 0.25 * steady;
  return { stars: starsFor(score, [0.88, 0.7, 0.45]), notes, rhythm, stalls: review.stalls, right, n };
}

// Beat: per-note timing grades against the count-in tempo.
export const GRADE_SCORE = { perfect: 1, good: 0.75, early: 0.45, late: 0.45, wrong: 0.2, miss: 0 };
export function scoreBeat(n, grades) {
  const c = { perfect: 0, good: 0, early: 0, late: 0, wrong: 0, miss: 0 };
  let total = 0;
  for (let k = 0; k < n; k++) {
    const g = grades.get(k) ?? 'miss';
    c[g]++;
    total += GRADE_SCORE[g];
  }
  return { stars: starsFor(total / Math.max(1, n), [0.85, 0.6, 0.3]), counts: c };
}

// Beat grade from signed timing error (seconds; negative = early).
export const beatGrade = (err) => (Math.abs(err) < 0.08 ? 'perfect' : Math.abs(err) < 0.16 ? 'good' : err < 0 ? 'early' : 'late');

// A bar's rhythm, for rhythm pieces (the G song): is it roughly right at her
// own tempo? Only contrasts inside the bar count, generously: long notes
// (ta-a) clearly longer than ta's, quick ones (ti) clearly shorter, and
// notes of the same length roughly even. durs[j]: note j's length in beats;
// iois[j]: seconds from note j to the next one she played (a bar's last
// note is timed to the next bar's first; the piece's last note isn't
// timed, so pass one fewer). Returns { ok, why? }.
export const RHYTHM = { long: 1.4, quick: 0.8, even: 2 };
export function barRhythm(durs, iois) {
  const cls = (d) => (d >= 2 ? 'long' : d <= 0.5 ? 'quick' : 'ta');
  const by = { long: [], ta: [], quick: [] };
  iois.forEach((t, j) => by[cls(durs[j])].push(t));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const [name, xs] of Object.entries(by)) {
    if (xs.length > 1 && Math.max(...xs) > RHYTHM.even * Math.min(...xs)) return { ok: false, why: `uneven-${name}` };
  }
  if (by.long.length && by.ta.length && mean(by.long) < RHYTHM.long * mean(by.ta)) return { ok: false, why: 'long-too-short' };
  if (by.quick.length && by.ta.length && mean(by.quick) > RHYTHM.quick * mean(by.ta)) return { ok: false, why: 'quick-too-slow' };
  return { ok: true };
}
