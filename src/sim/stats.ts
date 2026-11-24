import type { Balance } from '../data/schema';
import { STAT_IDS, type Stat, type StatusId, type WeaponType } from '../data/types';

// Every formula from PRD Section 6 and Section 13 (EXP, gold, monster curves). All constants come
// from balance.json; each function here has a unit test in tests/stats.test.ts.

export type StatBlock = Record<Stat, number>;

export function emptyStats(base = 1): StatBlock {
  return { STR: base, AGI: base, VIT: base, INT: base, DEX: base, LUK: base };
}

// --- Stat points ---------------------------------------------------------------------------

/** Points gained going from level x to x + 1: floor(x / 5) + 3. */
export function pointsGained(b: Balance, x: number): number {
  return Math.floor(x / b.stats.pointsPerLevelDiv) + b.stats.pointsPerLevelBase;
}

/** Total stat points a hero has earned at a level (start points plus every level-up). */
export function totalPoints(b: Balance, level: number): number {
  let sum = b.stats.startPoints;
  for (let x = 1; x < level; x++) sum += pointsGained(b, x);
  return sum;
}

/** Cost to raise a stat from n to n + 1: floor((n - 1) / 10) + 2. */
export function statCost(b: Balance, n: number): number {
  return Math.floor((n - 1) / b.stats.costDiv) + b.stats.costBase;
}

/** Total cost to raise one stat from `from` up to `to`. */
export function costToReach(b: Balance, to: number, from = b.stats.baseStat): number {
  let sum = 0;
  for (let n = from; n < to; n++) sum += statCost(b, n);
  return sum;
}

/** Points spent on a full stat block (each stat starts at the base value). */
export function pointsSpent(b: Balance, stats: StatBlock): number {
  return STAT_IDS.reduce((s, k) => s + costToReach(b, stats[k]), 0);
}

// --- Derived stats -------------------------------------------------------------------------

export interface WeaponStats {
  type: WeaponType;
  /** Weapon ATK after the tier and type multipliers (Section 12). */
  atk: number;
  matk: number;
  /** Refine bonus as a fraction, e.g. 0.12 for +2. */
  refine: number;
}

export interface Bonuses {
  maxHpPct: number;
  maxSpPct: number;
  gearHp: number;
  gearSp: number;
  gearDef: number;
  gearMdef: number;
  hit: number;
  flee: number;
  def: number;
  mdef: number;
  atkFlat: number;
  matkFlat: number;
  atkPct: number;
  matkPct: number;
  apsPct: number;
  castSpeed: number;
  cdr: number;
  critChance: number;
  critDamage: number;
  spRegen: number;
  moveSpeedPct: number;
  dropRate: number;
  goldRate: number;
}

export function zeroBonuses(): Bonuses {
  return {
    maxHpPct: 0,
    maxSpPct: 0,
    gearHp: 0,
    gearSp: 0,
    gearDef: 0,
    gearMdef: 0,
    hit: 0,
    flee: 0,
    def: 0,
    mdef: 0,
    atkFlat: 0,
    matkFlat: 0,
    atkPct: 0,
    matkPct: 0,
    apsPct: 0,
    castSpeed: 0,
    cdr: 0,
    critChance: 0,
    critDamage: 0,
    spRegen: 0,
    moveSpeedPct: 0,
    dropRate: 0,
    goldRate: 0,
  };
}

export interface DerivedStats {
  maxHp: number;
  maxSp: number;
  atk: number;
  matkMin: number;
  matkMax: number;
  hit: number;
  flee: number;
  /** Percent chance, already clamped. */
  perfectDodgePct: number;
  critPct: number;
  critMult: number;
  aps: number;
  /** Multiplier applied to base cast times, at least the cast floor. */
  castMult: number;
  cdrPct: number;
  def: number;
  mdef: number;
  hpRegen: number;
  spRegen: number;
  resistPhysPct: number;
  resistMagicPct: number;
  dropBonus: number;
  goldBonus: number;
  moveSpeed: number;
}

const RANGED_WEAPONS: WeaponType[] = ['bow', 'gun'];
export const isBowOrGun = (t: WeaponType): boolean => RANGED_WEAPONS.includes(t);

export function maxHpFor(b: Balance, level: number, vit: number): number {
  const h = b.derived.hp;
  return (h.base + h.perLevel * level + h.perLevelSq * level * level) * (1 + vit * h.vitPct);
}

export function maxSpFor(b: Balance, level: number, int: number): number {
  const s = b.derived.sp;
  return (s.base + s.perLevel * level + s.perLevelSq * level * level) * (1 + int * s.intPct);
}

/** ATK with a melee weapon, or with a bow or gun (ranged formula uses DEX as the main stat). */
export function atkFor(b: Balance, s: StatBlock, weapon: WeaponStats, flat = 0): number {
  const d = b.derived.atk;
  const w = weapon.atk * (1 + weapon.refine);
  if (isBowOrGun(weapon.type)) {
    return (
      s.DEX +
      Math.floor(s.DEX / 10) ** 2 +
      Math.floor(s.STR / d.strDivRanged) +
      Math.floor(s.LUK / d.lukDiv) +
      w +
      flat
    );
  }
  return (
    s.STR +
    Math.floor(s.STR / d.strSqDiv) ** 2 +
    Math.floor(s.DEX / d.dexDiv) +
    Math.floor(s.LUK / d.lukDiv) +
    w +
    flat
  );
}

/** MATK is rolled between a minimum and a maximum; weapon MATK adds to both. */
export function matkRange(
  b: Balance,
  s: StatBlock,
  weapon: WeaponStats,
  flat = 0,
): { min: number; max: number } {
  const m = b.derived.matk;
  const w = weapon.matk * (1 + weapon.refine) + flat;
  return {
    min: s.INT + Math.floor(s.INT / m.minDiv) ** 2 + w,
    max: s.INT + Math.floor(s.INT / m.maxDiv) ** 2 + w,
  };
}

export function hitFor(b: Balance, level: number, dex: number, bonus = 0): number {
  return level * b.derived.hit.perLevel + dex * b.derived.hit.perDex + bonus;
}

export function fleeFor(b: Balance, level: number, agi: number, bonus = 0): number {
  return level * b.derived.flee.perLevel + agi * b.derived.flee.perAgi + bonus;
}

/** Chance to land a physical hit, in percent: 80 + HIT - FLEE, clamped to 15..100. */
export function hitChancePct(b: Balance, attackerHit: number, defenderFlee: number): number {
  return clamp(
    b.combat.hitBase + attackerHit - defenderFlee,
    b.combat.hitMinPct,
    b.combat.hitMaxPct,
  );
}

export function perfectDodgePct(b: Balance, luk: number): number {
  const p = b.derived.perfectDodge;
  return Math.min(b.caps.perfectDodgePct, p.base + luk / p.lukDiv);
}

export function critPct(b: Balance, luk: number, bonus = 0): number {
  const c = b.derived.crit;
  return Math.min(b.caps.critChancePct, c.base + c.perLuk * luk + bonus);
}

export function apsFor(b: Balance, weaponAps: number, agi: number, dex: number, pct = 0): number {
  const a = b.derived.aps;
  return Math.min(b.caps.apsMax, weaponAps * (1 + a.perAgi * agi + a.perDex * dex + pct));
}

/** Cast time multiplier: max(0.2, 1 - DEX / 150 - cast-speed bonuses). */
export function castMultFor(b: Balance, dex: number, castSpeed = 0): number {
  return Math.max(b.caps.castMinFraction, 1 - dex / b.derived.cast.dexDiv - castSpeed);
}

export function cdrPctFor(b: Balance, bonusPct: number): number {
  return Math.min(b.caps.cdrPct, bonusPct);
}

export function defFor(
  b: Balance,
  level: number,
  vit: number,
  armorDef: number,
  bonus = 0,
): number {
  const d = b.derived.def;
  return armorDef + d.perVit * vit + d.perLevel * level + bonus;
}

export function mdefFor(
  b: Balance,
  level: number,
  int: number,
  vit: number,
  gearMdef: number,
  bonus = 0,
): number {
  const d = b.derived.mdef;
  return gearMdef + d.perInt * int + d.perVit * vit + d.perLevel * level + bonus;
}

/** Fraction of damage that gets through a DEF or MDEF value: 100 / (100 + DEF), floored by the cap. */
export function defenseFactor(b: Balance, def: number, capPct: number): number {
  return Math.max(1 - capPct / 100, b.combat.defCurve / (b.combat.defCurve + Math.max(0, def)));
}

export function hpRegenFor(b: Balance, maxHp: number, vit: number, idle: boolean): number {
  const r = b.derived.hpRegen;
  return (maxHp * r.pct + r.perVit * vit) * (idle ? r.idleMult : 1);
}

export function spRegenFor(
  b: Balance,
  maxSp: number,
  int: number,
  outOfCombat: boolean,
  bonus = 0,
): number {
  const r = b.derived.spRegen;
  return (r.base + maxSp * r.pct + r.perInt * int + bonus) * (outOfCombat ? r.oocMult : 1);
}

const PHYSICAL_STATUS: StatusId[] = ['stun', 'poison', 'bleed'];
/** Statuses that resist by INT instead of VIT. */
const MAGICAL_STATUS: StatusId[] = ['freeze', 'silence', 'curse', 'blind'];

/** Chance (percent) to resist a status. Physical: 0.4% x (VIT + LUK/2); magical uses INT. */
export function statusResistPct(b: Balance, s: StatBlock, status: StatusId, bonusPct = 0): number {
  const r = b.derived.statusResist;
  let base = 0;
  if (PHYSICAL_STATUS.includes(status)) base = (s.VIT + s.LUK * r.lukHalf) * r.perPoint * 100;
  else if (MAGICAL_STATUS.includes(status)) base = (s.INT + s.LUK * r.lukHalf) * r.perPoint * 100;
  return Math.min(b.caps.statusResistPct, base + bonusPct);
}

export function dropBonusFor(b: Balance, luk: number, bonus = 0): number {
  return Math.min(b.caps.dropRatePct / 100, luk * b.derived.dropPerLuk + bonus);
}

export function moveSpeedFor(b: Balance, bonusPct = 0): number {
  return b.derived.moveSpeedBase * (1 + Math.min(b.caps.moveSpeedBonusPct / 100, bonusPct));
}

export interface HeroInput {
  level: number;
  /** Effective stats: base plus gear, cards and buffs. */
  stats: StatBlock;
  weapon: WeaponStats;
  weaponAps: number;
  bonuses: Bonuses;
}

/** All derived stats for a hero from effective stats, weapon and bonuses. */
export function deriveHero(b: Balance, i: HeroInput): DerivedStats {
  const { level: L, stats: s, bonuses: bo } = i;
  const maxHp = (maxHpFor(b, L, s.VIT) + bo.gearHp) * (1 + bo.maxHpPct);
  const maxSp = (maxSpFor(b, L, s.INT) + bo.gearSp) * (1 + bo.maxSpPct);
  const mr = matkRange(b, s, i.weapon, bo.matkFlat);
  return {
    maxHp,
    maxSp,
    atk: atkFor(b, s, i.weapon, bo.atkFlat) * (1 + bo.atkPct),
    matkMin: mr.min * (1 + bo.matkPct),
    matkMax: mr.max * (1 + bo.matkPct),
    hit: hitFor(b, L, s.DEX, bo.hit),
    flee: fleeFor(b, L, s.AGI, bo.flee),
    perfectDodgePct: perfectDodgePct(b, s.LUK),
    critPct: critPct(b, s.LUK, bo.critChance),
    critMult: b.combat.critMult + bo.critDamage,
    aps: apsFor(b, i.weaponAps, s.AGI, s.DEX, bo.apsPct),
    castMult: castMultFor(b, s.DEX, bo.castSpeed),
    cdrPct: cdrPctFor(b, bo.cdr),
    def: defFor(b, L, s.VIT, bo.gearDef, bo.def),
    mdef: mdefFor(b, L, s.INT, s.VIT, bo.gearMdef, bo.mdef),
    hpRegen: hpRegenFor(b, maxHp, s.VIT, false),
    spRegen: spRegenFor(b, maxSp, s.INT, false, bo.spRegen),
    resistPhysPct: statusResistPct(b, s, 'stun'),
    resistMagicPct: statusResistPct(b, s, 'freeze'),
    dropBonus: dropBonusFor(b, s.LUK, bo.dropRate),
    goldBonus: Math.min(b.caps.goldBonusPct / 100, bo.goldRate),
    moveSpeed: moveSpeedFor(b, bo.moveSpeedPct),
  };
}

// --- Monsters, EXP and gold (Section 13) ---------------------------------------------------

export interface MonsterMult {
  hp?: number;
  atk?: number;
  def?: number;
  mdef?: number;
  hit?: number;
  flee?: number;
}

export interface MonsterStats {
  hp: number;
  atk: number;
  def: number;
  mdef: number;
  hit: number;
  flee: number;
}

/** Monster stats by level m with per-monster multipliers from monsters.json. */
export function monsterStats(b: Balance, m: number, mult: MonsterMult = {}): MonsterStats {
  const c = b.monster;
  return {
    hp: (c.hp.base + c.hp.perLevel * m + c.hp.perLevelSq * m * m) * (mult.hp ?? 1),
    atk: (c.atk.base + c.atk.perLevel * m + c.atk.perLevelSq * m * m) * (mult.atk ?? 1),
    def: (c.def.base + c.def.perLevel * m) * (mult.def ?? 1),
    mdef: (c.mdef.base + c.mdef.perLevel * m) * (mult.mdef ?? 1),
    hit: (c.hit.base + c.hit.perLevel * m) * (mult.hit ?? 1),
    flee: (c.flee.base + c.flee.perLevel * m) * (mult.flee ?? 1),
  };
}

/** EXP a same-level kill is worth before the level-gap rule: 10 x 1.06^m + 2m. */
export function expMonster(b: Balance, m: number): number {
  const e = b.exp;
  return e.monsterBase * Math.pow(e.monsterPow, m) + e.monsterPerLevel * m;
}

/** EXP needed to reach the next level: (15 + 2L + 0.04L^2) x EXP_monster(L). */
export function expToNext(b: Balance, level: number): number {
  const e = b.exp;
  return (
    (e.levelBase + e.levelPerLevel * level + e.levelPerLevelSq * level * level) *
    expMonster(b, level)
  );
}

/** Level-gap multiplier: clamp(1 + 0.05 x (monster level - hero level), 0.1, 1.5). */
export function levelGapFactor(b: Balance, heroLevel: number, monsterLevel: number): number {
  return clamp(1 + b.exp.gapPerLevel * (monsterLevel - heroLevel), b.exp.gapMin, b.exp.gapMax);
}

export function expForKill(b: Balance, heroLevel: number, monsterLevel: number, mult = 1): number {
  return expMonster(b, monsterLevel) * levelGapFactor(b, heroLevel, monsterLevel) * mult;
}

/** Gold per kill before variance: 3 + 1.5 x monster level. */
export function goldForKill(b: Balance, monsterLevel: number, mult = 1): number {
  return (b.gold.base + b.gold.perLevel * monsterLevel) * mult;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
