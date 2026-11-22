// Held long notes (2026-11-22, pedagogy + parent): she cuts half notes
// short (median 1.65 beats, and speeding up to farm gems). A homework run
// earns a SPARKLY bonus gem when she holds her long notes; the normal pair
// stays exactly as it was.
//
// A long note (d ≥ 2 beats) is judged by the time from its hit to the next
// note's hit, against HER quarter note in this run (the median time from a
// quarter's hit to the next hit, among those between QUARTER_S). Held: at
// least NEED[d] quarters (half 1.7, dotted half 2.6, whole 3.5). A STALL
// (over STALL_X × d quarters: a missed chord, looking for the next note) is
// left out of the count. Only hits heard by the detector count: a grown-up
// step (time null) leaves its neighbours out, and so does the change
// between times through. Until she has played MIN_QUARTERS quarters the
// long notes wait, then are judged with what's known (live: each judged
// note twinkles if held, so she sees what earns it). The run earns the
// bonus with at least MIN_LONG counted and SHARE of them held.
export const NEED = { 2: 1.7, 3: 2.6, 4: 3.5 };
export const STALL_X = 1.5;
export const SHARE = 0.75;
export const MIN_LONG = 3;
export const MIN_QUARTERS = 2;
export const QUARTER_S = [0.15, 2.5];

const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const need = (d) => NEED[d] ?? 0.875 * d;

// seq: [{ d, pass }] in playing order. hit(k, time | null) when note k
// passes (time: its attack, s; null: a grown-up's step); returns the long
// notes judged just now [{ k, d, ms, ratio, held, stall }].
export function holdTracker(seq) {
  const at = [], qs = [], pending = [], judged = [];
  const judge = () => {
    if (qs.length < MIN_QUARTERS || !pending.length) return [];
    const q = median(qs);
    const out = pending.splice(0).map(({ k, d, iv }) => {
      const ratio = iv / q, stall = ratio > STALL_X * d;
      return { k, d, ms: Math.round(iv * 1000), ratio: Math.round(ratio * 100) / 100, stall, held: !stall && ratio >= need(d) };
    });
    judged.push(...out);
    return out;
  };
  return {
    hit(k, time) {
      at[k] = time;
      const p = k - 1;
      if (p >= 0 && seq[p].pass === seq[k].pass && at[p] != null && time != null) {
        const iv = time - at[p], d = seq[p].d;
        if (d === 1 && iv >= QUARTER_S[0] && iv <= QUARTER_S[1]) qs.push(iv);
        else if (d >= 2) pending.push({ k: p, d, iv });
      }
      return judge();
    },
    summary() {
      const counted = judged.filter((x) => !x.stall), held = counted.filter((x) => x.held).length;
      const q = median(qs);
      return {
        quarterMs: q == null ? null : Math.round(q * 1000), quarters: qs.length,
        held, counted: counted.length, stalls: judged.length - counted.length, unjudged: pending.length,
        bonus: counted.length >= MIN_LONG && held >= SHARE * counted.length,
        notes: judged,
      };
    },
  };
}
