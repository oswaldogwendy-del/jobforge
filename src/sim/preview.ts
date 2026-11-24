import type { Balance } from '../data/schema';
import { STAT_IDS } from '../data/types';
import type { HeroBuild } from './loadout';
import { weaponStats } from './gear';
import { deriveHero, zeroBonuses, type DerivedStats } from './stats';

/** Derived stats for a build from stats and gear alone (no passives or buffs), for the Status window. */
export function previewStats(b: Balance, build: HeroBuild): DerivedStats {
  const gear = build.gear;
  const stats = { ...build.stats };
  for (const k of STAT_IDS) stats[k] += gear?.stats[k] ?? 0;
  const bw = build.weapon;
  const weapon =
    bw.atk !== undefined || bw.matk !== undefined
      ? { type: bw.type, atk: bw.atk ?? 0, matk: bw.matk ?? 0, refine: bw.refine ?? 0 }
      : weaponStats(b, bw.type, bw.tier);
  return deriveHero(b, {
    level: build.level,
    stats,
    weapon,
    weaponAps: b.weapons[bw.type].aps,
    bonuses: {
      ...zeroBonuses(),
      gearDef: gear?.def ?? 0,
      gearMdef: gear?.mdef ?? 0,
      maxHpPct: gear?.maxHpPct ?? 0,
      maxSpPct: gear?.maxSpPct ?? 0,
      flee: gear?.flee ?? 0,
      moveSpeedPct: gear?.moveSpeedPct ?? 0,
    },
  });
}
