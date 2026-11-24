import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { balance as b } from '../src/data/schema';
import { elementMult, resolveHit, targetMods, type HitParams } from '../src/sim/damage';
import { makeUnit } from '../src/sim/unit';

const base: HitParams = {
  school: 'physical',
  element: 'neutral',
  pct: 1,
  canCrit: false,
  ignoreDef: 0,
  bonusGroup: 0,
  raceBonus: 0,
  targetMods: 1,
  affinity: false,
  alwaysHit: true,
};
const hero = () =>
  makeUnit({
    id: 1,
    team: 'player',
    kind: 'hero',
    atk: 100,
    matkMin: 100,
    matkMax: 100,
    hit: 999,
    critPct: 0,
  });
const mob = (o = {}) => makeUnit({ id: 2, def: 0, mdef: 0, flee: 0, ...o });
// Variance is +/-5%, so assert within that band.
const near = (v: number, expected: number) => {
  expect(v).toBeGreaterThanOrEqual(Math.round(expected * 0.95));
  expect(v).toBeLessThanOrEqual(Math.round(expected * 1.05) + 1);
};

describe('element table (PRD Section 10)', () => {
  it('matches the key cells', () => {
    expect(elementMult('water', 'fire')).toBe(1.5);
    expect(elementMult('fire', 'earth')).toBe(1.5);
    expect(elementMult('earth', 'wind')).toBe(1.5);
    expect(elementMult('wind', 'water')).toBe(1.5);
    expect(elementMult('holy', 'undead')).toBe(1.75);
    expect(elementMult('holy', 'shadow')).toBe(1.5);
    expect(elementMult('neutral', 'ghost')).toBe(0.25);
    expect(elementMult('fire', 'fire')).toBe(0.25);
    expect(elementMult('shadow', 'undead')).toBe(0.25);
    expect(elementMult('undead', 'shadow')).toBe(0);
    expect(elementMult('poison', 'poison')).toBe(0);
  });
  it('has the water > fire > earth > wind > water cycle', () => {
    expect(elementMult('water', 'fire')).toBeGreaterThan(1);
    expect(elementMult('fire', 'water')).toBeLessThan(1);
  });
});

describe('damage pipeline steps', () => {
  it('base: physical uses ATK, multiplied by the skill percentage', () => {
    near(resolveHit(b, new Rng(1), hero(), mob(), { ...base, pct: 2.5 }).amount, 250);
  });
  it('base: magic rolls between MATK min and max', () => {
    const h = makeUnit({ id: 1, team: 'player', matkMin: 50, matkMax: 150 });
    const rng = new Rng(3);
    const amounts = Array.from(
      { length: 200 },
      () => resolveHit(b, rng, h, mob(), { ...base, school: 'magic', pct: 1 }).amount,
    );
    expect(Math.min(...amounts)).toBeLessThan(70);
    expect(Math.max(...amounts)).toBeGreaterThan(130);
    expect(Math.min(...amounts)).toBeGreaterThanOrEqual(47);
    expect(Math.max(...amounts)).toBeLessThanOrEqual(158);
  });
  it('weapon affinity adds +25%', () => {
    near(resolveHit(b, new Rng(1), hero(), mob(), { ...base, affinity: true }).amount, 125);
  });
  it('bonuses: tag bonuses add within a group, and the three groups multiply', () => {
    // (1 + 0.1 + 0.2) x (1 + 0.1) x 1.5 = 2.145
    const r = resolveHit(b, new Rng(1), hero(), mob(), {
      ...base,
      bonusGroup: 0.3,
      raceBonus: 0.1,
      targetMods: 1.5,
    });
    near(r.amount, 100 * 1.3 * 1.1 * 1.5);
  });
  it('element: multiplies by the table, and monster attacks deal x1 to the hero', () => {
    const fire = { ...base, element: 'fire' as const };
    near(resolveHit(b, new Rng(1), hero(), mob({ element: 'earth' }), fire).amount, 150);
    near(resolveHit(b, new Rng(1), hero(), mob({ element: 'water' }), fire).amount, 50);
    const monsterAtk = mob({ atk: 100, element: 'fire' });
    const heroDef = makeUnit({ id: 9, team: 'player', element: 'neutral' });
    near(
      resolveHit(b, new Rng(1), monsterAtk, heroDef, { ...base, element: 'poison' }).amount,
      100,
    );
  });
  it('element: a 0 cell deals no damage', () => {
    const r = resolveHit(b, new Rng(1), hero(), mob({ element: 'poison' }), {
      ...base,
      element: 'poison',
    });
    expect(r.amount).toBe(0);
  });
  it('defense: physical damage x 100 / (100 + DEF)', () => {
    near(resolveHit(b, new Rng(1), hero(), mob({ def: 100 }), base).amount, 50);
    near(resolveHit(b, new Rng(1), hero(), mob({ def: 300 }), base).amount, 25);
  });
  it('defense: magic uses MDEF and ignore-DEF removes part of it', () => {
    const magic = { ...base, school: 'magic' as const };
    const h = makeUnit({ id: 1, team: 'player', matkMin: 100, matkMax: 100 });
    near(resolveHit(b, new Rng(1), h, mob({ def: 0, mdef: 100 }), magic).amount, 50);
    near(
      resolveHit(b, new Rng(1), hero(), mob({ def: 100 }), { ...base, ignoreDef: 0.5 }).amount,
      100 / 1.5,
    );
    near(
      resolveHit(b, new Rng(1), hero(), mob({ def: 100 }), { ...base, ignoreDef: 1 }).amount,
      100,
    );
  });
  it('defense reduction stops at 80%, and all reduction combined stops at 85%', () => {
    near(resolveHit(b, new Rng(1), hero(), mob({ def: 99999 }), base).amount, 20);
    const stacked = mob({ def: 99999, damageReduction: 0.9 });
    near(resolveHit(b, new Rng(1), hero(), stacked, base).amount, 15);
  });
  it('crit multiplies by 1.5 plus crit damage, and always hits', () => {
    const h = hero();
    h.critPct = 100;
    h.critMult = 1.75;
    const lowHit = { ...base, canCrit: true, alwaysHit: false };
    const evasive = mob({ flee: 9999, perfectDodgePct: 100 });
    const r = resolveHit(b, new Rng(1), h, evasive, lowHit);
    expect(r.crit).toBe(true);
    expect(r.missed).toBe(false);
    near(r.amount, 175);
  });
  it('magic cannot crit unless the skill allows it', () => {
    const h = makeUnit({ id: 1, team: 'player', matkMin: 100, matkMax: 100, critPct: 100 });
    const magic = { ...base, school: 'magic' as const };
    expect(resolveHit(b, new Rng(1), h, mob(), magic).crit).toBe(false);
    expect(resolveHit(b, new Rng(1), h, mob(), { ...magic, canCrit: true }).crit).toBe(true);
  });
  it('variance stays within 0.95 to 1.05 and the minimum is 1', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) near(resolveHit(b, rng, hero(), mob(), base).amount, 100);
    const weak = makeUnit({ id: 1, team: 'player', atk: 0.1 });
    expect(resolveHit(b, new Rng(1), weak, mob(), base).amount).toBe(1);
  });
});

describe('hit check', () => {
  it('misses follow 80 + HIT - FLEE clamped to 15..100', () => {
    const h = hero();
    h.hit = 0;
    const p = { ...base, alwaysHit: false };
    const rng = new Rng(11);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (!resolveHit(b, rng, h, mob({ flee: 80 }), p).missed) hits++;
    // 80 + 0 - 80 = 0, clamped up to 15%.
    expect(hits / 4000).toBeGreaterThan(0.12);
    expect(hits / 4000).toBeLessThan(0.18);
  });
  it('perfect dodge only applies to physical hits', () => {
    const h = hero();
    const p = { ...base, alwaysHit: false };
    const dodger = mob({ perfectDodgePct: 100, flee: 0 });
    expect(resolveHit(b, new Rng(1), h, dodger, p).dodged).toBe(true);
    const magic = { ...p, school: 'magic' as const };
    expect(resolveHit(b, new Rng(1), h, dodger, magic).dodged).toBe(false);
  });
});

describe('target modifiers', () => {
  it('mark adds its power, stagger adds 20%, freeze adds 30% to physical only', () => {
    const t = mob();
    expect(targetMods(b, t, 'physical')).toBe(1);
    t.statuses.push({ id: 'mark', remaining: 5, power: 0.15, stacks: 1, src: 1, tick: 0 });
    expect(targetMods(b, t, 'physical')).toBeCloseTo(1.15, 6);
    t.staggerT = 1;
    expect(targetMods(b, t, 'magic')).toBeCloseTo(1.15 * 1.2, 6);
    t.statuses.push({ id: 'freeze', remaining: 2, power: 0, stacks: 1, src: 1, tick: 0 });
    expect(targetMods(b, t, 'physical')).toBeCloseTo(1.15 * 1.2 * 1.3, 6);
    expect(targetMods(b, t, 'magic')).toBeCloseTo(1.15 * 1.2, 6);
  });
});
