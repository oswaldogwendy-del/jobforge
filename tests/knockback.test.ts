import { describe, expect, it } from 'vitest';
import { balance } from '../src/data/schema';
import { displaceUnit } from '../src/sim/engine';
import { applyStatus } from '../src/sim/status';
import type { SimWorld } from '../src/sim/world';
import { dist } from '../src/sim/geometry';
import { dummyAt, monsterAt, run, steady, world, DT } from './helpers';

const k = balance.combat.knockback;

/** The hero's own auto-attack walks into dummies and pushes them, so most tests root it. */
const root = (w: SimWorld) =>
  void applyStatus(balance, w.rng, w.hero, 'root', 999, { now: 0, src: 99, power: 0 });

describe('knockback', () => {
  it('slides over its duration instead of jumping, ending at the full distance', () => {
    const w = world();
    root(w);
    const u = dummyAt(w, 0, 3);
    displaceUnit(w, u, 0, 0, 'knockback', 2);
    expect(u.z).toBe(3); // nothing moved yet
    run(w, DT * 2);
    expect(u.z).toBeGreaterThan(3);
    expect(u.z).toBeLessThan(5);
    run(w, k.duration + 0.1);
    expect(u.z).toBeCloseTo(5, 1);
  });

  it('is stopped by an obstacle', () => {
    const w = world();
    root(w);
    const u = dummyAt(w, 0, 3);
    w.nav.obstacles.push({ x: 0, z: 4.5, r: 1 });
    displaceUnit(w, u, 0, 0, 'knockback', 3);
    run(w, 0.6);
    expect(u.z).toBeLessThan(4);
  });

  it('ignores bosses and knockback-immune buffs', () => {
    const w = world();
    root(w);
    const boss = dummyAt(w, 0, 3, 1000, { isBoss: true });
    displaceUnit(w, boss, 0, 0, 'knockback', 3);
    run(w, 0.6);
    expect(boss.z).toBe(3);
  });

  it('ignores a second push inside the immunity window, then accepts one again', () => {
    const w = world();
    root(w);
    const u = dummyAt(w, 0, 3);
    displaceUnit(w, u, 0, 0, 'knockback', 1);
    run(w, 0.4);
    const z1 = u.z;
    displaceUnit(w, u, 0, 0, 'knockback', 1);
    run(w, 0.4);
    expect(u.z).toBeCloseTo(z1, 3);
    run(w, k.immuneSec);
    displaceUnit(w, u, 0, 0, 'knockback', 1);
    run(w, 0.4);
    expect(u.z).toBeCloseTo(z1 + 1, 1);
  });

  it('elites are pushed by a fraction and are not stunned; normals flinch', () => {
    const w = world();
    root(w);
    const normal = dummyAt(w, 4, 0);
    const elite = dummyAt(w, -4, 0, 100000, { elite: true });
    displaceUnit(w, normal, 0, 0, 'knockback', 2);
    displaceUnit(w, elite, 0, 0, 'knockback', 2);
    expect(normal.hitStunT).toBeCloseTo(k.stunSec, 3);
    expect(elite.hitStunT).toBe(0);
    run(w, 0.6);
    expect(normal.x).toBeCloseTo(6, 1);
    expect(elite.x).toBeCloseTo(-4 - 2 * k.eliteFactor, 1);
  });

  it('a push cancels a normal monster windup', () => {
    const w = world();
    root(w);
    const m = monsterAt(w, 'jellop', 0, 2.5, 5);
    m.ai!.hasAggro = true;
    for (let i = 0; i < 90 && m.ai!.state !== 'windup'; i++) run(w, DT);
    expect(m.ai!.state).toBe('windup');
    displaceUnit(w, m, w.hero.x, w.hero.z, 'knockback', 1);
    run(w, DT * 2);
    expect(m.ai!.state).not.toBe('windup');
  });

  it('the hero basic attack pushes by weapon type', () => {
    const w = world('warrior');
    steady(w);
    const sword = dummyAt(w, 0, 1.4);
    w.setFocus(sword.id);
    run(w, 1.2);
    const pushed = dist(0, 0, sword.x, sword.z) - 1.4;
    expect(pushed).toBeGreaterThan(0.2);
    expect(pushed).toBeLessThan(k.basic.sword + 1.5);
    expect(k.basic.greataxe).toBeGreaterThan(k.basic.sword);
    expect(k.basic.staff).toBeLessThan(k.basic.sword);
  });
});
