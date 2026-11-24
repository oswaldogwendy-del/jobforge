import type { Element } from '../data/types';
import { resolveHit, targetMods, type HitResult } from './damage';
import { fireTrigger, sumUnitMods } from './engine';
import { hitMod, removeStatus, healMult, atkMult } from './status';
import type { FxCtx, Unit } from './types';
import type { SimWorld } from './world';

// Applying damage, healing and deaths. Everything that changes a unit's HP goes through here, so
// shields, invulnerability, triggers, events and kill bookkeeping stay in one place.

export function targetable(u: Unit): boolean {
  return u.alive && !(u.ai && (u.ai.state === 'hidden' || u.ai.state === 'erupt'));
}

/** Calls fn for the hero and every other unit, alive or not. */
export function forEachUnit(w: SimWorld, fn: (u: Unit) => void): void {
  fn(w.hero);
  for (const u of w.units) if (u.id >= 0) fn(u);
}

/** Calls fn for every living, targetable unit on the other team. */
export function forEachEnemyOf(w: SimWorld, of: Unit, fn: (u: Unit) => void): void {
  if (of.team === 'enemy') {
    if (w.hero.alive) fn(w.hero);
    for (const u of w.units) if (u.id >= 0 && u.alive && u.team === 'player') fn(u);
  } else {
    for (const u of w.units) if (u.id >= 0 && targetable(u) && u.team === 'enemy') fn(u);
  }
}

export function nearestEnemy(
  w: SimWorld,
  of: Unit,
  x: number,
  z: number,
  maxDist: number,
): Unit | null {
  let best: Unit | null = null;
  let bestD = maxDist;
  forEachEnemyOf(w, of, (u) => {
    const d = Math.hypot(u.x - x, u.z - z) - u.r;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  });
  return best;
}

export interface HitSpec {
  school: 'physical' | 'magic';
  element: Element;
  /** Skill multiplier, e.g. 1.8 for 180%. */
  pct: number;
  canCrit: boolean;
  ignoreDef: number;
  /** Skill tags used to match tagged modifiers (damagePct on 'magic', 'fire' and so on). */
  tags: string[];
  affinity: boolean;
  alwaysHit?: boolean;
  melee: boolean;
  /** Basic attacks use the 'basic' tag for modifiers. */
  basic?: boolean;
  /** Triggers (on hit, crit) fire only for the hero's own direct hits. */
  procs?: boolean;
}

/** One hit from `attacker` on `target`: pipeline, damage, reflect and on-hit triggers. */
export function dealHit(
  w: SimWorld,
  attacker: Unit,
  target: Unit,
  spec: HitSpec,
  ctx?: FxCtx | null,
): HitResult {
  const mods = sumUnitMods(w, attacker, 'damagePct', spec.tags);
  const res = resolveHit(w.b, w.rng, attacker, target, {
    school: spec.school,
    element: spec.element,
    pct: spec.pct * atkMult(w.b, attacker),
    canCrit: spec.canCrit,
    ignoreDef: spec.ignoreDef,
    bonusGroup: mods.pct,
    raceBonus: 0,
    targetMods: targetMods(w.b, target, spec.school),
    affinity: spec.affinity,
    alwaysHit: spec.alwaysHit,
    hitMod: hitMod(w.b, attacker),
  });
  if (res.missed || res.dodged) {
    w.emit({ t: 'text', x: target.x, z: target.z, text: w.str.miss, color: '#b0b0b0' });
    if (res.dodged && target.kind === 'hero') fireTrigger(w, 'dodge', { target: attacker });
    return res;
  }
  if (spec.school === 'physical' && target.statuses.some((s) => s.id === 'freeze')) {
    removeStatus(target, 'freeze'); // the hit breaks the freeze (its +30% is already in targetMods)
  }
  if (res.amount > 0) applyDamage(w, target, res.amount, attacker, res.crit);
  else w.emit({ t: 'text', x: target.x, z: target.z, text: '0', color: '#b0b0b0' });
  if (target.reflectMelee > 0 && spec.melee && res.amount > 0 && attacker.alive) {
    applyDamage(
      w,
      attacker,
      Math.max(1, Math.round(res.amount * target.reflectMelee)),
      target,
      false,
    );
  }
  if (attacker.kind === 'hero' && spec.procs !== false && !w.hs.inProc && res.amount > 0) {
    fireTrigger(w, 'hit', { target });
    if (res.crit) fireTrigger(w, 'crit', { target });
  }
  void ctx;
  return res;
}

/**
 * Removes HP from a unit: invulnerability, shield, lethal triggers, events and death.
 * Returns the HP actually lost.
 */
export function applyDamage(
  w: SimWorld,
  target: Unit,
  amount: number,
  src: Unit | null,
  crit: boolean,
  opts: { dot?: boolean } = {},
): number {
  if (!target.alive || target.invuln > 0 || amount <= 0) return 0;
  const hero = target.kind === 'hero';
  if (w.hero === target && w.godMode) return 0;
  let dmg = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
    if (dmg <= 0) {
      w.emit({
        t: 'dmg',
        targetId: target.id,
        x: target.x,
        z: target.z,
        amount: absorbed,
        crit: false,
        toHero: hero,
        shielded: true,
      });
      return 0;
    }
  }
  if (hero && dmg >= target.hp && fireTrigger(w, 'lethal', { target: src ?? undefined })) {
    // A lethal-damage trigger (Second Wind) leaves the hero at 1 HP.
    target.hp = 1;
    w.hs.lowHpArmed = false;
    return 0;
  }
  const before = target.hp;
  target.hp -= dmg;
  target.lastDamagedAt = w.time;
  w.emit({
    t: 'dmg',
    targetId: target.id,
    x: target.x,
    z: target.z,
    amount: Math.round(dmg),
    crit,
    toHero: hero,
    dot: opts.dot,
  });
  if (target.hp <= 0) {
    target.hp = 0;
    killUnit(w, target, src);
  } else if (hero) {
    fireTrigger(w, 'damaged', { target: src ?? undefined });
    const frac = target.hp / target.maxHp;
    // lowHp triggers fire as HP crosses their threshold; they re-arm once HP recovers.
    if (before / target.maxHp >= 0.4 && frac < 0.4)
      fireTrigger(w, 'lowHp', { target: src ?? undefined });
  }
  return before - target.hp;
}

export function killUnit(w: SimWorld, u: Unit, killer: Unit | null): void {
  if (!u.alive) return;
  u.alive = false;
  u.hp = 0;
  u.deadFor = 0;
  u.statuses.length = 0;
  w.events.push({ t: 'kill', targetId: u.id, defId: u.defId, elite: u.elite, boss: u.isBoss });
  if (u.kind === 'hero') {
    w.heroDied();
    return;
  }
  if (u.kind === 'summon' && u.summon) {
    if (w.hero.alive) fireTrigger(w, 'summonDeath', { target: u });
  }
  if (u.team === 'enemy') {
    w.onMonsterKilled(u);
    if (killer && killer.kind === 'hero' && !w.hs.inProc) fireTrigger(w, 'kill', { target: u });
  }
}

/** Heals a unit (poison cuts healing by 30%). Returns the HP restored. */
export function healUnit(w: SimWorld, u: Unit, amount: number): number {
  if (!u.alive || amount <= 0) return 0;
  const gain = Math.min(u.maxHp - u.hp, amount * healMult(w.b, u));
  if (gain <= 0) return 0;
  u.hp += gain;
  w.emit({
    t: 'dmg',
    targetId: u.id,
    x: u.x,
    z: u.z,
    amount: Math.round(gain),
    crit: false,
    toHero: u.kind === 'hero',
    heal: true,
  });
  return gain;
}
