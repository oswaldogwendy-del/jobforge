import type { Rng } from '../core/rng';
import type { Balance } from '../data/schema';
import elementsJson from '../data/elements.json';
import type { Element } from '../data/types';
import { defenseFactor, hitChancePct } from './stats';
import type { Unit } from './types';

// The full Section 10 damage pipeline: hit check, base, skill multiplier, bonuses, element,
// defense, crit, variance.

const order = elementsJson.order as Element[];
const table = elementsJson.table as Record<Element, number[]>;

/** Element multiplier: attack row x defender column (PRD Section 10). */
export function elementMult(atk: Element, def: Element): number {
  return table[atk][order.indexOf(def)];
}

export interface HitParams {
  school: 'physical' | 'magic';
  element: Element;
  /** Skill multiplier: 1.8 for 180% ATK or MATK. */
  pct: number;
  canCrit: boolean;
  /** Fraction of the defender's DEF/MDEF ignored, 0..1. */
  ignoreDef: number;
  /** All +% bonuses from passives, cards and buffs that match the skill's tags, added together. */
  bonusGroup: number;
  /** Race bonuses from cards and passives, added together. */
  raceBonus: number;
  /** Target modifiers (mark, Hex, stagger, freeze) multiplied together. */
  targetMods: number;
  /** Weapon affinity match: +25%. */
  affinity: boolean;
  /** True for effects that cannot miss or be dodged (magic is always true). */
  alwaysHit?: boolean;
  /** Extra HIT, for example from a blind debuff on the attacker (negative). */
  hitMod?: number;
}

export interface HitResult {
  amount: number;
  crit: boolean;
  missed: boolean;
  dodged: boolean;
  elementMult: number;
}

/** Total damage reduction from all sources never exceeds this fraction (85%). */
export function totalReductionFloor(b: Balance): number {
  return 1 - b.caps.totalReductionPct / 100;
}

export function resolveHit(b: Balance, rng: Rng, atk: Unit, def: Unit, p: HitParams): HitResult {
  const physical = p.school === 'physical';
  const miss: HitResult = { amount: 0, crit: false, missed: true, dodged: false, elementMult: 1 };

  // 1. Hit check. Crits and magic always hit; the defender then rolls perfect dodge vs physical.
  const crit = p.canCrit && rng.next() * 100 < atk.critPct;
  if (physical && !crit && !p.alwaysHit) {
    const chance = hitChancePct(b, atk.hit + (p.hitMod ?? 0), def.flee);
    if (rng.next() * 100 >= chance) return miss;
    if (rng.next() * 100 < def.perfectDodgePct) return { ...miss, missed: false, dodged: true };
  }

  // 2. Base. Magic rolls between its minimum and maximum.
  let dmg = physical ? atk.atk : atk.matkMin + rng.next() * (atk.matkMax - atk.matkMin);

  // 3. Skill multiplier, with the weapon affinity bonus.
  dmg *= p.pct * (p.affinity ? 1 + b.combat.affinityBonus : 1);

  // 4. Three bonus groups that multiply with each other.
  dmg *= (1 + p.bonusGroup) * (1 + p.raceBonus) * p.targetMods;

  // 5. Element. The hero has none, so monster attacks deal x1 to the hero.
  const em = def.team === 'player' ? 1 : elementMult(p.element, def.element);
  dmg *= em;

  // 6. Defense, after any ignore-DEF effect, with the other reductions and the 85% total cap.
  const defVal = (physical ? def.def : def.mdef) * (1 - p.ignoreDef);
  const defF = defenseFactor(
    b,
    defVal,
    physical ? b.caps.defReductionPct : b.caps.mdefReductionPct,
  );
  const factor = Math.max(totalReductionFloor(b), defF * (1 - def.damageReduction));
  dmg *= factor;

  // 7. Crit: x1.5 plus crit damage bonuses.
  if (crit) dmg *= atk.critMult;

  // 8. Variance 0.95 to 1.05, round, minimum 1 (unless the element makes it immune).
  dmg *= 1 + (rng.next() * 2 - 1) * b.combat.variance;
  const amount = em === 0 ? 0 : Math.max(1, Math.round(dmg));
  return { amount, crit, missed: false, dodged: false, elementMult: em };
}

/** Multiplier from statuses on the target: mark, boss stagger and the freeze-break bonus. */
export function targetMods(b: Balance, def: Unit, school: 'physical' | 'magic'): number {
  let m = 1;
  const mark = def.statuses.find((s) => s.id === 'mark');
  if (mark) m *= 1 + mark.power;
  if (def.staggerT > 0) m *= 1 + b.combat.staggerDamageBonus;
  if (school === 'physical' && def.statuses.some((s) => s.id === 'freeze'))
    m *= 1 + b.combat.freezeBonus;
  return m;
}
