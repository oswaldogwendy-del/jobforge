import type { DebugApi } from '../debug/api';
import type { HeroBuild } from '../sim/loadout';

/** What the Preact screens can ask the game to do. Implemented by Game. */
export interface GameApi extends DebugApi {
  startAdventure(): void;
  startYard(): void;
  returnToTown(): void;
  grindAgain(): void;
  finishChest(): void;
  skipIntro(): void;
  togglePause(): void;
  leaveRun(): void;
  getBuild(): HeroBuild;
  setBuild(b: HeroBuild): void;
  loadPreset(key: string): void;
  cheat: { fillGauge(): void; spawnCharger(): void; killAll(): void; heal(): void };
}
