import { describe, expect, it } from 'vitest';
import { buildFromPreset, zones } from '../src/data/content';
import { balance as b } from '../src/data/schema';
import { dist } from '../src/sim/geometry';
import { killUnit } from '../src/sim/combat';
import { eliteAlive } from '../src/sim/spawner';
import { goldForKill, monsterStats } from '../src/sim/stats';
import { SimWorld } from '../src/sim/world';
import { DT, run, still } from './helpers';

const zone = zones[0];
const field = (seed = 11) =>
  new SimWorld({ build: buildFromPreset('warrior'), seed, mode: 'field', zoneId: 'meadowmere' });
/** Keeps the hero out of the way and unhurt while a test watches the spawner. */
const park = (w: SimWorld) => {
  w.godMode = true;
  w.hero.x = w.hero.px = 0;
  w.hero.z = w.hero.pz = 36;
};

describe('Zone 1 field (PRD Section 11)', () => {
  it('is about 80 x 80 m with ten spawn points and obstacles', () => {
    expect(zone.field.size).toEqual([80, 80]);
    expect(zone.field.spawnPoints).toHaveLength(10);
    expect(zone.field.obstacles.length).toBeGreaterThan(10);
    for (const o of zone.field.obstacles) {
      expect(Math.abs(o.x)).toBeLessThanOrEqual(40);
      expect(Math.abs(o.z)).toBeLessThanOrEqual(40);
    }
  });
  it('monster levels climb from 1 at the entrance to 12 at the far side', () => {
    const pts = [...zone.field.spawnPoints].sort((a, c) => c.z - a.z); // entrance is +z
    expect(pts[0].level).toBeLessThanOrEqual(2);
    expect(pts[pts.length - 1].level).toBe(12);
    for (let i = 1; i < pts.length; i++)
      expect(pts[i].level).toBeGreaterThanOrEqual(pts[i - 1].level);
  });
  it('spawn points keep clear of obstacles', () => {
    for (const sp of zone.field.spawnPoints) {
      for (const o of zone.field.obstacles) {
        const d =
          o.r !== undefined
            ? Math.hypot(sp.x - o.x, sp.z - o.z) - o.r
            : Math.hypot(sp.x - o.x, sp.z - o.z) - Math.max(o.w ?? 0, o.d ?? 0) / 2;
        expect(d).toBeGreaterThan(1);
      }
    }
  });
  it('starts with packs of 2 to 5 at their spawn points, never more than 30 alive', () => {
    const w = field();
    park(w);
    expect(w.aliveEnemies()).toBeGreaterThan(8);
    expect(w.aliveEnemies()).toBeLessThanOrEqual(30);
    for (const pack of w.packs) {
      if (pack.members.length === 0) continue;
      expect(pack.members.length).toBeGreaterThanOrEqual(1);
      expect(pack.members.length).toBeLessThanOrEqual(5);
      const sp = zone.field.spawnPoints[pack.spawnIdx];
      for (const id of pack.members) {
        const u = w.unitById(id)!;
        expect(dist(u.x, u.z, sp.x, sp.z)).toBeLessThan(4);
        expect(u.level).toBe(sp.level);
      }
    }
  });
  it('a pack respawns 10 s after it is wiped out, and not before', () => {
    const w = field();
    park(w);
    const pack = w.packs.find((p) => p.members.length >= 2)!;
    const sp = zone.field.spawnPoints[pack.spawnIdx];
    w.hero.z = sp.z + 40; // far away
    w.hero.pz = w.hero.z;
    for (const id of [...pack.members]) killUnit(w, w.unitById(id)!, w.hero);
    run(w, 1);
    expect(pack.clearedAt).not.toBeNull();
    run(w, 8);
    expect(pack.members.every((id) => !w.unitById(id)?.alive)).toBe(true);
    run(w, 2.5);
    expect(pack.members.some((id) => w.unitById(id)?.alive)).toBe(true);
  });
  it('does not respawn a pack on top of the hero', () => {
    const w = field();
    const pack = w.packs.find((p) => p.members.length >= 2)!;
    const sp = zone.field.spawnPoints[pack.spawnIdx];
    w.godMode = true;
    w.hero.x = sp.x;
    w.hero.z = sp.z;
    for (const id of [...pack.members]) killUnit(w, w.unitById(id)!, w.hero);
    run(w, 14);
    expect(pack.members.some((id) => w.unitById(id)?.alive)).toBe(false);
  });
  it('the alive cap of 30 holds through many wipes and respawns', () => {
    const w = field(5);
    park(w);
    let peak = 0;
    for (let s = 0; s < 60; s++) {
      for (const u of w.units)
        if (u.id >= 0 && u.alive && u.team === 'enemy' && s % 3 === 0) killUnit(w, u, w.hero);
      run(w, 1);
      peak = Math.max(peak, w.aliveEnemies());
    }
    expect(peak).toBeLessThanOrEqual(30);
  });
  it('an elite appears about every 150 s, one at a time, at a far spawn point', () => {
    const w = field();
    park(w);
    run(w, 149);
    expect(eliteAlive(w)).toBe(false);
    run(w, 2);
    expect(eliteAlive(w)).toBe(true);
    const elite = w.units.find((u) => u.id >= 0 && u.elite)!;
    const sp = zone.field.spawnPoints.reduce((best, p) =>
      dist(0, 36, p.x, p.z) > dist(0, 36, best.x, best.z) ? p : best,
    );
    expect(dist(elite.x, elite.z, sp.x, sp.z)).toBeLessThan(3);
    expect(elite.maxHp).toBeGreaterThan(monsterStats(b, elite.level).hp * 7);
    run(w, 150);
    expect(w.units.filter((u) => u.id >= 0 && u.alive && u.elite)).toHaveLength(1); // still just the one
  });
});

describe('boss gauge, portal and run totals (PRD Section 3)', () => {
  const normal = (w: SimWorld) => {
    const u = w.units.find((x) => x.id >= 0 && x.alive && x.team === 'enemy' && !x.elite)!;
    killUnit(w, u, w.hero);
  };
  it('the gauge holds 100: a normal kill adds 1 and an elite adds 10', () => {
    const w = field();
    park(w);
    expect(w.run.gauge).toBe(0);
    normal(w);
    expect(w.run.gauge).toBe(1);
    normal(w);
    expect(w.run.gauge).toBe(2);
    const elite = w.spawnMonster(w.content.monsters.get('thorn_guardian')!, 0, 0, 10, {
      elite: true,
    })!;
    killUnit(w, elite, w.hero);
    expect(w.run.gauge).toBe(12);
    expect(w.run.kills).toBe(3);
    expect(w.run.elites).toBe(1);
  });
  it('a full gauge shows a banner and opens a portal; the gauge stays full', () => {
    const w = field();
    park(w);
    w.run.gauge = 99;
    normal(w);
    expect(w.run.gauge).toBe(100);
    expect(w.run.portal).not.toBeNull();
    const events = w.drainEvents();
    expect(events.some((e) => e.t === 'banner' && /Queen stirs/.test(e.text))).toBe(true);
    expect(events.some((e) => e.t === 'portal')).toBe(true);
    normal(w);
    expect(w.run.gauge).toBe(100);
    expect(dist(w.run.portal!.x, w.run.portal!.z, w.hero.x, w.hero.z)).toBeLessThan(6);
  });
  it('walking into the portal loads the boss arena with the intro name card', () => {
    const w = field();
    park(w);
    w.run.gauge = 99;
    normal(w);
    w.hero.x = w.run.portal!.x;
    w.hero.z = w.run.portal!.z;
    w.tick(DT, still);
    expect(w.mode).toBe('boss');
    expect(w.run.phase).toBe('intro');
    expect(w.boss).not.toBeNull();
    expect(w.drainEvents().some((e) => e.t === 'bossIntro' && e.name === 'Queen Gelatina')).toBe(
      true,
    );
    // The fight does not start until the 2 s card is done (or skipped).
    const hp = w.hero.hp;
    run(w, 1);
    expect(w.run.phase).toBe('intro');
    run(w, 1.2);
    expect(w.run.phase).toBe('boss');
    expect(w.hero.hp).toBe(hp);
    w.skipIntro();
  });
  it('kills give gold and EXP by the PRD formulas, elites 8x', () => {
    const w = field();
    park(w);
    const u = w.spawnMonster(w.content.monsters.get('jellop')!, 0, 0, 10, {})!;
    killUnit(w, u, w.hero);
    expect(w.run.gold).toBeGreaterThan(goldForKill(b, 10) * 0.79);
    expect(w.run.gold).toBeLessThan(goldForKill(b, 10) * 1.21);
    const exp1 = w.run.exp;
    expect(exp1).toBeGreaterThan(0);
    const e = w.spawnMonster(w.content.monsters.get('jellop')!, 0, 0, 10, { elite: true })!;
    killUnit(w, e, w.hero);
    expect(w.run.exp - exp1).toBeCloseTo(exp1 * 8, 3);
  });
});

describe('death and leaving a run (PRD Section 10)', () => {
  it('dying ends the run, keeps loot and EXP, and returns to town via the results', () => {
    const w = field();
    park(w);
    run(w, 1);
    w.godMode = false;
    const u = w.units.find((x) => x.id >= 0 && x.alive)!;
    killUnit(w, u, w.hero);
    killUnit(
      w,
      w.units.find((x) => x.id >= 0 && x.alive)!,
      w.hero,
    );
    const kills = w.run.kills;
    const gold = w.run.gold;
    const exp = w.run.exp;
    killUnit(w, w.hero, u);
    expect(w.hero.alive).toBe(false);
    expect(w.run.phase).toBe('ended');
    const r = w.run.result!;
    expect(r.outcome).toBe('death');
    expect(r.kills).toBe(kills);
    expect(r.gold).toBe(Math.round(gold));
    expect(r.exp).toBe(Math.round(exp));
    expect(r.bossDefeated).toBe(false);
    expect(w.drainEvents().some((e) => e.t === 'died')).toBe(true);
    // Nothing fights after the run ends: the run clock stops.
    const elapsed = w.run.elapsed;
    run(w, 2);
    expect(w.run.elapsed).toBe(elapsed);
  });
  it('leaving a run from the pause menu keeps loot', () => {
    const w = field();
    park(w);
    killUnit(
      w,
      w.units.find((x) => x.id >= 0 && x.alive)!,
      w.hero,
    );
    w.leaveRun();
    expect(w.run.phase).toBe('ended');
    expect(w.run.result!.outcome).toBe('left');
    expect(w.run.result!.kills).toBe(1);
  });
  it('the run timer counts the time spent', () => {
    const w = field();
    park(w);
    run(w, 5);
    expect(w.run.elapsed).toBeCloseTo(5, 1);
    expect(w.run.result).toBeNull();
  });
  it('the same seed gives the same run', () => {
    const a = field(21);
    const c = field(21);
    for (let i = 0; i < 300; i++) {
      a.tick(DT, still);
      c.tick(DT, still);
    }
    expect(a.units.filter((u) => u.id >= 0).map((u) => [u.defId, Math.round(u.x * 100)])).toEqual(
      c.units.filter((u) => u.id >= 0).map((u) => [u.defId, Math.round(u.x * 100)]),
    );
  });
});
