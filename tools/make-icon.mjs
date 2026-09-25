// Draw the home-screen icon in a browser (reusing the app's pixel textures)
// and write icon PNGs. Needs the dev server on :8000 and Playwright:
//   node tools/make-icon.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8000/index.html#/nothing');
const out = await page.evaluate(async () => {
  const { texture, characterUrl, defaultCharacter } = await import('/src/app/pixels.js');
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const N = 36; // icon drawn on a 36x36 pixel grid
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // sky with a lighter band
  g.fillStyle = '#7ec8f5'; g.fillRect(0, 0, N, N);
  g.fillStyle = '#9dd6f8'; g.fillRect(0, 14, N, 8);
  // little cloud
  g.fillStyle = '#ffffff'; g.fillRect(2, 4, 7, 2); g.fillRect(4, 3, 3, 1); g.fillRect(3, 6, 5, 1);
  // ground: grass blocks across the bottom
  const grass = await load(texture('grass'));
  for (let x = -4; x < N; x += 10) g.drawImage(grass, 0, 0, 16, 16, x, 28, 10, 10);
  // gold note block with a G
  const gold = await load(texture('gold'));
  g.drawImage(gold, 0, 0, 16, 16, 5, 16, 14, 12);
  g.fillStyle = '#7a5a00';
  for (const [x, y, w, h] of [[9, 19, 5, 1], [8, 20, 1, 5], [9, 25, 5, 1], [13, 22, 1, 3], [11, 22, 2, 1]]) g.fillRect(x, y, w, h);
  // the princess standing on the block
  const me = await load(characterUrl(defaultCharacter()));
  g.drawImage(me, 7, 2);
  // a floating eighth note
  g.fillStyle = '#2b2b2b';
  for (const [x, y, w, h] of [[26, 5, 1, 10], [27, 5, 1, 1], [28, 6, 1, 1], [29, 7, 1, 2], [28, 9, 1, 1], [23, 14, 3, 3], [24, 13, 2, 1], [24, 17, 2, 1]]) g.fillRect(x, y, w, h);
  g.fillStyle = '#ffd84a'; g.fillRect(23, 14, 1, 1); // glint
  // sparkles
  g.fillStyle = '#ffffff'; for (const [x, y] of [[21, 9], [31, 12], [22, 22]]) g.fillRect(x, y, 1, 1);
  const scaled = (size) => {
    const s = document.createElement('canvas'); s.width = s.height = size;
    const sg = s.getContext('2d'); sg.imageSmoothingEnabled = false;
    sg.drawImage(c, 0, 0, size, size);
    return s.toDataURL('image/png').split(',')[1];
  };
  return { 180: scaled(180), 192: scaled(192), 512: scaled(512), 32: scaled(32) };
});
await browser.close();
const names = { 180: 'apple-touch-icon.png', 192: 'icon-192.png', 512: 'icon-512.png', 32: 'favicon.png' };
for (const [size, b64] of Object.entries(out)) writeFileSync(new URL(`../${names[size]}`, import.meta.url), Buffer.from(b64, 'base64'));
console.log('wrote', Object.values(names).join(', '));
