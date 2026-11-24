import type { Balance } from '../data/schema';
import {
  STAT_IDS,
  type EquipSlot,
  type ItemBase,
  type ItemDef,
  type ItemInstance,
  type Rarity,
  type Stat,
} from '../data/types';
import type { Rng } from '../core/rng';
import type { GearTotals } from './loadout';

// Items: rarity rolls, stat scaling, equip rules and gear totals (PRD Section 12). Pure functions.

export const RARITIES: Rarity[] = ['common', 'fine', 'rare', 'epic', 'legendary'];
export const EQUIP_SLOTS: EquipSlot[] = [
  'weapon',
  'offhand',
  'head',
  'armor',
  'garment',
  'shoes',
  'acc1',
  'acc2',
];
export type Equipment = Partial<Record<EquipSlot, string>>;
export type ItemLookup = (defId: string) => ItemDef | undefined;

/** Which equipment slots an item can go in. */
export function slotsFor(def: ItemDef): EquipSlot[] {
  return def.slot === 'accessory' ? ['acc1', 'acc2'] : [def.slot];
}

function rarityMult(b: Balance, r: Rarity): number {
  return r === 'legendary' ? 1 : b.items.rarity[r].mult;
}

/** Weapon ATK, body DEF and the like for one item, with rarity and refine applied. */
export function itemBase(b: Balance, def: ItemDef, inst: ItemInstance): ItemBase {
  const m = rarityMult(b, inst.rarity);
  const refine =
    1 + inst.refine * (def.slot === 'weapon' ? b.items.refine.weaponPct : b.items.refine.armorPct);
  const out: ItemBase = { ...def.base };
  for (const k of ['atk', 'matk', 'def', 'mdef'] as const) {
    const v = def.base[k];
    if (v !== undefined) out[k] = v * m * refine;
  }
  return out;
}

/** Stat bonuses from an item: its own ring stats plus the random Rare and Epic ones. */
export function itemStats(def: ItemDef, inst: ItemInstance): Partial<Record<Stat, number>> {
  const out: Partial<Record<Stat, number>> = {};
  for (const k of STAT_IDS) {
    const v = (def.base.stats?.[k] ?? 0) + (inst.bonus[k] ?? 0);
    if (v) out[k] = v;
  }
  return out;
}

// --- Rolling ---------------------------------------------------------------------------------

/** Picks a rarity by weight. `min` skips the lower ones (Fine or better for elites). */
export function rollRarity(b: Balance, rng: Rng, min: Rarity = 'common'): Rarity {
  const pool = (['common', 'fine', 'rare', 'epic'] as const).filter(
    (r) => RARITIES.indexOf(r) >= RARITIES.indexOf(min),
  );
  const total = pool.reduce((s, r) => s + b.items.rarity[r].weight, 0);
  let x = rng.next() * total;
  for (const r of pool) {
    x -= b.items.rarity[r].weight;
    if (x < 0) return r;
  }
  return pool[pool.length - 1];
}

let uidCounter = 0;
export function newUid(rng: Rng): string {
  uidCounter = (uidCounter + 1) % 1e9;
  return `i${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(rng.next() * 1e6).toString(36)}`;
}

/** A fresh item instance: card slots and bonus stats rolled for its rarity. */
export function createItem(
  b: Balance,
  rng: Rng,
  def: ItemDef,
  rarity: Rarity = 'common',
  uid = newUid(rng),
): ItemInstance {
  const inst: ItemInstance = { uid, defId: def.id, rarity, refine: 0, bonus: {}, slots: [] };
  if (rarity === 'legendary') return inst;
  const r = b.items.rarity[rarity];
  const n = Math.min(
    def.maxSlots,
    r.slotsMin + Math.floor(rng.next() * (r.slotsMax - r.slotsMin + 1)),
  );
  inst.slots = Array.from({ length: n }, () => null);
  // Bonus stats: distinct random stats, +1 per item tier each.
  const pool = [...STAT_IDS];
  for (let i = 0; i < r.bonusStats; i++) {
    const k = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    inst.bonus[k] = def.tier;
  }
  return inst;
}

export function sellValue(b: Balance, def: ItemDef, inst: ItemInstance): number {
  return Math.max(
    1,
    Math.round(def.sellPrice * b.items.sellMult[inst.rarity] * (1 + inst.refine * 0.5)),
  );
}

// --- Equipping -------------------------------------------------------------------------------

export type EquipCheck = { ok: true } | { ok: false; reason: 'level' | 'twoHanded' };

/** Level requirement, and no off-hand while a two-handed weapon is equipped. */
export function canEquip(def: ItemDef, level: number, weaponDef: ItemDef | undefined): EquipCheck {
  if (level < def.levelReq) return { ok: false, reason: 'level' };
  if (def.slot === 'offhand' && weaponDef?.twoHanded) return { ok: false, reason: 'twoHanded' };
  return { ok: true };
}

/**
 * Equips an item. Returns the uids that came off (a replaced item, or the off-hand a two-handed
 * weapon pushes out), which the caller keeps in the bag.
 */
export function equipItem(
  eq: Equipment,
  inst: ItemInstance,
  def: ItemDef,
  slot?: EquipSlot,
): string[] {
  const removed: string[] = [];
  const options = slotsFor(def);
  const target =
    slot && options.includes(slot) ? slot : (options.find((s) => !eq[s]) ?? options[0]);
  const old = eq[target];
  if (old) removed.push(old);
  eq[target] = inst.uid;
  if (def.slot === 'weapon' && def.twoHanded && eq.offhand) {
    removed.push(eq.offhand);
    delete eq.offhand;
  }
  return removed;
}

export function unequipSlot(eq: Equipment, slot: EquipSlot): string | null {
  const uid = eq[slot];
  if (!uid) return null;
  delete eq[slot];
  return uid;
}

// --- Totals ----------------------------------------------------------------------------------

export interface GearResult {
  totals: GearTotals;
  weapon: {
    type: string;
    atk: number;
    matk: number;
    aps: number;
    range: number;
    model: string;
  } | null;
  offhandModel: string | null;
}

/** Sums everything the equipped items give the hero. */
export function gearTotals(
  b: Balance,
  eq: Equipment,
  items: Map<string, ItemInstance>,
  look: ItemLookup,
): GearResult {
  const t: GearTotals = {
    def: 0,
    mdef: 0,
    maxHpPct: 0,
    maxSpPct: 0,
    flee: 0,
    moveSpeedPct: 0,
    stats: {},
    healOnKillPct: 0,
    spellEchoChance: 0,
  };
  let weapon: GearResult['weapon'] = null;
  let offhandModel: string | null = null;
  for (const slot of EQUIP_SLOTS) {
    const uid = eq[slot];
    const inst = uid ? items.get(uid) : undefined;
    const def = inst ? look(inst.defId) : undefined;
    if (!inst || !def) continue;
    const base = itemBase(b, def, inst);
    t.def += base.def ?? 0;
    t.mdef += base.mdef ?? 0;
    t.maxHpPct += base.maxHpPct ?? 0;
    t.maxSpPct += base.maxSpPct ?? 0;
    t.flee += base.flee ?? 0;
    t.moveSpeedPct += base.moveSpeedPct ?? 0;
    for (const [k, v] of Object.entries(itemStats(def, inst)))
      t.stats[k as Stat] = (t.stats[k as Stat] ?? 0) + v;
    t.healOnKillPct += def.legendary?.healOnKillPct ?? 0;
    t.spellEchoChance += def.legendary?.spellEchoChance ?? 0;
    if (slot === 'weapon' && def.weaponType) {
      weapon = {
        type: def.weaponType,
        atk: base.atk ?? 0,
        matk: base.matk ?? 0,
        aps: def.aps ?? 1,
        range: def.range ?? 2,
        model: def.model ?? def.weaponType,
      };
    }
    if (slot === 'offhand') offhandModel = def.model ?? null;
  }
  return { totals: t, weapon, offhandModel };
}

// --- Drops -----------------------------------------------------------------------------------

export interface DropContext {
  /** Monster level, which sets the item tier. */
  level: number;
  /** Loot multiplier from LUK and gear, 0 to lootBonusCap. */
  lootBonus: number;
}

/** The tier of gear a level drops: tier 1 up to level 11, then one tier per zone range. */
export function tierForLevel(b: Balance, level: number, defs: ItemDef[]): number {
  void b;
  let tier = 1;
  for (const d of defs) if (d.levelReq <= level && !d.legendary) tier = Math.max(tier, d.tier);
  return tier;
}

/** A random non-legendary item of a tier. */
export function randomItemDef(rng: Rng, defs: ItemDef[], tier: number): ItemDef {
  const pool = defs.filter((d) => d.tier === tier && !d.legendary);
  return pool[Math.floor(rng.next() * pool.length)];
}
