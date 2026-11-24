import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { balance, debugSkills } from '../src/data/schema';
import { rollHit } from '../src/sim/damage';
import { angleDiff, coneHits, lineHits } from '../src/sim/geometry';
import { SimWorld, type TickInput } from '../src/sim/world';

const still: TickInput = { moveX: 0, moveZ: 0, casts: [] };
const dt = 1 / balance.tickRate;

function world(seed = 1): SimWorld {
  return new SimWorld(balance, debugSkills, seed);
}

describe('rollHit', () => {
  const base = { atk: 100, atkPct: 2, critChance: 0, critMult: 1.5, variance: 0 };
  it('multiplies ATK by the skill percentage', () => {
    expect(rollHit(new Rng(1), base).amount).toBe(200);
  });
  it('crits multiply damage and always crit at 100% chance', () => {
    const r = rollHit(new Rng(1), { ...base, critChance: 1 });
    expect(r.crit).toBe(true);
    expect(r.amount).toBe(300);
  });
  it('never deals less than 1 and keeps variance in range', () => {
    expect(rollHit(new Rng(1), { ...base, atk: 0.1, atkPct: 0.1 }).amount).toBe(1);
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const a = rollHit(rng, { ...base, variance: 0.05 }).amount;
      expect(a).toBeGreaterThanOrEqual(190);
      expect(a).toBeLessThanOrEqual(210);
    }
  });
});

describe('geometry', () => {
  it('angleDiff wraps around', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 6);
  });
  it('cone hits inside the arc and range, misses behind', () => {
    const half = (120 * Math.PI) / 180;
    expect(coneHits(0, 0, 0, 4, half, 0, 3, 0.7)).toBe(true);
    expect(coneHits(0, 0, 0, 4, half, 0, -3, 0.7)).toBe(false);
    expect(coneHits(0, 0, 0, 4, half, 0, 6, 0.7)).toBe(false);
  });
  it('line hits within its width and length', () => {
    expect(lineHits(0, 0, 0, 9, 1.6, 0.5, 5, 0.7)).toBe(true);
    expect(lineHits(0, 0, 0, 9, 1.6, 3, 5, 0.7)).toBe(false);
    expect(lineHits(0, 0, 0, 9, 1.6, 0, 12, 0.7)).toBe(false);
  });
});

describe('SimWorld', () => {
  it('places the configured number of dummies, clear of the hero and of each other', () => {
    const w = world();
    expect(w.dummies).toHaveLength(balance.dummies.count);
    for (const d of w.dummies) {
      expect(Math.hypot(d.x, d.z)).toBeGreaterThanOrEqual(balance.dummies.spawnClearRadius - 1e-6);
    }
  });
  it('is deterministic for a seed', () => {
    const run = () => {
      const w = world(5);
      for (let i = 0; i < 300; i++) w.tick(dt, still);
      return w.dummies.map((d) => d.hp).join(',');
    };
    expect(run()).toBe(run());
  });
  it('moves at move speed for full joystick tilt', () => {
    const w = world();
    w.dummies.length = 0;
    for (let i = 0; i < 30; i++) w.tick(dt, { moveX: 1, moveZ: 0, casts: [] });
    expect(w.hero.x).toBeCloseTo(balance.hero.moveSpeed, 4);
  });
  it('auto-attacks the nearest enemy while standing still and emits damage events', () => {
    const w = world();
    w.dummies.length = 2;
    w.dummies[0].x = 6;
    w.dummies[0].z = 0;
    w.dummies[1].x = -9;
    w.dummies[1].z = 0;
    for (let i = 0; i < 150; i++) w.tick(dt, still);
    const ev = w.drainEvents().filter((e) => e.t === 'dmg');
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.t === 'dmg' && e.targetId === 0)).toBe(true);
    expect(w.dummies[1].hp).toBe(w.dummies[1].maxHp);
  });
  it('prefers the focus target over a nearer enemy', () => {
    const w = world();
    w.dummies.length = 2;
    w.dummies[0].x = 3;
    w.dummies[0].z = 0;
    w.dummies[1].x = -6;
    w.dummies[1].z = 0;
    w.setFocus(1);
    for (let i = 0; i < 120; i++) w.tick(dt, still);
    expect(w.dummies[1].hp).toBeLessThan(w.dummies[1].maxHp);
    expect(w.dummies[0].hp).toBe(w.dummies[0].maxHp);
  });
  it('does not attack beyond the auto-attack range', () => {
    const w = world();
    w.dummies.length = 1;
    w.dummies[0].x = balance.targeting.autoAttackRange + 5;
    w.dummies[0].z = 0;
    for (let i = 0; i < 90; i++) w.tick(dt, still);
    expect(w.dummies[0].hp).toBe(w.dummies[0].maxHp);
    expect(w.hero.moving).toBe(false);
  });
  it('moving cancels an attack wind-up', () => {
    const w = world();
    w.dummies.length = 1;
    w.dummies[0].x = 1.5;
    w.dummies[0].z = 0;
    for (let i = 0; i < 4; i++) w.tick(dt, still);
    expect(w.hero.swinging).toBe(true);
    w.tick(dt, { moveX: 0, moveZ: 1, casts: [] });
    expect(w.hero.swinging).toBe(false);
  });
  it('skills respect cooldown and the global cooldown', () => {
    const w = world();
    expect(w.cast({ slot: 0, aim: null })).toBe('ok');
    expect(w.cast({ slot: 1, aim: null })).toBe('cooldown');
    for (let i = 0; i < Math.ceil(balance.skills.globalCooldown / dt) + 1; i++) w.tick(dt, still);
    expect(w.cast({ slot: 1, aim: null })).toBe('ok');
    expect(w.cast({ slot: 0, aim: null })).toBe('cooldown');
  });
  it('a ground skill hits enemies in its area', () => {
    const w = world();
    w.dummies.length = 1;
    w.dummies[0].x = 6;
    w.dummies[0].z = 0;
    const slam = debugSkills.findIndex((s) => s.id === 'dbg_slam');
    expect(w.cast({ slot: slam, aim: { x: 6, z: 0 } })).toBe('ok');
    expect(w.dummies[0].hp).toBeLessThan(w.dummies[0].maxHp);
  });
  it('killed dummies respawn and clear the focus', () => {
    const w = world();
    w.dummies.length = 1;
    w.dummies[0].x = 2;
    w.dummies[0].z = 0;
    w.dummies[0].hp = 1;
    w.setFocus(0);
    for (let i = 0; i < 60; i++) w.tick(dt, still);
    expect(w.dummies[0].alive).toBe(false);
    expect(w.focusId).toBe(-1);
    for (let i = 0; i < balance.dummies.respawnSec * balance.tickRate + 5; i++)
      w.tick(dt, { moveX: 0, moveZ: 0, casts: [] });
    expect(w.dummies[0].alive).toBe(true);
  });
  it('Tab cycles focus through alive targets by distance', () => {
    const w = world();
    w.cycleFocus();
    const first = w.focusId;
    expect(first).toBeGreaterThanOrEqual(0);
    w.cycleFocus();
    expect(w.focusId).not.toBe(first);
  });
  it('pickAt returns the dummy near a ground point', () => {
    const w = world();
    const d = w.dummies[3];
    expect(w.pickAt(d.x + 0.3, d.z)?.id).toBe(3);
    expect(w.pickAt(1000, 1000)).toBeNull();
  });
});
