import type { Balance } from '../data/schema';
import { STAT_IDS, type ClassDef, type SkillDef, type Stat } from '../data/types';
import { totalPoints, pointsSpent, type StatBlock } from './stats';

// Learning, equipping and dormant skills (PRD Section 7). Requirements count base stats plus gear
// and card bonuses. Buffs and passive-skill bonuses never count.

export interface HeroBuild {
  name: string;
  /** Which KayKit hero model to show (a key of modelMap.json looks). */
  look: string;
  /** Off-hand model id (shield, tome) or null. */
  offhand: string | null;
  level: number;
  gold: number;
  /** Base stats, each starting at 1 and raised with points. */
  stats: StatBlock;
  weapon: { type: SkillWeapon; tier: number; atk?: number; matk?: number; refine?: number };
  armorTier: number;
  /** Totals from equipped items. When set they replace the tier-based weapon and armor numbers. */
  gear?: GearTotals;
  /** Skill id to rank. */
  learned: Record<string, number>;
  /** Consumable slot ids and the counts the bag holds (potions used in a run). */
  consumables?: (string | null)[];
  stacks?: Record<string, number>;
  actives: (string | null)[];
  passives: (string | null)[];
}
/** What the equipped items add to the hero (see sim/items.ts gearTotals). */
export interface GearTotals {
  def: number;
  mdef: number;
  maxHpPct: number;
  maxSpPct: number;
  flee: number;
  moveSpeedPct: number;
  stats: Partial<Record<Stat, number>>;
  healOnKillPct: number;
  spellEchoChance: number;
}

export type SkillWeapon =
  'sword' | 'greataxe' | 'dagger' | 'mace' | 'knuckle' | 'staff' | 'bow' | 'gun';

/** Stats used for requirement checks: base plus gear (none yet in M1). */
export function reqStats(
  build: HeroBuild,
  gearBonus: Partial<Record<Stat, number>> = build.gear?.stats ?? {},
): StatBlock {
  const out = { ...build.stats };
  for (const k of STAT_IDS) out[k] += gearBonus[k] ?? 0;
  return out;
}

export function reqMet(req: SkillDef['req'], stats: StatBlock): boolean {
  return STAT_IDS.every((k) => (req[k] ?? 0) <= stats[k]);
}

/** Requirements the stats do not meet, for the "red with numbers" display. */
export function unmetReq(
  req: SkillDef['req'],
  stats: StatBlock,
): { stat: Stat; need: number; have: number }[] {
  return STAT_IDS.filter((k) => (req[k] ?? 0) > stats[k]).map((k) => ({
    stat: k,
    need: req[k]!,
    have: stats[k],
  }));
}

/** Skill points earned: 1 per level, plus 2 per first boss kill. */
export function skillPointsTotal(b: Balance, level: number, bossesKilled = 0): number {
  return (level - 1) * b.stats.skillPointsPerLevel + bossesKilled * b.stats.skillPointsFirstBoss;
}

export function skillPointsSpent(build: HeroBuild): number {
  return Object.values(build.learned).reduce((s, r) => s + (r - 1), 0);
}

export type LearnResult =
  { ok: true } | { ok: false; reason: 'trainer' | 'requirement' | 'tier' | 'gold' | 'known' };

export interface LearnContext {
  unlockedClasses: Set<string>;
  skills: Map<string, SkillDef>;
}

/**
 * Can the hero learn a skill? Needs the trainer unlocked, the stat requirement met, a tier-(N-1)
 * skill of the same class already learned, and the gold.
 */
export function canLearn(
  build: HeroBuild,
  def: SkillDef,
  ctx: LearnContext,
  gearBonus?: Partial<Record<Stat, number>>,
): LearnResult {
  if (build.learned[def.id]) return { ok: false, reason: 'known' };
  if (!ctx.unlockedClasses.has(def.classId)) return { ok: false, reason: 'trainer' };
  if (!reqMet(def.req, reqStats(build, gearBonus))) return { ok: false, reason: 'requirement' };
  if (def.tier > 1) {
    const hasPrereq = Object.keys(build.learned).some((id) => {
      const s = ctx.skills.get(id);
      return s && s.classId === def.classId && s.tier === def.tier - 1;
    });
    if (!hasPrereq) return { ok: false, reason: 'tier' };
  }
  if (build.gold < def.gold) return { ok: false, reason: 'gold' };
  return { ok: true };
}

/** Learns a skill at rank 1 and pays its gold. */
export function learn(build: HeroBuild, def: SkillDef): void {
  build.learned[def.id] = 1;
  build.gold -= def.gold;
}

/** Dormant: learned, but the requirement is no longer met. It stays learned but cannot be equipped. */
export function dormantSkills(
  build: HeroBuild,
  skills: Map<string, SkillDef>,
  gearBonus?: Partial<Record<Stat, number>>,
): string[] {
  const stats = reqStats(build, gearBonus);
  return Object.keys(build.learned).filter((id) => {
    const s = skills.get(id);
    return s ? !reqMet(s.req, stats) : false;
  });
}

/** Unequips every dormant skill and returns their ids (for the "these will be unequipped" dialog). */
export function unequipDormant(
  build: HeroBuild,
  skills: Map<string, SkillDef>,
  gearBonus?: Partial<Record<Stat, number>>,
): string[] {
  const dormant = new Set(dormantSkills(build, skills, gearBonus));
  const removed: string[] = [];
  const strip = (arr: (string | null)[]) =>
    arr.forEach((id, i) => {
      if (id && dormant.has(id)) {
        removed.push(id);
        arr[i] = null;
      }
    });
  strip(build.actives);
  strip(build.passives);
  return removed;
}

/** Equips a skill in a slot. Returns false if it is not learned, dormant or the wrong kind. */
export function equip(
  build: HeroBuild,
  def: SkillDef,
  slot: number,
  skills: Map<string, SkillDef>,
  gearBonus?: Partial<Record<Stat, number>>,
): boolean {
  if (!build.learned[def.id]) return false;
  if (!reqMet(def.req, reqStats(build, gearBonus))) return false;
  const arr = def.kind === 'passive' ? build.passives : build.actives;
  if (slot < 0 || slot >= arr.length) return false;
  // A skill sits in one slot only.
  for (const list of [build.actives, build.passives]) {
    const i = list.indexOf(def.id);
    if (i >= 0) list[i] = null;
  }
  arr[slot] = def.id;
  void skills;
  return true;
}

/** Raises a learned skill by one rank for 1 skill point, up to its max rank. */
export function rankUp(build: HeroBuild, def: SkillDef, pointsFree: number): boolean {
  const r = build.learned[def.id];
  if (!r || r >= def.maxRank || pointsFree < 1) return false;
  build.learned[def.id] = r + 1;
  return true;
}

/** Everything that must hold for a build to be valid at its level. Used by tests and the cheat panel. */
export function validateBuild(
  b: Balance,
  build: HeroBuild,
  skills: Map<string, SkillDef>,
): string[] {
  const problems: string[] = [];
  if (pointsSpent(b, build.stats) > totalPoints(b, build.level))
    problems.push('too many stat points spent');
  if (skillPointsSpent(build) > skillPointsTotal(b, build.level))
    problems.push('too many skill points spent');
  const stats = reqStats(build);
  for (const id of [...build.actives, ...build.passives]) {
    if (!id) continue;
    const s = skills.get(id);
    if (!s) problems.push(`unknown skill ${id}`);
    else {
      if (!build.learned[id]) problems.push(`${id} equipped but not learned`);
      if (!reqMet(s.req, stats)) problems.push(`${id} requirement not met`);
    }
  }
  return problems;
}

export function classUnlocked(c: ClassDef, bossesKilled: Set<string>): boolean {
  return c.unlock.type === 'start' || bossesKilled.has(c.unlock.bossId);
}
