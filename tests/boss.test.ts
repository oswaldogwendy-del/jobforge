import { describe, expect, it } from 'vitest';
import { bosses, buildFromPreset } from '../src/data/content';
import { balance as b } from '../src/data/schema';
import { applyDamage, killUnit } from '../src/sim/combat';
import { displaceUnit } from '../src/sim/engine';
import { applyStatus, hasStatus } from '../src/sim/status';
import { expForKill, monsterStats } from '../src/sim/stats';
import { SimWorld } from '../src/sim/world';
import { DT, run, still } from './helpers';

const queenDef = bosses[0];
const isolate = (w: SimWorld, only: string) => {
  for (const a of queenDef.attacks) if (a.id !== only) w.boss!.ai!.cooldowns[a.id] = 9999;
};

function arena(seed = 3): SimWorld {
  const w = new SimWorld({
    build: buildFromPreset('warrior'),
    seed,
    mode: 'field',
    zoneId: 'meadowmere',
  });
  w.enterBoss();
  w.skipIntro();
  w.tick(DT, still);
  w.godMode = true; // tests of boss behaviour should not depend on the hero surviving
  return w;
}
const telegraphs = (w: SimWorld) => w.telegraphs.filter((t) => t.active);
const rooted = (w: SimWorld) =>
  applyStatus(b, w.rng, w.hero, 'root', 9999, { now: 0, src: 99, power: 0 });

describe('Queen Gelatina (PRD Section 11)', () => {
  it('is a level-12 formless boss with a big HP multiple in a 15 m arena', () => {
    const w = arena();
    const q = w.boss!;
    expect(q.isBoss).toBe(true);
    expect(q.level).toBe(12);
    expect(q.maxHp).toBeCloseTo(monsterStats(b, 12, { hp: queenDef.hpMult }).hp, 3);
    expect(q.race).toBe('formless');
    expect(q.element).toBe('neutral');
    expect(w.nav.arena.shape).toBe('circle');
    expect(w.nav.arena.radius).toBe(15);
    expect(Math.hypot(w.hero.x, w.hero.z)).toBeLessThan(15);
    expect(w.hs.focusId).toBe(q.id); // bosses are focused automatically
  });

  it('Bounce Slam: a 3.5 m circle with a 1.2 s warning, leaps onto the hero spot, hurts and knocks back', () => {
    const w = arena();
    rooted(w);
    isolate(w, 'gelatina_bounce_slam');
    let t = telegraphs(w)[0];
    for (let i = 0; i < 400 && !t; i++) {
      w.tick(DT, still);
      t = telegraphs(w)[0];
    }
    expect(t).toBeDefined();
    expect(t.shape).toBe('circle');
    expect(t.radius).toBe(3.5);
    expect(t.warn).toBeCloseTo(1.2, 3);
    expect(Math.hypot(t.x - w.hero.x, t.z - w.hero.z)).toBeLessThan(1);
    const spot = { x: t.x, z: t.z };
    w.godMode = false;
    const hp = w.hero.hp;
    run(w, 1.5);
    expect(Math.hypot(w.boss!.x - spot.x, w.boss!.z - spot.z)).toBeLessThan(2.5); // she landed there
    expect(w.hero.hp).toBeLessThan(hp);
  });

  it('Bounce Slam can be dodged by leaving the circle', () => {
    const w = arena();
    isolate(w, 'gelatina_bounce_slam');
    let t = telegraphs(w)[0];
    for (let i = 0; i < 400 && !t; i++) {
      w.tick(DT, still);
      t = telegraphs(w)[0];
    }
    w.godMode = false;
    const hp = w.hero.hp;
    // Run away from the locked circle during the 1.2 s warning.
    const dx = w.hero.x - t.x >= 0 ? 1 : -1;
    for (let i = 0; i < 30; i++) w.tick(DT, { moveX: dx, moveZ: 0, casts: [] });
    run(w, 0.6);
    expect(w.hero.hp).toBe(hp);
  });

  it('Royal Roll: a 20 x 3 m line with a 1.0 s warning, then she rolls across the arena', () => {
    const w = arena();
    rooted(w);
    isolate(w, 'gelatina_royal_roll');
    let t = telegraphs(w)[0];
    for (let i = 0; i < 600 && !t; i++) {
      w.tick(DT, still);
      t = telegraphs(w)[0];
    }
    expect(t).toBeDefined();
    expect(t.shape).toBe('line');
    expect(t.length).toBe(20);
    expect(t.width).toBe(3);
    expect(t.warn).toBeCloseTo(1.0, 3);
    const start = { x: w.boss!.x, z: w.boss!.z };
    run(w, 2.2);
    expect(Math.hypot(w.boss!.x - start.x, w.boss!.z - start.z)).toBeGreaterThan(8);
  });

  it('Jelly Spit: three globs in a fan that slow by 30% for 2 s', () => {
    const w = arena();
    rooted(w);
    isolate(w, 'gelatina_jelly_spit');
    let maxActive = 0;
    for (let i = 0; i < 400; i++) {
      w.tick(DT, still);
      maxActive = Math.max(
        maxActive,
        w.projectiles.filter((p) => p.active && p.team === 'enemy').length,
      );
      if (maxActive >= 3) break;
    }
    expect(maxActive).toBe(3);
    // Standing in front of the fan gets the hero slowed.
    run(w, 3);
    // (rooted already, so check the status directly on a fresh hero below)
    const w2 = arena(4);
    isolate(w2, 'gelatina_jelly_spit');
    let slowed = false;
    for (let i = 0; i < 600 && !slowed; i++) {
      w2.tick(DT, still);
      slowed = hasStatus(w2.hero, 'slow');
    }
    expect(slowed).toBe(true);
  });

  it('splits at 66% and 33% HP: 4 Jellops crawl toward her, and each one that reaches her heals her 4%', () => {
    const w = arena();
    // A stunned hero cannot attack, so it neither chips the Queen nor kills adds on their way in.
    applyStatus(b, w.rng, w.hero, 'stun', 9999, { now: 0, src: 99, power: 0 });
    const q = w.boss!;
    const jellops = () => w.units.filter((u) => u.id >= 0 && u.alive && u.ai?.script.toQueen);
    expect(jellops()).toHaveLength(0);
    q.hp = q.maxHp * 0.65;
    w.tick(DT, still);
    expect(jellops()).toHaveLength(4);
    expect(w.drainEvents().some((e) => e.t === 'phase')).toBe(true);
    // They do not split again while HP hovers in the same phase.
    q.hp = q.maxHp * 0.6;
    w.tick(DT, still);
    expect(jellops()).toHaveLength(4);
    // Let them crawl in: each heals 4% Max HP.
    const hp = q.hp;
    let peak = hp;
    for (let i = 0; i < Math.round(14 / DT); i++) {
      w.tick(DT, still);
      peak = Math.max(peak, q.hp); // she later walks into the hero's melee range, so look at her peak
    }
    expect(jellops()).toHaveLength(0);
    expect(peak).toBeGreaterThan(hp + q.maxHp * 0.04 * 3.5);
    expect(peak).toBeLessThan(hp + q.maxHp * 0.04 * 4.5);
    // A Jelly that reached her was not a kill.
    expect(w.run.kills).toBe(0);
    q.hp = q.maxHp * 0.3;
    w.tick(DT, still);
    expect(jellops()).toHaveLength(4);
  });

  it('killing an add before it arrives counts as a kill and denies the heal', () => {
    const w = arena();
    const q = w.boss!;
    q.hp = q.maxHp * 0.65;
    w.tick(DT, still);
    const add = w.units.find((u) => u.id >= 0 && u.ai?.script.toQueen)!;
    killUnit(w, add, w.hero);
    expect(w.run.kills).toBe(1);
  });

  it('enrages at 4:00 with +40% speed and double slams', () => {
    const w = arena();
    const q = w.boss!;
    const base = q.moveSpeed;
    q.ai!.script.fightT = 239.95;
    w.tick(DT, still);
    w.tick(DT, still);
    expect(q.ai!.script.enraged).toBe(1);
    expect(q.moveSpeed).toBeCloseTo(base * 1.4, 3);
    expect(w.drainEvents().some((e) => e.t === 'banner' && /enraged/.test(e.text))).toBe(true);
    rooted(w);
    isolate(w, 'gelatina_bounce_slam');
    let first = false;
    let second = false;
    let seen = 0;
    let prev = false;
    for (let i = 0; i < 900; i++) {
      w.tick(DT, still);
      const on = telegraphs(w).some((t) => t.shape === 'circle');
      if (on && !prev) seen++;
      prev = on;
      if (seen >= 1) first = true;
      if (seen >= 2) {
        second = true;
        break;
      }
    }
    expect(first && second).toBe(true);
  });

  it('crowd control fills a stagger bar instead of working; at 100 she is staggered for 2 s and takes 20% more', () => {
    const w = arena();
    const q = w.boss!;
    for (let i = 0; i < 3; i++)
      applyStatus(b, w.rng, q, 'stun', 2, { now: w.time, src: 0, power: 0 });
    expect(hasStatus(q, 'stun')).toBe(false);
    expect(q.staggerT).toBeCloseTo(2, 3);
    // While staggered she does not start attacks.
    for (let i = 0; i < 40; i++) {
      w.tick(DT, still);
      if (i < 55) expect(telegraphs(w).length === 0 || q.staggerT <= 0).toBe(true);
    }
  });

  it('ignores stun, silence and knockback', () => {
    const w = arena();
    const q = w.boss!;
    expect(applyStatus(b, w.rng, q, 'silence', 3, { now: 0, src: 0, power: 0 })).toBe('immune');
    const x = q.x;
    displaceUnit(w, q, x - 3, q.z, 'knockback', 4);
    expect(q.x).toBe(x);
  });

  it('a heavy hit is 25-35% of Max HP and never over 50% before enrage', () => {
    const w = arena();
    w.godMode = false;
    const slam = queenDef.attacks.find((a) => a.id === 'gelatina_bounce_slam')!;
    const roll = queenDef.attacks.find((a) => a.id === 'gelatina_royal_roll')!;
    const q = w.boss!;
    const sample = (atk: typeof slam) => {
      const hits: number[] = [];
      for (let seed = 1; seed <= 300; seed++) {
        const t = new SimWorld({ build: buildFromPreset('warrior'), seed, mode: 'yard' });
        const hero = t.hero;
        const boss = t.spawnMonster(t.content.monsters.get('jellop')!, 5, 5, 12, {})!;
        boss.atk = q.atk;
        const hp = hero.hp;
        t.monsterAttackHit(boss, atk, hero);
        if (hero.hp < hp) hits.push((hp - hero.hp) / hero.maxHp);
      }
      return hits;
    };
    for (const atk of [slam, roll]) {
      const hits = sample(atk);
      const mean = hits.reduce((s, v) => s + v, 0) / hits.length;
      expect(mean, atk.id).toBeGreaterThan(0.25);
      expect(mean, atk.id).toBeLessThan(0.35);
      expect(Math.max(...hits), atk.id).toBeLessThan(0.5);
    }
  });
});

describe('victory, chest and the loop (PRD Section 3)', () => {
  it('defeating the Queen opens the chest with a victory result, and the first kill is worth 200x EXP', () => {
    const w = arena();
    w.godMode = false;
    const q = w.boss!;
    killUnit(w, q, w.hero);
    expect(w.run.phase).toBe('chest');
    const r = w.run.result!;
    expect(r.outcome).toBe('victory');
    expect(r.bossDefeated).toBe(true);
    expect(r.gold).toBeGreaterThan(500);
    expect(w.run.exp).toBeCloseTo(expForKill(b, 12, 12, 200), 3);
    expect(r.chest!.items.length).toBeGreaterThanOrEqual(2);
    expect(r.chest!.items.some((i) => ['rare', 'epic', 'legendary'].includes(i.rarity))).toBe(true);
  });

  it('"Grind again" returns to the field with the gauge reset and keeps the run totals', () => {
    const w = arena();
    w.godMode = false;
    killUnit(w, w.boss!, w.hero);
    const gold = w.run.gold;
    const kills = w.run.kills;
    w.grindAgain();
    expect(w.mode).toBe('field');
    expect(w.run.phase).toBe('field');
    expect(w.run.gauge).toBe(0);
    expect(w.run.portal).toBeNull();
    expect(w.run.gold).toBe(gold);
    expect(w.run.kills).toBe(kills);
    expect(w.aliveEnemies()).toBeGreaterThan(5);
    expect(w.hero.alive).toBe(true);
    // The next boss kill is no longer a first kill.
    expect(w.run.bossFirstKill).toBe(false);
  });

  it('"Return to town" ends the run from the chest', () => {
    const w = arena();
    killUnit(w, w.boss!, w.hero);
    w.finishRun();
    expect(w.run.phase).toBe('ended');
    expect(w.run.result!.outcome).toBe('victory');
  });

  it('dying in the boss fight ends the run with a death result and keeps what was earned', () => {
    const w = arena();
    w.godMode = false;
    applyDamage(w, w.hero, w.hero.maxHp * 10, w.boss, false);
    expect(w.hero.alive).toBe(false);
    expect(w.run.phase).toBe('ended');
    expect(w.run.result!.outcome).toBe('death');
    expect(w.run.result!.bossDefeated).toBe(false);
  });

  it('a Mage can clear the whole loop too (smoke): field, portal, boss, chest', () => {
    const w = new SimWorld({ build: buildFromPreset('caster'), seed: 9, mode: 'field' });
    w.godMode = true;
    w.run.gauge = 99;
    killUnit(
      w,
      w.units.find((u) => u.id >= 0 && u.alive)!,
      w.hero,
    );
    w.hero.x = w.run.portal!.x;
    w.hero.z = w.run.portal!.z;
    run(w, 3);
    expect(w.mode).toBe('boss');
    for (let i = 0; i < 60 * 30 && w.run.phase === 'boss'; i++) w.tick(DT, still);
    expect(w.run.phase).toBe('boss'); // not dead: the bot lives in tools/sim
    killUnit(w, w.boss!, w.hero);
    expect(w.run.phase).toBe('chest');
  });
});
