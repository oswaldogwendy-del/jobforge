import type { EquipSlot, ItemInstance, Stat } from '../data/types';

// The save file (PRD Section 16). Bump SAVE_VERSION on every schema change and add a migration.
export const SAVE_VERSION = 1;

export type StatBlockSave = Record<Stat, number>;

export interface PresetData {
  stats: StatBlockSave;
  statPointsFree: number;
  actives: (string | null)[];
  passives: (string | null)[];
  consumables: (string | null)[];
  /** Equipped item uids by slot. */
  equipment: Partial<Record<EquipSlot, string>>;
}

export interface HeroSave {
  name: string;
  look: string;
  level: number;
  exp: number;
  gold: number;
  skillPointsFree: number;
  learned: Record<string, number>;
  presets: PresetData[];
  activePreset: number;
  inventory: ItemInstance[];
  storage: ItemInstance[];
  overflow: ItemInstance[];
  stacks: Record<string, number>;
  bagSize: number;
}

export interface ProgressSave {
  unlockedClasses: string[];
  unlockedZones: string[];
  bossKills: Record<string, number>;
  cardPity: Record<string, number>;
  codex: string[];
  tower: { best: number; checkpoint: number; tokens: number };
  nightmare: boolean;
  slots: { active: number; passive: number; presets: number };
}

export interface SettingsData {
  damageNumbers: 'on' | 'compact' | 'off';
  screenShake: boolean;
  fpsCounter: boolean;
  uiScale: number;
  leftHanded: boolean;
  autoSellCommon: boolean;
  tipsSeen: string[];
  iosHintSeen: boolean;
}

export interface SaveData {
  version: number;
  savedAt: string;
  hero: HeroSave;
  progress: ProgressSave;
  lifetime: { kills: number; deaths: number; playSec: number };
  settings: SettingsData;
}

export const defaultSettings = (): SettingsData => ({
  damageNumbers: 'on',
  screenShake: true,
  fpsCounter: true,
  uiScale: 1,
  leftHanded: false,
  autoSellCommon: false,
  tipsSeen: [],
  iosHintSeen: false,
});
