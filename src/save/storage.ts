import { createStore, del, get, set } from 'idb-keyval';
import { parseSave } from './schema';
import type { SaveData } from './types';

// Three hero slots in IndexedDB (PRD Section 16). If IndexedDB is unavailable (private browsing,
// blocked storage) the game keeps working from memory and the UI shows a warning.

export const SLOT_COUNT = 3;
const key = (slot: number) => `slot.${slot}`;

let store: ReturnType<typeof createStore> | null = null;
let degraded = false;
const memory = new Map<string, unknown>();

function db() {
  if (!store) store = createStore('jobforge', 'saves');
  return store;
}

/** True once a read or write failed, so progress is only held in memory. */
export function storageDegraded(): boolean {
  return degraded;
}

async function read(k: string): Promise<unknown> {
  if (!degraded) {
    try {
      return await get(k, db());
    } catch {
      degraded = true;
    }
  }
  return memory.get(k);
}

async function write(k: string, v: unknown): Promise<void> {
  memory.set(k, v);
  if (degraded) return;
  try {
    await set(k, v, db());
  } catch {
    degraded = true;
  }
}

export async function loadSlot(slot: number): Promise<SaveData | null> {
  const raw = await read(key(slot));
  if (!raw) return null;
  return parseSave(raw);
}

export async function saveSlot(slot: number, save: SaveData): Promise<void> {
  await write(key(slot), { ...save, savedAt: new Date().toISOString() });
}

export async function deleteSlot(slot: number): Promise<void> {
  memory.delete(key(slot));
  if (degraded) return;
  try {
    await del(key(slot), db());
  } catch {
    degraded = true;
  }
}

export interface SlotInfo {
  slot: number;
  save: SaveData | null;
  /** Set when a slot holds a save that no longer loads. */
  error?: string;
}

export async function listSlots(): Promise<SlotInfo[]> {
  const out: SlotInfo[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    try {
      out.push({ slot: i, save: await loadSlot(i) });
    } catch (e) {
      out.push({ slot: i, save: null, error: e instanceof Error ? e.message : 'Unreadable save' });
    }
  }
  return out;
}

/** Asks the browser not to evict our storage. Safe to call every launch. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
