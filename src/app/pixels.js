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

export function characterUrl(grid) {
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
const P = { k: '#1b1b1b', w: '#ffffff', g: '#5fc24a', G: '#3c8a2e', y: '#ffd84a', o: '#ff9a2e', s: '#9aa6b2', S: '#6b7680', r: '#e8433a', p: '#ff8fb3', b: '#2f7de1', c: '#55e0d6', l: '#9a5cc6', L: '#c9a0ea' };
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
    id: 'slime', name: 'Blobby', instrument: 'chip',
    art: ['.LLLLLLLL.', 'LllllllllL', 'LlkklkklLL', 'LlkklkklLL', 'LllllllllL', 'LlllkklllL', 'LllllllllL', '.LLLLLLLL.'],
  },
];
export const bandSprite = (m) => sprite(m.art.map((r) => r.replace(/ /g, '.')), P, 'band:' + m.id);
