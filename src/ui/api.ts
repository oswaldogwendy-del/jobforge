import type { DebugApi } from '../debug/api';
import type { SlotInfo } from '../save/storage';
import type { SaveData, SettingsData } from '../save/types';
import type { NewHeroOptions } from '../sim/profile';
import type { Menu } from './store';

/** What the Preact screens can ask the game to do. Implemented by Game. */
export interface GameApi extends DebugApi {
  // Run flow
  startAdventure(): void;
  startYard(): void;
  returnToTown(): void;
  grindAgain(): void;
  finishChest(): void;
  skipIntro(): void;
  togglePause(): void;
  leaveRun(): void;
  usePotion(slot: number): void;
  // Saves and the hero
  /** The loaded hero's save. Throws on the title screen. */
  getSave(): SaveData;
  /** Changes the save, rebuilds the hero, refreshes menus and schedules an autosave. */
  mutate(fn: (s: SaveData) => void): void;
  listSlots(): Promise<SlotInfo[]>;
  loadSlot(slot: number): Promise<void>;
  createHero(slot: number, opts: NewHeroOptions): Promise<void>;
  deleteSlot(slot: number): Promise<void>;
  toTitle(): void;
  toCreate(slot: number): void;
  currentSlot(): number;
  /** Shows a look and weapon on the turntable while creating a hero. */
  previewHero(look: string, weapon: 'sword' | 'staff'): void;
  exportCode(): string;
  importCode(code: string, slot: number): Promise<string | null>;
  openMenu(menu: Menu): void;
  startBoss(): void;
  getSettings(): SettingsData;
  setSettings(patch: Partial<SettingsData>): void;
  // Debug
  cheat: {
    fillGauge(): void;
    spawnCharger(): void;
    killAll(): void;
    heal(): void;
    levelUp(): void;
    gold(): void;
  };
}
