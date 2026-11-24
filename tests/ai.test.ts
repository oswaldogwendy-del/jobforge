import { describe, expect, it } from 'vitest';
import { balance as b } from '../src/data/schema';
import { bosses, monsters } from '../src/data/content';
import { targetable } from '../src/sim/combat';
import { Nav, rectArena } from '../src/sim/nav';
import { applyStatus } from '../src/sim/status';
import { monsterStats } from '../src/sim/stats';
import { defaultContent, SimWorld, type Content } from '../src/sim/world';
import { buildFromPreset } from '../src/data/content';
import type { MonsterDef } from '../src/data/types';
import { DT, monsterAt, run, still, world } from './helpers';
import { makeUnit } from '../src/sim/unit';

const dist = (a: { x: number; z: number }, b2: { x: number; z: number }) =>
  Math.hypot(a.x - b2.x, a.z - b2.z);
/** The hero's own auto-attack walks into monsters, so tests that need a fixed hero root it. */
const root = (w: SimWorld) =>
  void applyStatus(b, w.rng, w.hero, 'root', 999, { now: 0, src: 99, power: 0 });
const tele = (w: SimWorld) => w.telegraphs.filter((t) => t.active);

describe('chaser', () => {
  it('ignores the hero beyond its 10 m aggro range and attacks once the hero is inside it', () => {
    const w = world();
    const far = monsterAt(w, 'jellop', 0, 12.5);
    run(w, 2);
    expect(dist(far, { x: 0, z: 12.5 })).toBeLessThan(0.01);
    expect(far.ai!.hasAggro).toBe(false);
    const w2 = world();
    const near = monsterAt(w2, 'jellop', 0, 8);
    const hp = w2.hero.hp;
    run(w2, 6);
    expect(near.ai!.hasAggro).toBe(true);
    expect(w2.hero.hp).toBeLessThan(hp);
  });

  it('leashes 30 m from its spawn, resets, and heals to full', () => {
    const w = world();
    w.nav = new Nav(rectArena(200, 200), []); // the yard is too small to drag a monster 30 m away
    const m = monsterAt(w, 'jellop', 0, 9);
    run(w, 0.5);
    expect(m.ai!.hasAggro).toBe(true);
    m.hp = m.maxHp * 0.3;
    // Drag it far from its spawn point.
    m.x = 0;
    m.z = 9 + 31;
    w.hero.z = m.z - 4;
    w.hero.pz = w.hero.z;
    run(w, 0.3);
    expect(m.ai!.state).toBe('return');
    expect(m.ai!.hasAggro).toBe(false);
    w.hero.z = -20;
    run(w, 25);
    expect(dist(m, { x: 0, z: 9 })).toBeLessThan(2);
    expect(m.hp).toBe(m.maxHp);
  });

  it('a pack spreads out instead of stacking', () => {
    const w = world();
    const pack = [0, 1, 2, 3].map((i) => monsterAt(w, 'jellop', 0.05 * i, 8));
    root(w);
    run(w, 3);
    let min = Infinity;
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) min = Math.min(min, dist(pack[i], pack[j]));
    expect(min).toBeGreaterThan(0.7);
  });

  it('paths around a wall with A* when the straight line is blocked', () => {
    const w = world();
    w.nav = new Nav(rectArena(60, 60), [{ x: 0, z: 0, w: 2, d: 22 }]);
    w.hero.x = 8;
    w.hero.z = 0;
    const m = monsterAt(w, 'hopbun', -6, 0);
    m.maxHp = m.hp = 1e6; // the hero would otherwise kill it before it arrives and hits
    m.ai!.hasAggro = true;
    m.ai!.state = 'chase';
    run(w, 10);
    expect(dist(m, w.hero)).toBeLessThan(4);
    expect(w.hero.hp).toBeLessThan(w.hero.maxHp); // it got there and hit
  });
});

describe('kiter', () => {
  it('keeps 6 to 9 m away and shoots, and backs off when the hero closes in', () => {
    const w = world();
    root(w);
    const m = monsterAt(w, 'buzzwing', 0, 10);
    run(w, 4);
    const d = dist(m, w.hero);
    expect(d).toBeGreaterThan(5.5);
    expect(d).toBeLessThan(10);
    // Hero rushes it: it backs away.
    w.hero.statuses.length = 0;
    root(w);
    w.hero.x = m.x;
    w.hero.z = m.z - 2;
    w.hero.px = w.hero.x;
    w.hero.pz = w.hero.z;
    const before = dist(m, w.hero);
    run(w, 1);
    expect(dist(m, w.hero)).toBeGreaterThan(before + 0.5);
  });
  it('its projectiles hit the hero for damage', () => {
    const w = world();
    root(w);
    monsterAt(w, 'buzzwing', 0, 8);
    const hp = w.hero.hp;
    run(w, 8);
    expect(w.hero.hp).toBeLessThan(hp);
  });
});

describe('caster and telegraphs', () => {
  it('shows a circle telegraph for at least 0.6 s on the hero, then hurts only if the hero stays in it', () => {
    const w = world();
    root(w);
    const m = monsterAt(w, 'capshroom', 0, 8);
    let seen = false;
    let warn = 0;
    let radius = 0;
    for (let i = 0; i < 200 && !seen; i++) {
      w.tick(DT, still);
      const t = tele(w)[0];
      if (t) {
        seen = true;
        warn = t.warn;
        radius = t.radius;
        expect(t.shape).toBe('circle');
        expect(Math.hypot(t.x - w.hero.x, t.z - w.hero.z)).toBeLessThan(1.5);
        expect(t.ownerId).toBe(m.id);
      }
    }
    expect(seen).toBe(true);
    expect(warn).toBeGreaterThanOrEqual(0.6);
    expect(radius).toBe(2.5);
    // Standing still: hit when it resolves.
    const hp = w.hero.hp;
    run(w, 1.2);
    expect(w.hero.hp).toBeLessThan(hp);
    // Dodge: run out of the circle during the warning.
    const w2 = world();
    monsterAt(w2, 'capshroom', 0, 8);
    let started = false;
    for (let i = 0; i < 200 && !started; i++) {
      w2.tick(DT, still);
      started = tele(w2).length > 0;
    }
    const hp2 = w2.hero.hp;
    run(w2, 0.9, { moveX: -1, moveZ: 0, casts: [] });
    for (let i = 0; i < 8; i++) w2.tick(DT, { moveX: -1, moveZ: 0, casts: [] });
    expect(w2.hero.hp).toBe(hp2);
  });

  it('a stun during the warning interrupts the attack and clears the telegraph', () => {
    const w = world();
    root(w);
    const m = monsterAt(w, 'capshroom', 0, 8);
    for (let i = 0; i < 200 && tele(w).length === 0; i++) w.tick(DT, still);
    expect(tele(w)).toHaveLength(1);
    applyStatus(b, w.rng, m, 'stun', 2, { now: w.time, src: 0, power: 0 });
    run(w, 0.2);
    expect(tele(w)).toHaveLength(0);
    const hp = w.hero.hp;
    run(w, 1.5);
    expect(w.hero.hp).toBe(hp);
  });
});

describe('charger (fixture monster)', () => {
  const charger: MonsterDef = {
    id: 'fx_charger',
    name: 'Charger',
    zoneId: 'test',
    race: 'brute',
    element: 'neutral',
    archetype: 'charger',
    model: 'dummy',
    moveSpeed: 4,
    aggroRange: 14,
    packSize: [1, 1],
    cardId: '',
    radius: 0.8,
    attacks: [
      {
        id: 'charge',
        weight: 1,
        cooldown: 5,
        range: 12,
        telegraph: { shape: 'line', at: 'self', length: 10, width: 1.6, warn: 0.9 },
        damage: { atkPct: 1.5 },
      },
    ],
  };
  const content: Content = {
    ...defaultContent,
    monsters: new Map([...defaultContent.monsters, ['fx_charger', charger]]),
  };
  it('shows a line telegraph, then dashes along it and hits the hero once', () => {
    const w = new SimWorld({ build: buildFromPreset('warrior'), seed: 3, mode: 'yard', content });
    for (let i = 0; i < w.units.length; i++) w.units[i] = makeUnit({ id: -1, alive: false });
    const m = w.spawnMonster(charger, 0, 10, 5, {})!;
    let line = null as ReturnType<typeof tele>[number] | null;
    for (let i = 0; i < 300 && !line; i++) {
      w.tick(DT, still);
      line = tele(w).find((t) => t.shape === 'line') ?? null;
    }
    expect(line).not.toBeNull();
    expect(line!.length).toBe(10);
    expect(line!.width).toBe(1.6);
    expect(line!.warn).toBeGreaterThanOrEqual(0.6);
    const z0 = m.z;
    const hp = w.hero.hp;
    run(w, 1.6);
    expect(Math.abs(m.z - z0)).toBeGreaterThan(5); // it dashed
    const lostHp = hp - w.hero.hp;
    expect(lostHp).toBeGreaterThan(0);
    // Standing in the way but leaving the line during the warning avoids it entirely.
    const w2 = new SimWorld({ build: buildFromPreset('warrior'), seed: 3, mode: 'yard', content });
    for (let i = 0; i < w2.units.length; i++) w2.units[i] = makeUnit({ id: -1, alive: false });
    w2.spawnMonster(charger, 0, 10, 5, {});
    for (let i = 0; i < 300 && !tele(w2).some((t) => t.shape === 'line'); i++) w2.tick(DT, still);
    const hp2 = w2.hero.hp;
    for (let i = 0; i < 30; i++) w2.tick(DT, { moveX: 1, moveZ: 0, casts: [] });
    run(w2, 1.5);
    expect(w2.hero.hp).toBe(hp2);
  });
});

describe('burrower (Rootmole)', () => {
  it('hides underground, cannot be targeted, erupts under the hero after a telegraph, then burrows again', () => {
    const w = world();
    const m = monsterAt(w, 'rootmole', 0, 12);
    m.maxHp = m.hp = 1e6;
    root(w);
    expect(m.ai!.state).toBe('hidden');
    expect(targetable(m)).toBe(false);
    expect(w.pickAt(0, 12)).toBeNull();
    // Hero comes within its 8 m aggro: a circle appears under the hero.
    w.hero.z = 6;
    w.hero.pz = 6;
    let circle = null as ReturnType<typeof tele>[number] | null;
    for (let i = 0; i < 120 && !circle; i++) {
      w.tick(DT, still);
      circle = tele(w)[0] ?? null;
    }
    expect(circle).not.toBeNull();
    expect(circle!.radius).toBe(2.2);
    expect(circle!.warn).toBeGreaterThanOrEqual(0.6);
    expect(targetable(m)).toBe(false);
    const hp = w.hero.hp;
    run(w, 1.2);
    expect(w.hero.hp).toBeLessThan(hp); // erupted under a hero who stood still
    expect(targetable(m)).toBe(true);
    expect(dist(m, { x: circle!.x, z: circle!.z })).toBeLessThan(2.5);
    let burrowedAgain = false;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      w.tick(DT, still);
      if (m.ai!.state === 'hidden') burrowedAgain = true;
    }
    expect(burrowedAgain).toBe(true);
  });
});

describe('taunt', () => {
  it('a taunted monster ignores the nearer hero and goes for its taunter', () => {
    const w = world();
    const m = monsterAt(w, 'jellop', 0, 8);
    const decoy = makeUnit({
      id: 900,
      kind: 'summon',
      team: 'player',
      x: 8,
      z: 8,
      hp: 1e6,
      maxHp: 1e6,
    });
    decoy.summon = { ownerId: 0, expires: 1e9, attackCd: 99 };
    decoy.ai = m.ai;
    const slot = w.units.findIndex((u) => u.id < 0);
    w.units[slot] = decoy;
    decoy.ai = { ...m.ai!, archetype: 'chaser' };
    applyStatus(b, w.rng, m, 'taunt', 5, { now: w.time, src: decoy.id, power: 0 });
    m.ai!.hasAggro = true;
    run(w, 3);
    expect(dist(m, decoy)).toBeLessThan(dist(m, w.hero));
  });
});

describe('monster stats and the PRD telegraph rule', () => {
  it('monster HP and ATK follow the Section 13 curves, elites get x8 HP and x1.5 ATK', () => {
    const w = world();
    const j = monsterAt(w, 'jellop', 0, 30, 10);
    expect(j.maxHp).toBeCloseTo(monsterStats(b, 10).hp, 3);
    expect(j.atk).toBeCloseTo(monsterStats(b, 10).atk, 3);
    const g = monsterAt(w, 'thorn_guardian', 0, 40, 10);
    expect(g.elite).toBe(true);
    expect(g.maxHp).toBeCloseTo(monsterStats(b, 10).hp * 8, 3);
    expect(g.atk).toBeCloseTo(monsterStats(b, 10).atk * 1.5, 3);
    expect(g.def).toBeCloseTo(monsterStats(b, 10).def * 1.3, 3);
    const t = monsterAt(w, 'thornling', 0, 50, 10);
    expect(t.maxHp).toBeCloseTo(monsterStats(b, 10).hp * 1.8, 3);
    expect(t.reflectMelee).toBeCloseTo(0.05, 6);
  });
  it('every attack that can deal over 15% of the hero Max HP has a telegraph, at least 0.6 s (bosses 0.8 to 1.8 s)', () => {
    const w = world();
    const heroHp = w.hero.maxHp;
    for (const m of [...monsters, ...bosses]) {
      const level = 'level' in m ? (m as { level: number }).level : 12;
      const s = monsterStats(b, level, { atk: m.mult?.atk ?? 1 });
      for (const a of m.attacks) {
        if (!a.damage) continue;
        const worst = s.atk * a.damage.atkPct * (m.elite ? b.monster.elite.atk : 1);
        if (worst > heroHp * b.monster.telegraphHeavyHpPct && !m.id.startsWith('training')) {
          expect(
            a.telegraph,
            `${m.id}.${a.id} deals ${Math.round(worst)} of ${Math.round(heroHp)} HP`,
          ).toBeDefined();
        }
        if (a.telegraph) {
          expect(a.telegraph.warn).toBeGreaterThanOrEqual(b.monster.telegraphMinWarn);
          if ('level' in m) {
            expect(a.telegraph.warn).toBeGreaterThanOrEqual(0.8);
            expect(a.telegraph.warn).toBeLessThanOrEqual(1.8);
          }
        }
      }
    }
  });
});
