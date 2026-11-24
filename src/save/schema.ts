import { z } from 'zod';
import { STAT_IDS, type Stat } from '../data/types';
import { SAVE_VERSION, defaultSettings, type SaveData } from './types';

// Validation and migration for save files. Every schema change bumps SAVE_VERSION and adds a
// migration that upgrades version v to v + 1. tests/save.test.ts loads a fixture of each version.

const statBlock = z.object(
  Object.fromEntries(STAT_IDS.map((k) => [k, z.number().int().min(1)])) as Record<
    Stat,
    z.ZodNumber
  >,
);
const slotList = z.array(z.string().nullable());
const item = z.object({
  uid: z.string(),
  defId: z.string(),
  rarity: z.enum(['common', 'fine', 'rare', 'epic', 'legendary']),
  refine: z.number().int().min(0).max(10),
  bonus: z.partialRecord(z.enum(STAT_IDS as [Stat, ...Stat[]]), z.number()),
  slots: z.array(z.string().nullable()),
  locked: z.boolean().optional(),
});
const preset = z.object({
  stats: statBlock,
  statPointsFree: z.number().int().min(0),
  actives: slotList,
  passives: slotList,
  consumables: slotList,
  equipment: z.record(z.string(), z.string()),
});

export const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.string(),
  hero: z.object({
    name: z.string().min(1).max(20),
    look: z.string(),
    level: z.number().int().min(1).max(99),
    exp: z.number().min(0),
    gold: z.number().min(0),
    skillPointsFree: z.number().int().min(0),
    learned: z.record(z.string(), z.number().int().min(1).max(5)),
    presets: z.array(preset).min(1).max(3),
    activePreset: z.number().int().min(0).max(2),
    inventory: z.array(item),
    storage: z.array(item),
    overflow: z.array(item),
    stacks: z.record(z.string(), z.number().int().min(0)),
    bagSize: z.number().int().min(1),
  }),
  progress: z.object({
    unlockedClasses: z.array(z.string()),
    unlockedZones: z.array(z.string()),
    bossKills: z.record(z.string(), z.number().int().min(0)),
    cardPity: z.record(z.string(), z.number()),
    codex: z.array(z.string()),
    tower: z.object({
      best: z.number(),
      checkpoint: z.number(),
      tokens: z.number(),
    }),
    nightmare: z.boolean(),
    slots: z.object({ active: z.number(), passive: z.number(), presets: z.number() }),
  }),
  lifetime: z.object({ kills: z.number(), deaths: z.number(), playSec: z.number() }),
  settings: z.object({
    damageNumbers: z.enum(['on', 'compact', 'off']),
    screenShake: z.boolean(),
    fpsCounter: z.boolean(),
    uiScale: z.number().min(0.5).max(2),
    leftHanded: z.boolean(),
    autoSellCommon: z.boolean(),
    tipsSeen: z.array(z.string()),
    iosHintSeen: z.boolean(),
  }),
});

/** migrations[v] upgrades a version-v save to version v + 1. Empty while version 1 is current. */
export const migrations: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> =
  {};

export class SaveError extends Error {}

/** Upgrades any past version to the current one, then validates it. */
export function parseSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveError('The save is not an object.');
  let s = raw as Record<string, unknown>;
  let v = typeof s.version === 'number' ? s.version : 0;
  if (v < 1 || v > SAVE_VERSION) throw new SaveError(`Unknown save version ${String(s.version)}.`);
  while (v < SAVE_VERSION) {
    const m = migrations[v];
    if (!m) throw new SaveError(`No migration from version ${v}.`);
    s = m(s);
    v += 1;
    s.version = v;
  }
  // Settings added later get defaults, so an older save keeps loading.
  s.settings = { ...defaultSettings(), ...((s.settings as object) ?? {}) };
  const r = saveSchema.safeParse(s);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new SaveError(`The save is damaged at ${issue.path.join('.')}: ${issue.message}`);
  }
  return r.data as SaveData;
}
