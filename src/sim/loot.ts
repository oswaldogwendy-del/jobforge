import type { Balance } from '../data/schema';
import { items as allItems } from '../data/content';
import type { ItemDef, ItemInstance, Rarity } from '../data/types';
import type { Rng } from '../core/rng';
import { createItem, randomItemDef, rollRarity, tierForLevel } from './items';

// Drop tables (PRD Section 12). Pure: a seeded Rng in, items and stacks out.

export interface DropStack {
  id: string;
  n: number;
}

export interface DropRoll {
  items: ItemInstance[];
  stacks: DropStack[];
}

export interface DropSource {
  level: number;
  elite: boolean;
  /** The zone's ore (Iron Shard in Zone 1). */
  materialId: string;
}

const int = (rng: Rng, [lo, hi]: number[]): number => lo + Math.floor(rng.next() * (hi - lo + 1));

function pickDef(b: Balance, rng: Rng, level: number, defs: ItemDef[]): ItemDef {
  return randomItemDef(rng, defs, tierForLevel(b, level, defs));
}

/** What one kill drops. `lootBonus` (0 to the cap) multiplies every chance. */
export function rollMonsterDrops(
  b: Balance,
  rng: Rng,
  src: DropSource,
  lootBonus: number,
  defs: ItemDef[] = allItems,
): DropRoll {
  const d = b.items.drops;
  const mult = 1 + Math.min(d.lootBonusCap, Math.max(0, lootBonus));
  const out: DropRoll = { items: [], stacks: [] };
  if (src.elite) {
    out.items.push(
      createItem(b, rng, pickDef(b, rng, src.level, defs), rollRarity(b, rng, 'fine')),
    );
    out.stacks.push({ id: src.materialId, n: int(rng, d.eliteOre) });
    if (rng.next() < d.eliteSigil * mult) out.stacks.push({ id: 'boss_sigil', n: 1 });
    return out;
  }
  if (rng.next() < d.normalEquip * mult)
    out.items.push(createItem(b, rng, pickDef(b, rng, src.level, defs), rollRarity(b, rng)));
  if (rng.next() < d.normalOre * mult) out.stacks.push({ id: src.materialId, n: 1 });
  if (rng.next() < d.normalPotion * mult)
    out.stacks.push({
      id: rng.next() < d.normalPotionMinorShare ? 'minor_health' : 'minor_mana',
      n: 1,
    });
  return out;
}

/** The victory chest: 2 to 3 items (one Rare or better), ore, and a chance at the legendaries. */
export function rollChest(
  b: Balance,
  rng: Rng,
  src: DropSource & { legendaryIds: string[] },
  lootBonus: number,
  defs: ItemDef[] = allItems,
): DropRoll {
  const d = b.items.drops;
  const mult = 1 + Math.min(d.lootBonusCap, Math.max(0, lootBonus));
  const out: DropRoll = { items: [], stacks: [] };
  const n = int(rng, d.bossItems);
  for (let i = 0; i < n; i++) {
    let rarity: Rarity;
    if (i === 0) rarity = rng.next() < d.bossEpic ? 'epic' : rollRarity(b, rng, 'rare');
    else rarity = rng.next() < d.bossEpic * 0.4 ? 'epic' : rollRarity(b, rng, 'fine');
    out.items.push(createItem(b, rng, pickDef(b, rng, src.level, defs), rarity));
  }
  for (const id of src.legendaryIds) {
    const def = defs.find((x) => x.id === id);
    if (def && rng.next() < d.bossLegendary * mult)
      out.items.push(createItem(b, rng, def, 'legendary'));
  }
  out.stacks.push({ id: src.materialId, n: int(rng, d.bossOre) });
  if (rng.next() < d.bossOblivion * mult) out.stacks.push({ id: 'oblivion_draught', n: 1 });
  return out;
}

/** Rarity word for the UI. */
export const RARITY_NAME: Record<Rarity, string> = {
  common: 'Common',
  fine: 'Fine',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};
