import type { Balance } from '../data/schema';
import type { WeaponType } from '../data/types';
import type { WeaponStats } from './stats';

/** Weapon ATK/MATK for a tier (PRD Section 12 tier table and type multipliers). */
export function weaponStats(b: Balance, type: WeaponType, tier: number, refine = 0): WeaponStats {
  const base = b.items.weaponAtk[Math.min(Math.max(tier, 1), 6) - 1];
  const w = b.weapons[type];
  if (type === 'staff') {
    // Staves have MATK at 1.0 and ATK at 0.3.
    return { type, atk: base * b.items.staffAtkFrac, matk: base * b.items.staffMatkMult, refine };
  }
  const atk = base * w.atkMult;
  // Maces also carry 30% of their ATK as MATK.
  return { type, atk, matk: type === 'mace' ? atk * b.items.maceMatkFrac : 0, refine };
}

export function bodyArmorDef(b: Balance, tier: number): number {
  return b.items.armorDef[Math.min(Math.max(tier, 1), 6) - 1];
}
