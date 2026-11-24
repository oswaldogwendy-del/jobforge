import { balance as defaultBalance, type Balance } from '../data/schema';
import { classes, itemMap, skillMap, stackMap } from '../data/content';
import {
  STAT_IDS,
  type ClassDef,
  type EquipSlot,
  type ItemDef,
  type ItemInstance,
  type SkillDef,
  type StackDef,
  type Stat,
  type WeaponType,
} from '../data/types';
import { Rng } from '../core/rng';
import type { PresetData, ProgressSave, SaveData, StatBlockSave } from '../save/types';
import { SAVE_VERSION, defaultSettings } from '../save/types';
import { canEquip, createItem, equipItem, gearTotals, sellValue, type ItemLookup } from './items';
import {
  canLearn,
  dormantSkills,
  type HeroBuild,
  type LearnResult,
  unequipDormant,
} from './loadout';
import { costToReach, emptyStats, expToNext, pointsGained, statCost, totalPoints } from './stats';

// Progression on the saved hero (PRD Sections 6, 7, 12, 13): EXP and levels, stat points, skill
// learning and ranks, the Oracle, items in the bag, gold and consumables. Pure functions: the UI
// calls them, the save file stores the result, and tests run them without a browser.

export interface ProfileCtx {
  b: Balance;
  skills: Map<string, SkillDef>;
  classes: ClassDef[];
  items: Map<string, ItemDef>;
  stacks: Map<string, StackDef>;
}

export const defaultCtx: ProfileCtx = {
  b: defaultBalance,
  skills: skillMap,
  classes,
  items: itemMap,
  stacks: stackMap,
};

export const MAX_LEVEL = 99;
export const lookupOf =
  (ctx: ProfileCtx): ItemLookup =>
  (id) =>
    ctx.items.get(id);

export const presetOf = (s: SaveData): PresetData => s.hero.presets[s.hero.activePreset];

// --- Slots and unlocks -------------------------------------------------------------------------

export interface SlotCounts {
  active: number;
  passive: number;
  consumable: number;
  presets: number;
}

/** How many loadout slots and presets the hero has, from the bosses killed (PRD Section 7). */
export function slotCounts(b: Balance, progress: ProgressSave, bossOrder: string[]): SlotCounts {
  const u = b.progress.slotUnlocks;
  const killed = bossOrder.filter((id) => (progress.bossKills[id] ?? 0) > 0).length;
  const n = (k: number) => (killed >= k ? 1 : 0);
  return {
    active: u.activeBase + n(1) + n(2),
    passive: u.passiveBase + n(3) + n(4),
    consumable: u.consumables,
    presets: 1 + n(5) + n(6),
  };
}

export function bossOrderOf(): string[] {
  return ['queen_gelatina', 'hollow_abbot', 'gilded_scarab_rex', 'rimeclaw', 'ignar', 'malgrath'];
}

export function unlockedClassIds(ctx: ProfileCtx, progress: ProgressSave): Set<string> {
  const out = new Set<string>();
  for (const c of ctx.classes) {
    if (c.comingIn) continue;
    if (c.unlock.type === 'start' || (progress.bossKills[c.unlock.bossId] ?? 0) > 0) out.add(c.id);
  }
  return out;
}

// --- New hero --------------------------------------------------------------------------------

export type Template = 'warrior' | 'caster' | 'rogue' | 'custom';

/** Weights a template spends its points by. */
const TEMPLATE_WEIGHTS: Record<Exclude<Template, 'custom'>, Partial<Record<Stat, number>>> = {
  warrior: { STR: 3, VIT: 2, DEX: 1 },
  caster: { INT: 3, DEX: 2, VIT: 1 },
  rogue: { AGI: 3, LUK: 2, DEX: 1 },
};

/** Spends `points` by weight: always raises the stat furthest behind its weight. */
export function templateStats(b: Balance, template: Template, points: number): StatBlockSave {
  const stats = emptyStats(b.stats.baseStat);
  if (template === 'custom') return stats;
  const w = TEMPLATE_WEIGHTS[template];
  let left = points;
  for (;;) {
    let pick: Stat | null = null;
    let best = Infinity;
    for (const k of STAT_IDS) {
      const weight = w[k] ?? 0;
      if (!weight || statCost(b, stats[k]) > left) continue;
      const score = (stats[k] - b.stats.baseStat) / weight;
      if (score < best) {
        best = score;
        pick = k;
      }
    }
    if (!pick) break;
    left -= statCost(b, stats[pick]);
    stats[pick] += 1;
  }
  return stats;
}

export interface NewHeroOptions {
  name: string;
  look: string;
  weapon: 'sword' | 'staff';
  template: Template;
  /** For the custom template: the stats the player chose. */
  stats?: StatBlockSave;
}

export const STARTING_GOLD = 200;
export const STARTING_POTIONS = 5;

export function newSave(opts: NewHeroOptions, ctx: ProfileCtx = defaultCtx, seed = 1): SaveData {
  const { b } = ctx;
  const rng = new Rng(seed);
  const stats = opts.stats ?? templateStats(b, opts.template, b.stats.startPoints);
  const free = b.stats.startPoints - STAT_IDS.reduce((s, k) => s + costToReach(b, stats[k]), 0);
  const weaponDef = ctx.items.get(`${opts.weapon}_t1`)!;
  const armorDef = ctx.items.get(opts.weapon === 'staff' ? 'robe_t1' : 'plate_t1')!;
  const weapon = createItem(b, rng, weaponDef, 'common');
  const armor = createItem(b, rng, armorDef, 'common');
  const preset: PresetData = {
    stats,
    statPointsFree: Math.max(0, free),
    actives: Array(b.loadout.actives).fill(null),
    passives: Array(b.loadout.passives).fill(null),
    consumables: ['minor_health', 'minor_mana'],
    equipment: { weapon: weapon.uid, armor: armor.uid },
  };
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    hero: {
      name: opts.name.trim().slice(0, 20) || 'Hero',
      look: opts.look,
      level: 1,
      exp: 0,
      gold: STARTING_GOLD,
      skillPointsFree: 0,
      learned: {},
      presets: [preset],
      activePreset: 0,
      inventory: [weapon, armor],
      storage: [],
      overflow: [],
      stacks: { minor_health: STARTING_POTIONS, minor_mana: STARTING_POTIONS },
      bagSize: b.items.bag.start,
    },
    progress: {
      unlockedClasses: [],
      unlockedZones: ['meadowmere'],
      bossKills: {},
      cardPity: {},
      codex: [],
      tower: { best: 0, checkpoint: 0, tokens: 0 },
      nightmare: false,
      slots: { active: 4, passive: 2, presets: 1 },
    },
    lifetime: { kills: 0, deaths: 0, playSec: 0 },
    settings: defaultSettings(),
  };
}

// --- EXP and levels --------------------------------------------------------------------------

export interface LevelUp {
  from: number;
  to: number;
  statPoints: number;
  skillPoints: number;
}

/** Adds EXP, applying every level-up. Stat points go to every preset (PRD Section 16). */
export function gainExp(b: Balance, s: SaveData, amount: number): LevelUp | null {
  const h = s.hero;
  if (h.level >= MAX_LEVEL) return null;
  const from = h.level;
  let statPoints = 0;
  h.exp += amount;
  while (h.level < MAX_LEVEL && h.exp >= expToNext(b, h.level)) {
    h.exp -= expToNext(b, h.level);
    const gain = pointsGained(b, h.level);
    for (const p of h.presets) p.statPointsFree += gain;
    statPoints += gain;
    h.skillPointsFree += b.stats.skillPointsPerLevel;
    h.level += 1;
  }
  if (h.level >= MAX_LEVEL) h.exp = 0;
  if (h.level === from) return null;
  return {
    from,
    to: h.level,
    statPoints,
    skillPoints: (h.level - from) * b.stats.skillPointsPerLevel,
  };
}

/** EXP bar progress from 0 to 1. */
export function expFraction(b: Balance, s: SaveData): number {
  if (s.hero.level >= MAX_LEVEL) return 1;
  return Math.min(1, s.hero.exp / expToNext(b, s.hero.level));
}

// --- Stats -----------------------------------------------------------------------------------

export function nextStatCost(b: Balance, p: PresetData, stat: Stat): number {
  return statCost(b, p.stats[stat]);
}

export function canRaiseStat(b: Balance, p: PresetData, stat: Stat): boolean {
  return p.stats[stat] < b.stats.maxBaseStat && nextStatCost(b, p, stat) <= p.statPointsFree;
}

/** Raises a stat by one point step if the free points allow. Mutates the preset. */
export function raiseStat(b: Balance, p: PresetData, stat: Stat): boolean {
  if (!canRaiseStat(b, p, stat)) return false;
  p.statPointsFree -= nextStatCost(b, p, stat);
  p.stats[stat] += 1;
  return true;
}

export function oracleCost(b: Balance, level: number): number {
  if (level <= b.progress.oracleFreeLevel) return 0;
  return b.progress.oracleCostPerLevelSq * level * level;
}

export type ResetResult =
  { ok: true; cost: number; unequipped: string[] } | { ok: false; reason: 'gold' | 'draught' };

/** Refunds every point of the active preset. Costs gold, or one Oblivion Draught. */
export function oracleReset(
  s: SaveData,
  ctx: ProfileCtx = defaultCtx,
  useDraught = false,
): ResetResult {
  const { b } = ctx;
  const h = s.hero;
  let cost = oracleCost(b, h.level);
  if (useDraught) {
    if ((h.stacks.oblivion_draught ?? 0) < 1) return { ok: false, reason: 'draught' };
    cost = 0;
  } else if (h.gold < cost) return { ok: false, reason: 'gold' };
  if (useDraught) takeStack(s, 'oblivion_draught', 1);
  h.gold -= cost;
  const p = presetOf(s);
  p.stats = emptyStats(b.stats.baseStat);
  p.statPointsFree = totalPoints(b, h.level);
  const unequipped = unequipDormantSkills(s, ctx);
  return { ok: true, cost, unequipped };
}

// --- Build -----------------------------------------------------------------------------------

/** The sim's HeroBuild for the active preset: stats, skills, and the equipped gear's totals. */
export function buildOf(s: SaveData, ctx: ProfileCtx = defaultCtx): HeroBuild {
  const { b } = ctx;
  const h = s.hero;
  const p = presetOf(s);
  const owned = new Map(h.inventory.map((i) => [i.uid, i]));
  const g = gearTotals(b, p.equipment, owned, lookupOf(ctx));
  const counts = slotCounts(b, s.progress, bossOrderOf());
  const lock = (arr: (string | null)[], n: number) => arr.map((id, i) => (i < n ? id : null));
  const weapon = g.weapon
    ? { type: g.weapon.type as WeaponType, tier: 1, atk: g.weapon.atk, matk: g.weapon.matk }
    : { type: 'knuckle' as WeaponType, tier: 1, atk: 0, matk: 0 };
  return {
    name: h.name,
    look: h.look,
    offhand: g.offhandModel,
    level: h.level,
    gold: h.gold,
    stats: { ...p.stats },
    weapon,
    armorTier: 1,
    gear: g.totals,
    learned: { ...h.learned },
    actives: lock(p.actives, counts.active),
    passives: lock(p.passives, counts.passive),
  };
}

// --- Skills ----------------------------------------------------------------------------------

export function learnCheck(s: SaveData, def: SkillDef, ctx: ProfileCtx = defaultCtx): LearnResult {
  const build = buildOf(s, ctx);
  return canLearn(build, def, {
    unlockedClasses: unlockedClassIds(ctx, s.progress),
    skills: ctx.skills,
  });
}

/** Learns a skill at rank 1 for its gold. */
export function learnSkill(s: SaveData, id: string, ctx: ProfileCtx = defaultCtx): LearnResult {
  const def = ctx.skills.get(id);
  if (!def) return { ok: false, reason: 'known' };
  const r = learnCheck(s, def, ctx);
  if (!r.ok) return r;
  s.hero.learned[id] = 1;
  s.hero.gold -= def.gold;
  return r;
}

export function rankUpSkill(s: SaveData, id: string, ctx: ProfileCtx = defaultCtx): boolean {
  const def = ctx.skills.get(id);
  const rank = s.hero.learned[id];
  if (!def || !rank || rank >= def.maxRank || s.hero.skillPointsFree < 1) return false;
  s.hero.learned[id] = rank + 1;
  s.hero.skillPointsFree -= 1;
  return true;
}

/** Free reset of every rank back to 1 (PRD Section 7). */
export function resetRanks(s: SaveData): number {
  let refund = 0;
  for (const id of Object.keys(s.hero.learned)) {
    refund += s.hero.learned[id] - 1;
    s.hero.learned[id] = 1;
  }
  s.hero.skillPointsFree += refund;
  return refund;
}

/** Skills that are learned but whose requirement is not met right now. */
export function dormantOf(s: SaveData, ctx: ProfileCtx = defaultCtx): string[] {
  return dormantSkills(buildOf(s, ctx), ctx.skills);
}

/** Removes dormant skills from the loadout and returns their ids. */
export function unequipDormantSkills(s: SaveData, ctx: ProfileCtx = defaultCtx): string[] {
  const p = presetOf(s);
  const build = buildOf(s, ctx);
  build.actives = [...p.actives];
  build.passives = [...p.passives];
  const removed = unequipDormant(build, ctx.skills);
  p.actives = build.actives;
  p.passives = build.passives;
  return removed;
}

/** Equips a learned skill into a slot of the right kind, or clears it with id null. */
export function setSkillSlot(
  s: SaveData,
  kind: 'active' | 'passive',
  index: number,
  id: string | null,
  ctx: ProfileCtx = defaultCtx,
): boolean {
  const p = presetOf(s);
  const counts = slotCounts(ctx.b, s.progress, bossOrderOf());
  const arr = kind === 'active' ? p.actives : p.passives;
  const limit = kind === 'active' ? counts.active : counts.passive;
  if (index < 0 || index >= limit) return false;
  if (id === null) {
    arr[index] = null;
    return true;
  }
  const def = ctx.skills.get(id);
  if (!def || !s.hero.learned[id]) return false;
  if ((def.kind === 'passive') !== (kind === 'passive')) return false;
  if (dormantOf(s, ctx).includes(id)) return false;
  for (const list of [p.actives, p.passives]) {
    const i = list.indexOf(id);
    if (i >= 0) list[i] = null;
  }
  arr[index] = id;
  return true;
}

/** Records a boss kill. Returns true on the first kill, which grants the first-kill rewards. */
export function recordBossKill(s: SaveData, bossId: string, ctx: ProfileCtx = defaultCtx): boolean {
  const first = (s.progress.bossKills[bossId] ?? 0) === 0;
  s.progress.bossKills[bossId] = (s.progress.bossKills[bossId] ?? 0) + 1;
  if (first) s.hero.skillPointsFree += ctx.b.stats.skillPointsFirstBoss;
  const c = slotCounts(ctx.b, s.progress, bossOrderOf());
  s.progress.slots = { active: c.active, passive: c.passive, presets: c.presets };
  s.progress.unlockedClasses = [...unlockedClassIds(ctx, s.progress)];
  return first;
}

// --- Inventory -------------------------------------------------------------------------------

/** Uids of every equipped item across all presets. */
export function equippedUids(s: SaveData): Set<string> {
  const out = new Set<string>();
  for (const p of s.hero.presets) for (const uid of Object.values(p.equipment)) out.add(uid);
  return out;
}

/** Items in the bag: owned but not equipped. They fill the bag slots. */
export function bagItems(s: SaveData): ItemInstance[] {
  const eq = equippedUids(s);
  return s.hero.inventory.filter((i) => !eq.has(i.uid));
}

export function bagFree(s: SaveData): number {
  return s.hero.bagSize - bagItems(s).length;
}

export type AddResult = 'bag' | 'overflow' | 'sold' | 'lost';

/** Puts a picked-up item in the bag, or the overflow box, or sells it when auto-sell applies. */
export function addItem(s: SaveData, inst: ItemInstance, ctx: ProfileCtx = defaultCtx): AddResult {
  if (s.settings.autoSellCommon && inst.rarity === 'common') {
    const def = ctx.items.get(inst.defId);
    if (def) {
      s.hero.gold += sellValue(ctx.b, def, inst);
      return 'sold';
    }
  }
  if (bagFree(s) > 0) {
    s.hero.inventory.push(inst);
    return 'bag';
  }
  if (s.hero.overflow.length < ctx.b.items.bag.overflow) {
    s.hero.overflow.push(inst);
    return 'overflow';
  }
  return 'lost';
}

/** Moves overflow items into the bag while there is room. Returns how many moved. */
export function claimOverflow(s: SaveData): number {
  let n = 0;
  while (s.hero.overflow.length > 0 && bagFree(s) > 0) {
    s.hero.inventory.push(s.hero.overflow.shift()!);
    n += 1;
  }
  return n;
}

export function addStack(s: SaveData, id: string, n: number, ctx: ProfileCtx = defaultCtx): void {
  s.hero.stacks[id] = Math.min(ctx.b.items.bag.stackMax, (s.hero.stacks[id] ?? 0) + n);
}

export function takeStack(s: SaveData, id: string, n: number): boolean {
  if ((s.hero.stacks[id] ?? 0) < n) return false;
  s.hero.stacks[id] -= n;
  if (s.hero.stacks[id] === 0) delete s.hero.stacks[id];
  return true;
}

export type EquipResult =
  { ok: true; removed: string[] } | { ok: false; reason: 'level' | 'twoHanded' | 'missing' };

/** Equips a bag item. Replaced items stay in the bag. Skills made dormant are unequipped. */
export function equipFromBag(
  s: SaveData,
  uid: string,
  ctx: ProfileCtx = defaultCtx,
  slot?: EquipSlot,
): EquipResult {
  const inst = s.hero.inventory.find((i) => i.uid === uid);
  const def = inst && ctx.items.get(inst.defId);
  if (!inst || !def) return { ok: false, reason: 'missing' };
  const p = presetOf(s);
  const weaponInst = p.equipment.weapon
    ? s.hero.inventory.find((i) => i.uid === p.equipment.weapon)
    : undefined;
  const check = canEquip(def, s.hero.level, weaponInst && ctx.items.get(weaponInst.defId));
  if (!check.ok) return check;
  // A two-handed weapon pushes the off-hand out, so it needs a free bag slot for it.
  const removed = equipItem(p.equipment, inst, def, slot);
  unequipDormantSkills(s, ctx);
  return { ok: true, removed };
}

export function unequipToBag(s: SaveData, slot: EquipSlot, ctx: ProfileCtx = defaultCtx): boolean {
  const p = presetOf(s);
  if (!p.equipment[slot] || bagFree(s) <= 0) return false;
  delete p.equipment[slot];
  unequipDormantSkills(s, ctx);
  return true;
}

export function sellItem(s: SaveData, uid: string, ctx: ProfileCtx = defaultCtx): number {
  const i = s.hero.inventory.findIndex((x) => x.uid === uid);
  if (i < 0 || equippedUids(s).has(uid) || s.hero.inventory[i].locked) return 0;
  const inst = s.hero.inventory[i];
  const def = ctx.items.get(inst.defId);
  if (!def) return 0;
  const gold = sellValue(ctx.b, def, inst);
  s.hero.inventory.splice(i, 1);
  s.hero.gold += gold;
  return gold;
}

export function buyStack(
  s: SaveData,
  id: string,
  n: number,
  ctx: ProfileCtx = defaultCtx,
): boolean {
  const d = ctx.stacks.get(id);
  if (!d || d.shopLevel === 0 || s.hero.level < d.shopLevel) return false;
  const cost = d.price * n;
  if (s.hero.gold < cost) return false;
  s.hero.gold -= cost;
  addStack(s, id, n, ctx);
  return true;
}

export function sellStack(
  s: SaveData,
  id: string,
  n: number,
  ctx: ProfileCtx = defaultCtx,
): number {
  const d = ctx.stacks.get(id);
  if (!d || d.sellPrice <= 0 || !takeStack(s, id, n)) return 0;
  s.hero.gold += d.sellPrice * n;
  return d.sellPrice * n;
}

/** Cost of the next bag expansion, or null at the maximum. */
export function bagExpansionCost(b: Balance, bagSize: number): number | null {
  if (bagSize >= b.items.bag.max) return null;
  const step = (bagSize - b.items.bag.start) / b.items.bag.step;
  return b.items.bag.expansionCost[step] ?? null;
}

export function expandBag(s: SaveData, ctx: ProfileCtx = defaultCtx): boolean {
  const cost = bagExpansionCost(ctx.b, s.hero.bagSize);
  if (cost === null || s.hero.gold < cost) return false;
  s.hero.gold -= cost;
  s.hero.bagSize += ctx.b.items.bag.step;
  return true;
}
