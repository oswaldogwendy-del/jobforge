import type { Rng } from '../core/rng';
import type { Balance } from '../data/schema';
import type { StatusId } from '../data/types';
import type { StatusInst, Unit } from './types';

// Status effects (PRD Section 10) and the anti-lockdown rules from Section 7.

export type ApplyResult = 'applied' | 'resisted' | 'immune' | 'stagger';

const HARD_CC: StatusId[] = ['stun', 'freeze', 'root'];
const DOTS: StatusId[] = ['burn', 'poison', 'bleed'];
export const isDot = (id: StatusId): boolean => DOTS.includes(id);

export function hasStatus(u: Unit, id: StatusId): boolean {
  return u.statuses.some((s) => s.id === id);
}

export function isImmune(u: Unit, id: StatusId): boolean {
  return u.buffs.some((b) => b.immune.includes(id));
}

export function removeStatus(u: Unit, id: StatusId): boolean {
  const i = u.statuses.findIndex((s) => s.id === id);
  if (i < 0) return false;
  u.statuses.splice(i, 1);
  return true;
}

export interface ApplyOpts {
  /** Sim time in seconds, for the repeat-CC window. */
  now: number;
  src: number;
  /** Strength: DoT damage per second, or slow/mark/curse fraction. */
  power: number;
}

/**
 * Applies a status. Rules:
 * - Bosses ignore stun, freeze and root and fill a stagger bar instead; they are immune to
 *   silence, and a taunt lasts at most 2 s.
 * - A repeat stun, freeze or root on the same target within 6 s lasts half as long.
 * - The target's resist chance can block it, and immunity from buffs always does.
 */
export function applyStatus(
  b: Balance,
  rng: Rng,
  target: Unit,
  id: StatusId,
  duration: number,
  o: ApplyOpts,
): ApplyResult {
  if (!target.alive) return 'immune';
  const c = b.combat;
  if (target.isBoss) {
    if (HARD_CC.includes(id)) {
      fillStagger(b, target, c.staggerFillPerCc);
      return 'stagger';
    }
    if (id === 'silence') return 'immune';
    if (id === 'taunt') duration = Math.min(duration, c.bossTauntMax);
  }
  if (isImmune(target, id)) return 'immune';
  const resist = target.resist[id] ?? 0;
  if (resist > 0 && rng.next() * 100 < resist) return 'resisted';

  if (HARD_CC.includes(id)) {
    const last = target.ccLast[id];
    if (last !== undefined && o.now - last < c.ccRepeatWindow) duration *= c.ccRepeatFactor;
    target.ccLast[id] = o.now;
  }

  const existing = target.statuses.find((s) => s.id === id);
  if (existing) {
    // Refresh: keep the stronger power and the longer time. Bleed stacks up to its cap.
    existing.remaining = Math.max(existing.remaining, duration);
    existing.power = Math.max(existing.power, o.power);
    existing.src = o.src;
    if (id === 'bleed') existing.stacks = Math.min(c.bleedMaxStacks, existing.stacks + 1);
  } else {
    target.statuses.push({
      id,
      remaining: duration,
      power: o.power,
      stacks: 1,
      src: o.src,
      tick: 0,
    } satisfies StatusInst);
  }
  if (id === 'taunt') {
    target.tauntTarget = o.src;
    target.tauntT = duration;
  }
  return 'applied';
}

/** Adds to a boss's stagger bar. At 100 the boss is staggered for 2 s and takes 20% more damage. */
export function fillStagger(b: Balance, boss: Unit, amount: number): boolean {
  if (boss.staggerT > 0) return false;
  boss.stagger += amount;
  if (boss.stagger >= 100) {
    boss.stagger = 0;
    boss.staggerT = b.combat.staggerDuration;
    return true;
  }
  return false;
}

/** Counts down statuses. DoT ticks are returned as [status, damage] for the caller to apply. */
export function tickStatuses(u: Unit, dt: number): { id: StatusId; dmg: number; src: number }[] {
  const ticks: { id: StatusId; dmg: number; src: number }[] = [];
  for (let i = u.statuses.length - 1; i >= 0; i--) {
    const s = u.statuses[i];
    if (isDot(s.id)) {
      s.tick += dt;
      while (s.tick >= 1) {
        s.tick -= 1;
        ticks.push({ id: s.id, dmg: s.power * s.stacks, src: s.src });
      }
    }
    s.remaining -= dt;
    if (s.remaining <= 0) u.statuses.splice(i, 1);
  }
  if (u.staggerT > 0) u.staggerT = Math.max(0, u.staggerT - dt);
  if (u.tauntT > 0) {
    u.tauntT -= dt;
    if (u.tauntT <= 0) u.tauntTarget = -1;
  }
  return ticks;
}

/** Can the unit act (use skills and attack)? */
export function canAct(u: Unit): boolean {
  return u.alive && !hasStatus(u, 'stun') && !hasStatus(u, 'freeze');
}

export function canMove(u: Unit): boolean {
  return canAct(u) && !hasStatus(u, 'root');
}

export function canCast(u: Unit): boolean {
  return canAct(u) && !hasStatus(u, 'silence');
}

/** Move speed multiplier from slow and curse. */
export function moveMult(b: Balance, u: Unit): number {
  let m = 1;
  const slow = u.statuses.find((s) => s.id === 'slow');
  if (slow) m *= 1 - (slow.power > 0 ? slow.power : b.combat.slowMove);
  if (hasStatus(u, 'curse')) m *= 1 - b.combat.curseMove;
  return m;
}

export function apsMult(b: Balance, u: Unit): number {
  return hasStatus(u, 'slow') ? 1 - b.combat.slowAps : 1;
}

/** Blind removes 50% HIT, as a negative modifier to add to the attacker's HIT. */
export function hitMod(b: Balance, u: Unit): number {
  return hasStatus(u, 'blind') ? -u.hit * b.combat.blindHit : 0;
}

/** Curse lowers ATK and MATK. */
export function atkMult(b: Balance, u: Unit): number {
  return hasStatus(u, 'curse') ? 1 - b.combat.curseAtk : 1;
}

/** Poison cuts healing received by 30%. */
export function healMult(b: Balance, u: Unit): number {
  return hasStatus(u, 'poison') ? 1 - b.combat.poisonHealReduce : 1;
}

/** Removes up to `count` debuffs (statuses that hurt), oldest first. */
export function cleanse(u: Unit, count: number): number {
  const bad: StatusId[] = [
    'stun',
    'freeze',
    'root',
    'slow',
    'burn',
    'poison',
    'bleed',
    'blind',
    'silence',
    'curse',
    'mark',
    'taunt',
  ];
  let n = 0;
  for (let i = 0; i < u.statuses.length && n < count;) {
    if (bad.includes(u.statuses[i].id)) {
      u.statuses.splice(i, 1);
      n++;
    } else i++;
  }
  return n;
}
