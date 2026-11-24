import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { parseSave, SaveError } from './schema';
import type { SaveData } from './types';

// Export and Import: a save becomes a text code (zlib-compressed JSON in base64, with a prefix and
// a checksum), so a player can copy it between devices (PRD Section 16).

const PREFIX = 'JF1:';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** FNV-1a over the payload text: catches truncated or mistyped codes before decompressing. */
function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function exportCode(save: SaveData): string {
  const payload = toBase64(zlibSync(strToU8(JSON.stringify(save)), { level: 9 }));
  return `${PREFIX}${payload}:${checksum(payload)}`;
}

export function importCode(code: string): SaveData {
  const text = code.replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) throw new SaveError('This is not a Jobforge save code.');
  const body = text.slice(PREFIX.length);
  const cut = body.lastIndexOf(':');
  if (cut < 0) throw new SaveError('The code is incomplete.');
  const payload = body.slice(0, cut);
  if (checksum(payload) !== body.slice(cut + 1))
    throw new SaveError('The code is damaged or was cut off. Copy the whole text.');
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(unzlibSync(fromBase64(payload))));
  } catch {
    throw new SaveError('The code could not be read.');
  }
  return parseSave(json);
}
