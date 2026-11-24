// Renders public/icon.svg into the PNG icons the PWA manifest and iOS need. Run: npm run icons
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const svg = readFileSync(join(ROOT, 'public', 'icon.svg'));
const out = join(ROOT, 'public', 'icons');
mkdirSync(out, { recursive: true });

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
writeFileSync(join(out, 'icon-192.png'), await png(192));
writeFileSync(join(out, 'icon-512.png'), await png(512));
writeFileSync(join(out, 'apple-touch-icon.png'), await png(180));

// Maskable: content must sit inside the central 80% safe zone, so shrink it onto a full-bleed fill.
const inner = await sharp(svg, { density: 384 }).resize(380, 380).png().toBuffer();
const maskable = await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#10162b' },
})
  .composite([{ input: inner, gravity: 'centre' }])
  .png()
  .toBuffer();
writeFileSync(join(out, 'maskable-512.png'), maskable);
console.log('Icons written to public/icons');
