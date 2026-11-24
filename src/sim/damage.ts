import type { Rng } from '../core/rng';

export interface HitRoll {
  amount: number;
  crit: boolean;
}

export interface HitParams {
  atk: number;
  /** Skill multiplier, e.g. 1.8 for 180% ATK. */
  atkPct: number;
  critChance: number;
  critMult: number;
  /** Variance half-width, e.g. 0.05 for 0.95 to 1.05. */
  variance: number;
}

/**
 * M0 placeholder damage: ATK x skill% x crit x variance, minimum 1. The full pipeline from PRD
 * Section 10 (hit check, bonuses, element, defense) arrives in M1.
 */
export function rollHit(rng: Rng, p: HitParams): HitRoll {
  const crit = rng.next() < p.critChance;
  const variance = 1 + rng.signed() * p.variance;
  const raw = p.atk * p.atkPct * (crit ? p.critMult : 1) * variance;
  return { amount: Math.max(1, Math.round(raw)), crit };
}
