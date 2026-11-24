import { describe, expect, it } from 'vitest';
import { balance as b } from '../src/data/schema';
import { skillMap } from '../src/data/content';
import { rebuildSlots, refreshHero, tryCast } from '../src/sim/engine';
import { hasStatus, applyStatus } from '../src/sim/status';
import {
  DT,
  cast,
  damageEvents,
  dummyAt,
  fixture,
  giveSkill,
  run,
  steady,
  still,
  useSkill,
  world,
} from './helpers';

const crush = 'knight_crushing_blow';

describe('casting rules (PRD Sections 5 and 7)', () => {
  it('pays SP, starts the cooldown and the 0.4 s global cooldown, and hits the target', () => {
    const w = world();
    steady(w);
    const d = dummyAt(w, 0, 2.5);
    const sp0 = w.hero.sp;
    cast(w, 0);
    expect(w.hero.sp).toBeLessThan(sp0 - 7.9);
    expect(w.hs.cooldown[0]).toBeGreaterThan(3.5);
    expect(w.hs.gcd).toBeGreaterThan(0.3);
    expect(d.hp).toBeLessThan(d.maxHp);
  });
  it('the global cooldown blocks a second skill for 0.4 s only', () => {
    const w = world();
    steady(w);
    dummyAt(w, 0, 3);
    useSkill(w, 'knight_flame_burst', 1, 1);
    w.build.stats.STR = 30;
    rebuildSlots(w);
    cast(w, 0);
    expect(tryCast(w, 1, null)).toBe('cooldown');
    run(w, 0.45);
    expect(tryCast(w, 1, null)).toBe('ok');
  });
  it('a skill on cooldown cannot be cast and spends nothing', () => {
    const w = world();
    steady(w);
    dummyAt(w, 0, 3);
    cast(w, 0);
    run(w, 0.5);
    const sp = w.hero.sp;
    expect(tryCast(w, 0, null)).toBe('cooldown');
    expect(w.hero.sp).toBe(sp);
  });
  it('not enough SP fails and spends nothing', () => {
    const w = world();
    dummyAt(w, 0, 3);
    w.hero.sp = 3;
    expect(tryCast(w, 0, null)).toBe('noSp');
    expect(w.hero.sp).toBe(3);
  });
  it('a single-target skill with no enemy in range says "No target" and spends nothing', () => {
    const w = world();
    const sp = w.hero.sp;
    expect(tryCast(w, 0, null)).toBe('noTarget');
    expect(w.hero.sp).toBe(sp);
    expect(w.hs.cooldown[0]).toBe(0);
    expect(w.events.some((e) => e.t === 'text' && e.text === 'No target')).toBe(true);
    dummyAt(w, 0, 30); // out of range
    expect(tryCast(w, 0, null)).toBe('noTarget');
  });
  it('melee-range skills step up to 4 m toward the target before striking', () => {
    const w = world();
    steady(w);
    const d = dummyAt(w, 0, 6);
    cast(w, 0);
    expect(w.hero.z).toBeGreaterThan(2.5);
    expect(w.hero.z).toBeLessThanOrEqual(4.3);
    expect(d.hp).toBeLessThan(d.maxHp);
    const far = world();
    dummyAt(far, 0, 4 + 2.2 + 0.7 + 1.0);
    expect(tryCast(far, 0, null)).toBe('noTarget'); // beyond the 4 m step range
  });
  it('prefers the focus target over a nearer enemy, and a drag aims at a different one', () => {
    const w = world();
    steady(w);
    const near = dummyAt(w, 0, 3);
    const far = dummyAt(w, 3, 3.2);
    w.setFocus(far.id);
    cast(w, 0);
    expect(far.hp).toBeLessThan(far.maxHp);
    expect(near.hp).toBe(near.maxHp);
    const w2 = world();
    steady(w2);
    const a = dummyAt(w2, 0, 3);
    const c = dummyAt(w2, -3, 3.2);
    cast(w2, 0, { x: -3, z: 3.2 });
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(a.hp).toBe(a.maxHp);
  });
  it('a stunned, frozen or silenced hero cannot cast', () => {
    for (const s of ['stun', 'freeze', 'silence'] as const) {
      const w = world();
      dummyAt(w, 0, 3);
      applyStatus(b, w.rng, w.hero, s, 3, { now: 0, src: 9, power: 0 });
      expect(tryCast(w, 0, null)).toBe('blocked');
    }
  });
  it('cooldown reduction from gear and passives is capped at 40%', () => {
    const w = world();
    dummyAt(w, 0, 3);
    w.hs.passiveMods.push({ stat: 'cdr', add: 0, pct: 0.9 });
    refreshHero(w);
    expect(w.hs.cdrPct).toBe(40);
    steady(w);
    cast(w, 0);
    expect(w.hs.cooldown[0]).toBeCloseTo(4 * 0.6 * 1, 1);
  });
});

describe('cast time (PRD Section 5)', () => {
  const bolt = 'mage_ember_bolt';
  it('roots the hero for the cast time, then fires; SP is spent only on completion', () => {
    const w = world('caster');
    steady(w);
    const d = dummyAt(w, 0, 6);
    const sp0 = w.hero.sp;
    cast(w, 0);
    expect(w.hs.casting).not.toBeNull();
    expect(w.hero.sp).toBeCloseTo(sp0, 0);
    run(w, 0.2);
    expect(w.hs.casting).not.toBeNull();
    run(w, 0.8);
    expect(w.hs.casting).toBeNull();
    expect(w.hero.sp).toBeLessThan(sp0 - 5);
    run(w, 1.0);
    expect(d.hp).toBeLessThan(d.maxHp);
  });
  it('cast time shrinks with DEX and cast speed bonuses, to at least 20%', () => {
    const w = world('caster');
    dummyAt(w, 0, 6);
    w.build.stats.DEX = 30;
    rebuildSlots(w);
    expect(w.hs.castMult).toBeCloseTo(1 - 30 / 150, 6);
    w.hs.passiveMods.push({ stat: 'castSpeed', add: 0, pct: 0.3 });
    refreshHero(w);
    expect(w.hs.castMult).toBeCloseTo(1 - 30 / 150 - 0.3, 6);
    cast(w, 0);
    expect(w.hs.casting!.total).toBeCloseTo(0.6 * w.hs.castMult, 6);
    w.hs.passiveMods.push({ stat: 'castSpeed', add: 0, pct: 5 });
    refreshHero(w);
    expect(w.hs.castMult).toBe(0.2);
  });
  it('moving the joystick cancels the cast and spends no SP', () => {
    const w = world('caster');
    dummyAt(w, 0, 6);
    const sp0 = w.hero.sp;
    cast(w, 0);
    w.tick(DT, { moveX: 1, moveZ: 0, casts: [] });
    w.tick(DT, { moveX: 1, moveZ: 0, casts: [] });
    expect(w.hs.casting).toBeNull();
    expect(w.hero.sp).toBeCloseTo(sp0, 0);
    expect(w.hs.cooldown[0]).toBe(0);
    expect(w.events.some((e) => e.t === 'cast' && !e.ok && e.reason === 'moved')).toBe(true);
  });
  it('a stun during the cast cancels it', () => {
    const w = world('caster');
    dummyAt(w, 0, 6);
    cast(w, 0);
    applyStatus(b, w.rng, w.hero, 'stun', 1, { now: 0, src: 9, power: 0 });
    run(w, 0.1);
    expect(w.hs.casting).toBeNull();
    expect(w.hs.cooldown[0]).toBe(0);
  });
  it('if the target dies during the cast it is cancelled', () => {
    const w = world('caster');
    const d = dummyAt(w, 0, 6);
    cast(w, 0);
    d.hp = 0;
    d.alive = false;
    run(w, 1);
    expect(w.hs.casting).toBeNull();
    expect(w.hs.cooldown[0]).toBe(0);
  });
  void bolt;
});

describe('skill targeting types (PRD Section 5 table)', () => {
  it('direction skills go toward the focus or nearest enemy, else the facing direction', () => {
    const w = world();
    steady(w);
    w.build.stats.STR = 60;
    w.build.stats.VIT = 25;
    useSkill(w, 'knight_bulwark_charge', 0, 1);
    const ahead = dummyAt(w, 0, 6);
    cast(w, 0);
    run(w, 1);
    expect(ahead.hp).toBeLessThan(ahead.maxHp);
    expect(w.hero.z).toBeGreaterThan(7);
    const w2 = world();
    w2.build.stats.STR = 60;
    w2.build.stats.VIT = 25;
    useSkill(w2, 'knight_bulwark_charge', 0, 1);
    w2.hero.heading = Math.PI / 2; // facing +x, no enemies
    cast(w2, 0);
    run(w2, 1);
    expect(w2.hero.x).toBeGreaterThan(7);
    expect(Math.abs(w2.hero.z)).toBeLessThan(0.5);
  });
  it('ground skills land on the target or 4 m ahead, clamped to range, and a reticle aim overrides', () => {
    const w = world('caster');
    w.build.stats.INT = 40;
    useSkill(w, 'mage_wall_of_flame', 0, 1);
    cast(w, 0);
    run(w, 1.4);
    // Cast time elapsed; nothing to aim at, so the wall is 4 m ahead.
    const fx = w.events.filter((e) => e.t === 'fx');
    expect(fx.length).toBeGreaterThan(0);
    const e = fx[0];
    if (e.t === 'fx') expect(Math.hypot(e.x, e.z - 4)).toBeLessThan(4);
    const w2 = world('caster');
    w2.build.stats.INT = 40;
    useSkill(w2, 'mage_wall_of_flame', 0, 1);
    cast(w2, 0, { x: 0, z: 60 });
    run(w2, 1.4);
    const e2 = w2.events.find((x) => x.t === 'fx');
    if (e2 && e2.t === 'fx') expect(e2.z).toBeLessThanOrEqual(10.5);
  });
});

describe('weapon affinity', () => {
  it('a matching weapon gives +25% damage; a mismatch still works', () => {
    const dmg = (weapon: 'sword' | 'dagger') => {
      const w = world();
      w.build.weapon.type = weapon;
      rebuildSlots(w);
      steady(w);
      w.hero.atk = 100;
      const d = dummyAt(w, 0, 2.5);
      cast(w, 0);
      return d.maxHp - d.hp;
    };
    const ratios: number[] = [];
    for (let i = 0; i < 1; i++) ratios.push(dmg('sword') / dmg('dagger'));
    expect(ratios[0]).toBeGreaterThan(1.15);
    expect(ratios[0]).toBeLessThan(1.35);
  });
});

describe('hero skills from JSON use real data', () => {
  it('Crushing Blow deals 180% ATK at rank 1 and 300% at rank 5', () => {
    const dmg = (rank: number) => {
      const w = world();
      w.build.learned[crush] = rank;
      rebuildSlots(w);
      steady(w);
      w.hero.atk = 100;
      const d = dummyAt(w, 0, 2.5);
      cast(w, 0);
      return d.maxHp - d.hp;
    };
    const r1 = dmg(1);
    const r5 = dmg(5);
    expect(r1).toBeGreaterThan(180 * 0.9 * 1.25 - 5);
    expect(r1).toBeLessThan(180 * 1.1 * 1.25 + 5);
    expect(r5).toBeGreaterThan(300 * 0.9 * 1.25 - 5);
    expect(r5).toBeLessThan(300 * 1.1 * 1.25 + 5);
  });
  it('its stun only exists at rank 5', () => {
    const stunned = (rank: number) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const w = world('warrior', seed);
        w.build.learned[crush] = rank;
        rebuildSlots(w);
        steady(w);
        const d = dummyAt(w, 0, 2.5);
        cast(w, 0);
        if (hasStatus(d, 'stun')) n++;
      }
      return n;
    };
    expect(stunned(4)).toBe(0);
    const at5 = stunned(5);
    expect(at5).toBeGreaterThan(5);
    expect(at5).toBeLessThan(30);
  });
  it('a fixture with no effects does nothing but still costs and cools down', () => {
    const w = world();
    giveSkill(w, fixture({ sp: 5, cooldown: 2, effects: [] }), 2, 1);
    expect(tryCast(w, 2, null)).toBe('ok');
    expect(w.hs.cooldown[2]).toBeGreaterThan(1.9);
    expect(damageEvents(w)).toHaveLength(0);
    void skillMap;
    void still;
  });
});
