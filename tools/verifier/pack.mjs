// Pack a verifier model (or ensemble) for the piano profile: int8 weights
// with one scale per output row, base64 (decodeVerifier undoes it).
//   node tools/verifier/pack.mjs <model.json> [--into src/piano-profile.json]
import { readFileSync, writeFileSync } from 'node:fs';

const [src, ...rest] = process.argv.slice(2);
const into = rest[rest.indexOf('--into') + 1];
const q8 = (w, rows) => {
  const n = w.length / rows, q = new Int8Array(w.length), s = [];
  for (let r = 0; r < rows; r++) {
    let m = 0;
    for (let i = r * n; i < (r + 1) * n; i++) m = Math.max(m, Math.abs(w[i]));
    const sc = m / 127 || 1; s.push(+sc.toPrecision(6));
    for (let i = r * n; i < (r + 1) * n; i++) q[i] = Math.round(w[i] / sc);
  }
  return { q: Buffer.from(q.buffer).toString('base64'), s };
};
const pack = (m) => ({
  C: m.C, T: m.T, S: m.S,
  convs: m.convs.map((c) => ({ cin: c.cin, cout: c.cout, k: c.k, dil: c.dil, w: q8(c.w, c.cout), b: c.b })),
  W1: q8(m.W1, m.b1.length), b1: m.b1, W2: q8(m.W2, m.b2.length), b2: m.b2,
});
const m = JSON.parse(readFileSync(src, 'utf8'));
const out = { ...(m.vPostMs ? { vPostMs: m.vPostMs } : {}), ...(m.trained ? { trained: m.trained } : {}), ...(m.ensemble ? { ensemble: m.ensemble.map(pack) } : pack(m)) };
if (into) {
  const p = JSON.parse(readFileSync(into, 'utf8'));
  p.verifier = out;
  writeFileSync(into, JSON.stringify(p));
  console.log(`${into}: verifier added (${JSON.stringify(out).length} bytes)`);
} else console.log(JSON.stringify(out));
