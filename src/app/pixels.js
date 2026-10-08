// Procedural 16x16 pixel-art textures and sprite rendering. Everything is
// drawn into small canvases and handed out as data URLs for CSS, rendered
// with `image-rendering: pixelated`.
import { mulberry32 } from '../synth.js';
import { pitchClass } from './music.js';

const cache = new Map();

function tex(key, draw, w = 16, h = 16) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, mulberry32([...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0));
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const px = (g, x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); };
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function speckle(g, rng, colors) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, pick(rng, colors));
}

const DRAW = {
  grass(g, rng) {
    speckle(g, rng, ['#866043', '#79553a', '#96704f', '#6b4a32']);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(rng() * 3);
      for (let y = 0; y < h; y++) px(g, x, y, pick(rng, ['#5d9e36', '#6fb43f', '#4f8a2c']));
    }
  },
  snow(g, rng) {
    speckle(g, rng, ['#866043', '#79553a', '#96704f', '#6b4a32']);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(rng() * 3);
      for (let y = 0; y < h; y++) px(g, x, y, pick(rng, ['#ffffff', '#eef6fb', '#dbe9f2']));
    }
  },
  sand(g, rng) { speckle(g, rng, ['#e8d59a', '#dcc88a', '#f0e0a8', '#d6c07e']); },
  dirt(g, rng) { speckle(g, rng, ['#866043', '#79553a', '#96704f', '#6b4a32']); },
  planks(g, rng) {
    speckle(g, rng, ['#b8945f', '#a88452', '#c29d68']);
    g.fillStyle = '#7d6139';
    for (const y of [3, 7, 11, 15]) g.fillRect(0, y, 16, 1);
    for (const [x, y] of [[5, 0], [12, 4], [3, 8], [9, 12]]) g.fillRect(x, y, 1, 3);
  },
  stone(g, rng) {
    speckle(g, rng, ['#8a8a8a', '#7a7a7a', '#999999', '#6e6e6e']);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#5f5f5f'; g.fillRect(Math.floor(rng() * 14), Math.floor(rng() * 15), 2, 1); }
  },
  brick(g, rng) {
    g.fillStyle = '#9a9a92'; g.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let b = -1; b < 2; b++) {
        const x0 = b * 8 + off;
        for (let y = row * 4; y < row * 4 + 3; y++) for (let x = x0; x < x0 + 7; x++)
          if (x >= 0 && x < 16) px(g, x, y, pick(rng, ['#a4513a', '#96462f', '#b25b43']));
      }
    }
  },
  gold(g, rng) {
    speckle(g, rng, ['#f5d63d', '#fce15a', '#e8c22c']);
    g.fillStyle = '#fff6a8'; g.fillRect(1, 1, 14, 1); g.fillRect(1, 1, 1, 14);
    g.fillStyle = '#c99a16'; g.fillRect(1, 14, 15, 2); g.fillRect(14, 1, 2, 15);
    for (let i = 0; i < 3; i++) px(g, 3 + Math.floor(rng() * 9), 3 + Math.floor(rng() * 9), '#ffffff');
  },
  diamond(g, rng) {
    speckle(g, rng, ['#62ecdf', '#4bd6ca', '#79f4e8']);
    g.fillStyle = '#cafff9'; g.fillRect(1, 1, 14, 1); g.fillRect(1, 1, 1, 14);
    g.fillStyle = '#2aa89c'; g.fillRect(1, 14, 15, 2); g.fillRect(14, 1, 2, 15);
    for (let i = 0; i < 4; i++) px(g, 3 + Math.floor(rng() * 9), 3 + Math.floor(rng() * 9), '#ffffff');
  },
  amethyst(g, rng) {
    speckle(g, rng, ['#9a5cc6', '#8a4bb8', '#b374dc', '#7a3fa6']);
    for (let i = 0; i < 5; i++) { const x = Math.floor(rng() * 14), y = Math.floor(rng() * 14); g.fillStyle = '#e2b8ff'; g.fillRect(x, y, 2, 1); g.fillRect(x, y + 1, 1, 1); }
  },
  bedrock(g, rng) { speckle(g, rng, ['#3a3a3a', '#555555', '#2b2b2b', '#6a6a6a']); },
  cloud(g) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 16); },
};

export const texture = (name) => tex(name, DRAW[name]);

// One material per pitch letter. Sharps use the letter below.
export const MATERIALS = [
  { letter: 'C', name: 'grass', color: '#5d9e36' },
  null,
  { letter: 'D', name: 'planks', color: '#b8945f' },
  null,
  { letter: 'E', name: 'stone', color: '#8a8a8a' },
  { letter: 'F', name: 'brick', color: '#a4513a' },
  null,
  { letter: 'G', name: 'gold', color: '#f5d63d' },
  null,
  { letter: 'A', name: 'diamond', color: '#62ecdf' },
  null,
  { letter: 'B', name: 'amethyst', color: '#9a5cc6' },
];

export function material(midi) {
  const pc = pitchClass(midi);
  const m = MATERIALS[pc] ?? MATERIALS[pc - 1];
  return { ...m, url: texture(m.name) };
}

// Sprites: rows of palette characters, '.' = transparent.
export function sprite(rows, palette, key) {
  const h = rows.length, w = rows[0].length;
  return tex('sprite:' + (key ?? rows.join('/')), (g) => {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && palette[ch]) px(g, x, y, palette[ch]); }));
  }, w, h);
}

// Character stored as a grid of palette indices (-1 = transparent).
export const CHAR_W = 10, CHAR_H = 14;
export const CHAR_PALETTE = [
  '#000000', '#ffffff', '#f2c79b', '#c68857', '#7a4a2a', '#3b2415',
  '#e8433a', '#ff8fb3', '#ffd84a', '#5fc24a', '#2f7de1', '#9a5cc6',
  '#8a8a8a', '#55e0d6', '#ff9a2e', '#2b2b2b',
];

// jewels: [{ i, m }] to show on her (see characterSvg).
export function characterUrl(grid, jewels = []) {
  if (jewels.length) return characterSvg(grid, jewels);
  const rows = [];
  for (let y = 0; y < CHAR_H; y++) {
    let r = '';
    for (let x = 0; x < CHAR_W; x++) {
      const v = grid[y * CHAR_W + x];
      r += v < 0 ? '.' : v.toString(16);
    }
    rows.push(r);
  }
  const palette = Object.fromEntries(CHAR_PALETTE.map((c, i) => [i.toString(16), c]));
  return sprite(rows, palette, 'char:' + rows.join(''));
}

// --- Jewels (jewels.js): shiny gems she earns and places on her character.
// A jewel is { i: cell index, m: gem name }, kept beside her character
// (store.js `pianopad.jewels`). Each gem: the table (c, the middle), the
// facets around it lit from the top left (l top, s left, m right, d bottom
// and rim).
const mix = (hex, to, t) => '#' + [1, 3, 5].map((k) => {
  const a = parseInt(hex.slice(k, k + 2), 16), b = parseInt(to.slice(k, k + 2), 16);
  return Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
}).join('');
const gemTones = (l, c, d) => ({ l, c, d, s: mix(c, l, 0.45), m: mix(c, d, 0.45) });
export const GEMS = {
  gold: gemTones('#fff3a0', '#ffc928', '#a87200'),
  ruby: gemTones('#ffa3b4', '#ec1c45', '#78061f'),
  diamond: gemTones('#ecffff', '#6eeaf2', '#1a93a8'),
  emerald: gemTones('#b0f8c9', '#22c96c', '#066b37'),
  amethyst: gemTones('#ebcbff', '#a95ee8', '#55208a'),
  sapphire: gemTones('#b0ccff', '#3170f4', '#102f94'),
};
export const GEM_NAMES = Object.keys(GEMS);
// Jewels saved before gems (9041ed3) carry a Build block name: each becomes
// a gem (planks were Train's, now ruby; stone was Ode's, now diamond).
const OLD_GEM = { planks: 'ruby', stone: 'diamond', grass: 'emerald', brick: 'ruby' };
export const gemName = (name) => (GEMS[name] ? name : OLD_GEM[name] ?? 'gold');
export const jewelColors = (name) => GEMS[gemName(name)];
// A piece's gem: its own `gem` (homework.js), else by its place k in the list.
export const pieceGem = (piece, k = 0) => (GEMS[piece?.gem] ? piece.gem : GEM_NAMES[k % GEM_NAMES.length]);
// A CSS custom-property string for an element showing a jewel (.gem in app.css).
export const jewelStyle = (name) => { const { c, l, s, m, d } = jewelColors(name); return `--c:${c};--l:${l};--s:${s};--m:${m};--d:${d}`; };

// With jewels, her character is an animated SVG: every cell a crisp square,
// each jewel faceted with a slow shimmer and a twinkling glint (SMIL, which
// plays inside an <img>). Same 10x14 natural size as the PNG.
function characterSvg(grid, jewels) {
  const at = new Map(jewels.map((j) => [j.i, j.m]));
  let body = '', gems = '', glints = '';
  for (let y = 0; y < CHAR_H; y++) {
    for (let x = 0; x < CHAR_W; x++) {
      const i = y * CHAR_W + x, v = grid[i];
      if (at.has(i)) continue;
      if (v < 0) continue;
      // Run of the same colour along the row: one rect.
      let w = 1;
      while (x + w < CHAR_W && grid[i + w] === v && !at.has(i + w)) w++;
      body += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${CHAR_PALETTE[v]}"/>`;
      x += w - 1;
    }
  }
  jewels.forEach(({ i, m: name }, k) => {
    const x = i % CHAR_W, y = Math.floor(i / CHAR_W), { c, l, s, m, d } = jewelColors(name);
    const beg = -((k * 0.83) % 2.6).toFixed(2);
    // Facets: the cell in the dark tone, then top, left and right facets
    // meeting a square table in the middle, and a white fleck on the table.
    const o = 0.27, e = 1 - o;
    gems += `<rect x="${x}" y="${y}" width="1" height="1" fill="${d}"/>`
      + `<path d="M${x} ${y}h1l${-o} ${o}h${-(e - o)}z" fill="${l}"/>`
      + `<path d="M${x} ${y}l${o} ${o}v${e - o}l${-o} ${o}z" fill="${s}"/>`
      + `<path d="M${x + 1} ${y}v1l${-o} ${-o}v${-(e - o)}z" fill="${m}"/>`
      + `<rect x="${x + o}" y="${y + o}" width="${e - o}" height="${e - o}" fill="${c}"/>`
      + `<rect x="${x + o + 0.06}" y="${y + o + 0.06}" width="0.14" height="0.14" fill="#fff" opacity="0.9"/>`
      + `<rect x="${x}" y="${y}" width="1" height="1" fill="#fff" opacity="0"><animate attributeName="opacity" values="0;0;0.55;0" keyTimes="0;0.6;0.8;1" dur="2.6s" begin="${beg}s" repeatCount="indefinite"/></rect>`;
    const cx = x + 0.3, cy = y + 0.3, r = 0.55, q = 0.1;
    glints += `<path d="M${cx} ${cy - r}L${cx + q} ${cy - q}L${cx + r} ${cy}L${cx + q} ${cy + q}L${cx} ${cy + r}L${cx - q} ${cy + q}L${cx - r} ${cy}L${cx - q} ${cy - q}z" fill="#fff" opacity="0">`
      + `<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.66;0.8;1" dur="2.6s" begin="${beg}s" repeatCount="indefinite"/></path>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHAR_W}" height="${CHAR_H}" viewBox="0 0 ${CHAR_W} ${CHAR_H}"><g shape-rendering="crispEdges">${body}</g>${gems}${glints}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Default character: a little blocky princess.
export function defaultCharacter() {
  const art = [
    '..8.8.8...',
    '..88888...',
    '.5555555..',
    '.5222225..',
    '.5202025..',
    '.5222225..',
    '.5527255..',
    '..77777...',
    '.7777777..',
    '2.77777.2.',
    '..77777...',
    '.7777777..',
    '..2...2...',
    '..5...5...',
  ];
  return art.flatMap((row) => [...row].map((ch) => (ch === '.' ? -1 : parseInt(ch, 16))));
}

// Band members (after the player herself).
const P = { k: '#1b1b1b', w: '#ffffff', g: '#5fc24a', G: '#3c8a2e', y: '#ffd84a', o: '#ff9a2e', s: '#9aa6b2', S: '#6b7680', r: '#e8433a', p: '#ff8fb3', b: '#2f7de1', c: '#55e0d6', l: '#9a5cc6', L: '#c9a0ea', O: '#c4651a', n: '#2b3a67', B: '#1f4fa0' };
export const BAND = [
  { id: 'piano', name: 'You!', instrument: 'piano' },
  {
    id: 'frog', name: 'Froggy', instrument: 'bass',
    art: ['..........', '.ww....ww.', '.wk.gg.kw.', '.gggggggg.', 'gggggggggg', 'gGrrrrrrGg', 'gGGGGGGGGg', 'gggggggggg', '.gg....gg.', 'GG......GG'],
  },
  {
    id: 'bot', name: 'Beep Bot', instrument: 'drums',
    art: ['....rr....', '....ss....', '.ssssssss.', '.sccsscc s', '.ssssssss.', '.sskkkkss.', '.ssssssss.', '..SSSSSS..', '.sSbbbbSs.', '.sSbbbbSs.', '..s....s..', '.SS....SS.'],
  },
  {
    id: 'bee', name: 'Buzzy', instrument: 'musicbox',
    art: ['..ww..ww..', '..www.ww..', '...kyyk...', '..yyyyyy..', '.ykyyyyky.', '.yyyyyyyy.', '.kkkkkkkk.', '.yyyyyyyy.', '..kkkkkk..', '...yyyy...', '....kk....'],
  },
  {
    id: 'slime', name: 'Blobby', instrument: 'chip', hi: 'Bloop bloop!',
    art: ['.LLLLLLLL.', 'LllllllllL', 'LlkklkklLL', 'LlkklkklLL', 'LllllllllL', 'LlllkklllL', 'LllllllllL', '.LLLLLLLL.'],
  },
];
export const bandSprite = (m) => sprite(m.art.map((r) => r.replace(/ /g, '.')), P, 'band:' + m.id);
// Surprise guests: the adventure's headliner, one per adventure, drawn
// from these and Blobby (BAND above; adventure.js GUESTS). Kept out of BAND
// so the older screens that walk BAND (band, play, Copy me's dancers)
// don't change. `hi`: the welcome line under the name.
export const GUESTS = [
  {
    id: 'cat', name: 'Kitty', instrument: 'meow', hi: 'Meow! I sing!',
    art: ['.O......O.', '.oO....Oo.', '.oooOOooo.', 'oooooooooo', 'oowkoowkoo', 'ookkookkoo', 'ooooppoooo', '.ooowwooo.', '..oooooo.O', '.oOooooOoO', '.oooooooo.', '.ww....ww.'],
  },
  {
    id: 'dragon', name: 'Sparky', instrument: 'horn', hi: 'Toot toot! Hi!',
    art: ['.y......y.', '.yb....by.', '..bbbbbb..', '.bbbbbbbb.', '.bwkbbwkb.', '.bbbbbbbb.', '..bbrrbb..', 'cc.bbbb.cc', 'ccbyyyybcc', '.cbyyyybc.', '..byyyybBB', '..bb..bb.B'],
  },
  {
    id: 'penguin', name: 'Waddles', instrument: 'xylo', hi: 'Ding ding! Hello!',
    art: ['...nnnn...', '..nnnnnn..', '.nwwnnwwn.', '.nwknnwkn.', '.nnnoonnn.', 'nnnwoownnn', 'nnwwwwwwnn', 'nnwwwwwwnn', '.nwwwwwwn.', '.nwwwwwwn.', '..nwwwwn..', '..oo..oo..'],
  },
];
// Any band member or guest, by id.
export const bandMember = (id) => BAND.find((m) => m.id === id) ?? GUESTS.find((m) => m.id === id);

// --- The bunny house (adventure.js, before Zebra; 2026-10-08): the
// teacher's "tall round bunny house" hand. A bunny, and a hand seen from
// the side over the keys: fingertip down on a key, the finger curving up
// to a high knuckle, the back of the hand and the wrist level, so there's
// a tall round room underneath for the bunny. BUNNY_HOUSE gives the scene's
// size and where the bunny waits (outside, on the keys) and hides (under
// the hand), in its pixels.
const BUNNY_P = { k: '#3b2415', w: '#ffffff', p: '#ff8fb3', e: '#1b1b1b' };
const BUNNY_ART = [
  '.kk...kk.',
  '.kwk.kwk.',
  '.kpk.kpk.',
  '.kpk.kpk.',
  '.kwkkkwk.',
  'kwwwwwwwk',
  'kwewwwewk',
  'kpwwpwwpk',
  '.kwwwwwk.',
  'kwwwwwwwk',
  'kwwwwwwwk',
  '.kkkkkkk.',
];
export const bunnyUrl = () => sprite(BUNNY_ART, BUNNY_P, 'bunny');
export const BUNNY_HOUSE = { w: 48, h: 28, bunny: { w: 9, h: 12 }, out: { x: 37, y: 10 }, in: { x: 13, y: 10 } };
export function bunnyHouseUrl() {
  const { w: W, h: H } = BUNNY_HOUSE, KEYS = 22;
  return tex('bunny-house', (g) => {
    // The keys: white keys with grey gaps, black keys at the back.
    g.fillStyle = '#3b2415'; g.fillRect(0, KEYS, W, H - KEYS);
    for (let x = 0; x < W; x += 6) { g.fillStyle = '#ffffff'; g.fillRect(x + 1, KEYS + 1, 5, H - KEYS - 1); g.fillStyle = '#d9d9d9'; g.fillRect(x + 1, H - 1, 5, 1); }
    for (let x = 0, i = 0; x < W; x += 6, i++) if (i % 7 !== 2 && i % 7 !== 6) { g.fillStyle = '#1b1b1b'; g.fillRect(x + 4, KEYS + 1, 4, 3); }
    // The hand: thick curves (fingertips → knuckle → wrist → arm), filled,
    // shaded underneath, outlined. A second finger peeks out behind.
    const curve = (out, a, b, c, d, n, r0, r1) => { for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1], r0 + (r1 - r0) * t]); } return out; };
    const back = curve([], [4.5, 20.6], [3.5, 11], [7, 3.5], [15, 3.5], 40, 1.5, 2.2);
    const front = curve([], [8.5, 20.6], [7.5, 12], [10, 5], [17, 4.5], 40, 1.6, 2.4);
    curve(front, [17, 4.5], [22, 4.3], [27, 6], [31, 6.8], 30, 2.6, 3.0); // the back of the hand
    curve(front, [31, 6.8], [36, 7.2], [42, 6], [W + 2, 5.5], 30, 3.0, 3.2); // wrist and arm
    front.push([16, 4.2, 2.8]); // the knuckle, the house's roof
    const inside = (pts) => (x, y) => x >= 0 && y >= 0 && x < W && y < KEYS && pts.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
    const F = inside(front), B = inside(back), any = (x, y) => F(x, y) || B(x, y);
    for (let y = 0; y < KEYS; y++) for (let x = 0; x < W; x++) {
      if (F(x, y)) px(g, x, y, !(F(x, y + 1) && F(x, y + 2)) ? '#d89c6c' : !F(x, y - 1) ? '#ffdcb8' : '#f2c79b');
      else if (B(x, y)) px(g, x, y, F(x + 1, y) ? '#7a4a2a' : '#d89c6c');
      else if (any(x - 1, y) || any(x + 1, y) || any(x, y - 1) || any(x, y + 1)) px(g, x, y, '#7a4a2a');
    }
    for (const [x, y] of [[7, 19], [7, 20], [3, 19], [3, 20]]) px(g, x, y, '#ffe6e0'); // nails
    for (const [x, y] of [[9, 12], [10, 12], [12, 7], [12, 8]]) px(g, x, y, '#c68857'); // finger joints
  }, W, H);
}
