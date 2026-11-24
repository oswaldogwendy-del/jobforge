import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { balance as b } from '../src/data/schema';
import {
  apsMult,
  applyStatus,
  atkMult,
  canAct,
  canCast,
  canMove,
  cleanse,
  healMult,
  hasStatus,
  hitMod,
  moveMult,
  tickStatuses,
} from '../src/sim/status';
import { makeUnit } from '../src/sim/unit';

const o = (now = 0, power = 0) => ({ now, src: 1, power });

describe('applying statuses', () => {
  it('adds a status with a duration and refreshes it instead of duplicating', () => {
    const t = makeUnit({ id: 2 });
    expect(applyStatus(b, new Rng(1), t, 'burn', 3, o(0, 5))).toBe('applied');
    applyStatus(b, new Rng(1), t, 'burn', 5, o(1, 8));
    expect(t.statuses).toHaveLength(1);
    expect(t.statuses[0].remaining).toBe(5);
    expect(t.statuses[0].power).toBe(8);
  });
  it('bleed stacks up to 3', () => {
    const t = makeUnit({ id: 2 });
    for (let i = 0; i < 6; i++) applyStatus(b, new Rng(1), t, 'bleed', 4, o(i, 3));
    expect(t.statuses[0].stacks).toBe(3);
  });
  it('a repeat stun within 6 s lasts half as long, after 6 s it is full again', () => {
    const t = makeUnit({ id: 2 });
    applyStatus(b, new Rng(1), t, 'stun', 2, o(0));
    expect(t.statuses[0].remaining).toBe(2);
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'stun', 2, o(4));
    expect(t.statuses[0].remaining).toBe(1);
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'stun', 2, o(11));
    expect(t.statuses[0].remaining).toBe(2);
  });
  it('the halving rule covers freeze and root too, but not slow', () => {
    const t = makeUnit({ id: 2 });
    applyStatus(b, new Rng(1), t, 'freeze', 2, o(0));
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'freeze', 2, o(1));
    expect(t.statuses[0].remaining).toBe(1);
    applyStatus(b, new Rng(1), t, 'slow', 3, o(0));
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'slow', 3, o(1));
    expect(t.statuses[0].remaining).toBe(3);
  });
  it('resist chance can block a status', () => {
    const t = makeUnit({ id: 2, resist: { stun: 100 } });
    expect(applyStatus(b, new Rng(1), t, 'stun', 2, o())).toBe('resisted');
    expect(t.statuses).toHaveLength(0);
  });
  it('a buff can grant immunity', () => {
    const t = makeUnit({ id: 2 });
    t.buffs.push({
      key: 'unyielding',
      src: 2,
      remaining: 6,
      mods: [],
      immune: ['stun'],
      debuff: false,
    });
    expect(applyStatus(b, new Rng(1), t, 'stun', 2, o())).toBe('immune');
  });
  it('cannot affect the dead', () => {
    const t = makeUnit({ id: 2, alive: false });
    expect(applyStatus(b, new Rng(1), t, 'burn', 2, o())).toBe('immune');
  });
});

describe('bosses and stagger', () => {
  it('stun, freeze and root fill the stagger bar instead of applying', () => {
    const boss = makeUnit({ id: 3, isBoss: true });
    expect(applyStatus(b, new Rng(1), boss, 'stun', 2, o())).toBe('stagger');
    expect(boss.statuses).toHaveLength(0);
    expect(boss.stagger).toBe(b.combat.staggerFillPerCc);
  });
  it('a full bar staggers the boss for 2 s and resets', () => {
    const boss = makeUnit({ id: 3, isBoss: true });
    for (let i = 0; i < 3; i++) applyStatus(b, new Rng(1), boss, 'root', 3, o());
    expect(boss.staggerT).toBe(b.combat.staggerDuration);
    expect(boss.stagger).toBe(0);
    // More crowd control during the stagger does not stack.
    applyStatus(b, new Rng(1), boss, 'stun', 2, o());
    expect(boss.stagger).toBe(0);
    tickStatuses(boss, 2.1);
    expect(boss.staggerT).toBe(0);
  });
  it('bosses are immune to silence, cap taunt at 2 s and take other statuses normally', () => {
    const boss = makeUnit({ id: 3, isBoss: true });
    expect(applyStatus(b, new Rng(1), boss, 'silence', 2, o())).toBe('immune');
    applyStatus(b, new Rng(1), boss, 'taunt', 10, o());
    expect(boss.statuses.find((s) => s.id === 'taunt')!.remaining).toBe(2);
    expect(applyStatus(b, new Rng(1), boss, 'burn', 3, o(0, 5))).toBe('applied');
  });
});

describe('status effects on units', () => {
  it('stun and freeze stop everything, root stops movement only, silence stops casting', () => {
    const t = makeUnit({ id: 2 });
    expect([canAct(t), canMove(t), canCast(t)]).toEqual([true, true, true]);
    applyStatus(b, new Rng(1), t, 'root', 3, o());
    expect([canAct(t), canMove(t), canCast(t)]).toEqual([true, false, true]);
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'silence', 2, o());
    expect([canAct(t), canMove(t), canCast(t)]).toEqual([true, true, false]);
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'stun', 2, o());
    expect([canAct(t), canMove(t), canCast(t)]).toEqual([false, false, false]);
  });
  it('slow cuts move speed 30% and APS 20% unless the skill sets another amount', () => {
    const t = makeUnit({ id: 2 });
    applyStatus(b, new Rng(1), t, 'slow', 3, o(0, 0));
    expect(moveMult(b, t)).toBeCloseTo(0.7, 6);
    expect(apsMult(b, t)).toBeCloseTo(0.8, 6);
    t.statuses.length = 0;
    applyStatus(b, new Rng(1), t, 'slow', 3, o(0, 0.4));
    expect(moveMult(b, t)).toBeCloseTo(0.6, 6);
  });
  it('curse cuts ATK 20% and move speed 20%, blind removes half HIT, poison cuts healing 30%', () => {
    const t = makeUnit({ id: 2, hit: 100 });
    applyStatus(b, new Rng(1), t, 'curse', 6, o());
    applyStatus(b, new Rng(1), t, 'blind', 3, o());
    applyStatus(b, new Rng(1), t, 'poison', 5, o(0, 2));
    expect(atkMult(b, t)).toBeCloseTo(0.8, 6);
    expect(moveMult(b, t)).toBeCloseTo(0.8, 6);
    expect(hitMod(b, t)).toBeCloseTo(-50, 6);
    expect(healMult(b, t)).toBeCloseTo(0.7, 6);
  });
  it('damage over time ticks once per second, scaled by stacks, and expires', () => {
    const t = makeUnit({ id: 2 });
    applyStatus(b, new Rng(1), t, 'bleed', 4, o(0, 3));
    applyStatus(b, new Rng(1), t, 'bleed', 4, o(0, 3));
    const ticks = tickStatuses(t, 1.0);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].dmg).toBe(6);
    for (let i = 0; i < 4; i++) tickStatuses(t, 1);
    expect(hasStatus(t, 'bleed')).toBe(false);
  });
  it('taunt records who the unit must target and clears when it ends', () => {
    const t = makeUnit({ id: 2 });
    applyStatus(b, new Rng(1), t, 'taunt', 4, { now: 0, src: 7, power: 0 });
    expect(t.tauntTarget).toBe(7);
    tickStatuses(t, 4.1);
    expect(t.tauntTarget).toBe(-1);
  });
  it('cleanse removes the requested number of debuffs', () => {
    const t = makeUnit({ id: 2 });
    for (const s of ['slow', 'burn', 'blind'] as const)
      applyStatus(b, new Rng(1), t, s, 5, o(0, 1));
    expect(cleanse(t, 2)).toBe(2);
    expect(t.statuses).toHaveLength(1);
  });
});
