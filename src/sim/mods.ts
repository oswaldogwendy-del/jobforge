import { rv } from './ranked';
import type { StatMod } from '../data/types';
import type { ModEntry } from './types';
import { zeroBonuses, type Bonuses } from './stats';

/** Resolves ranked StatMods at a rank into plain numbers. */
export function resolveMods(
  mods: StatMod[],
  rank: number,
  maxRank: number,
  tags?: string[],
): ModEntry[] {
  return mods.map((m) => ({
    stat: m.stat,
    add: rv(m.add, rank, maxRank),
    pct: rv(m.pct, rank, maxRank),
    tags,
  }));
}

/** Sums a stat over mods. Mods with tags only count when `tags` shares one with them. */
export function sumMod(
  mods: ModEntry[],
  stat: string,
  tags?: string[],
): { add: number; pct: number } {
  let add = 0;
  let pct = 0;
  for (const m of mods) {
    if (m.stat !== stat) continue;
    if (m.tags && m.tags.length > 0) {
      if (!tags || !m.tags.some((t) => tags.includes(t))) continue;
    }
    add += m.add;
    pct += m.pct;
  }
  return { add, pct };
}

/** Folds untagged mods into the Bonuses struct used by deriveHero. */
export function bonusesFromMods(mods: ModEntry[], base: Bonuses = zeroBonuses()): Bonuses {
  const s = (stat: string) => sumMod(mods, stat);
  const o = { ...base };
  o.maxHpPct += s('maxHpPct').pct;
  o.maxSpPct += s('maxSpPct').pct;
  o.spRegen += s('spRegen').add;
  o.def += s('def').add;
  o.mdef += s('mdef').add;
  o.hit += s('hit').add;
  o.flee += s('flee').add;
  o.atkPct += s('atkPct').pct;
  o.matkPct += s('matkPct').pct;
  o.apsPct += s('aps').pct;
  o.castSpeed += s('castSpeed').pct;
  o.cdr += s('cdr').pct * 100 + s('cdr').add;
  o.critChance += s('critChance').add;
  o.critDamage += s('critDamage').add;
  o.moveSpeedPct += s('moveSpeed').pct;
  o.dropRate += s('dropRate').pct;
  o.goldRate += s('goldRate').pct;
  return o;
}
