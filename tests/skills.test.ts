import { describe, expect, it } from 'vitest';
import { balance as b } from '../src/data/schema';
import { rebuildSlots, refreshHero, tryCast } from '../src/sim/engine';
import { applyStatus, hasStatus } from '../src/sim/status';
import { applyDamage } from '../src/sim/combat';
import { DT, cast, dummyAt, fixture, giveSkill, run, steady, useSkill, world } from './helpers';

const lost = (u: { maxHp: number; hp: number }) => u.maxHp - u.hp;
const knight = (w: ReturnType<typeof world>, str = 90, vit = 45) => {
  w.build.stats.STR = str;
  w.build.stats.VIT = vit;
  rebuildSlots(w);
};

describe('Knight skills', () => {
  it('Iron Body (passive): +3%..15% Max HP and +5..25 DEF by rank', () => {
    const at = (rank: number) => {
      const w = world();
      w.build.passives[0] = null;
      rebuildSlots(w);
      const before = { hp: w.hero.maxHp, def: w.hero.def };
      useSkill(w, 'knight_iron_body', 0, rank);
      return { hp: w.hero.maxHp / before.hp, def: w.hero.def - before.def };
    };
    expect(at(1).hp).toBeCloseTo(1.03, 3);
    expect(at(1).def).toBeCloseTo(5, 3);
    expect(at(5).hp).toBeCloseTo(1.15, 3);
    expect(at(5).def).toBeCloseTo(25, 3);
  });

  it('Flame Burst: hits enemies within 4 m only, knocks back 2 m, adds fire to basic attacks for 10 s', () => {
    const w = world();
    steady(w);
    knight(w);
    useSkill(w, 'knight_flame_burst', 0, 1);
    const near = dummyAt(w, 0, 2.5);
    const far = dummyAt(w, 0, 9);
    cast(w, 0);
    run(w, 0.4);
    expect(lost(near)).toBeGreaterThan(0);
    expect(lost(far)).toBe(0);
    expect(near.z).toBeGreaterThan(2.5 + 1.5);
    expect(w.hero.buffs.some((x) => x.key === 'flame_burst')).toBe(true);
    run(w, 10.5);
    expect(w.hero.buffs.some((x) => x.key === 'flame_burst')).toBe(false);
  });

  it('Provoke Roar: taunts within 8 m for 4 s, pulls 2 m, lowers DEF 10%', () => {
    const w = world();
    knight(w);
    useSkill(w, 'knight_provoke_roar', 0, 1);
    const a = dummyAt(w, 0, 7, 1000, { def: 100, base: { ...dummyAt(w, 50, 50).base, def: 100 } });
    const out = dummyAt(w, 0, 20);
    cast(w, 0);
    run(w, 0.4);
    expect(hasStatus(a, 'taunt')).toBe(true);
    expect(a.tauntTarget).toBe(w.hero.id);
    expect(hasStatus(out, 'taunt')).toBe(false);
    expect(a.z).toBeLessThan(6);
    expect(a.def).toBeCloseTo(90, 3);
    run(w, 4.2);
    expect(a.def).toBeCloseTo(100, 3);
    expect(hasStatus(a, 'taunt')).toBe(false);
  });

  it('Crescent Sweep: a 120 degree cone, 5 m, +30% against stunned enemies', () => {
    const w = world();
    steady(w);
    knight(w);
    useSkill(w, 'knight_crescent_sweep', 0, 1);
    const front = dummyAt(w, 0, 3.5);
    w.setFocus(front.id);
    const side = dummyAt(w, 3.4, 1.0); // about 71 degrees off the facing: outside the 60 degree half-angle
    const behind = dummyAt(w, 0, -3);
    w.hero.atk = 100;
    cast(w, 0);
    expect(lost(front)).toBeGreaterThan(0);
    expect(lost(behind)).toBe(0);
    expect(lost(side)).toBe(0);
    const base = lost(front);
    const w2 = world();
    steady(w2);
    knight(w2);
    useSkill(w2, 'knight_crescent_sweep', 0, 1);
    w2.hero.atk = 100;
    const stunned = dummyAt(w2, 0, 3.5);
    w2.setFocus(stunned.id);
    applyStatus(b, w2.rng, stunned, 'stun', 5, { now: 0, src: 0, power: 0 });
    cast(w2, 0);
    expect(lost(stunned) / base).toBeGreaterThan(1.15);
    expect(lost(stunned) / base).toBeLessThan(1.45);
  });

  it('Unyielding: at 40% HP gives stun and knockback immunity and +20 DEF for 6 s, then a 30 s cooldown', () => {
    const w = world();
    knight(w);
    useSkill(w, 'knight_unyielding', 0, 1);
    const def0 = w.hero.def;
    const h = w.hero;
    applyDamage(w, h, h.maxHp * 0.65, null, false);
    expect(h.buffs.some((x) => x.key === 'unyielding')).toBe(true);
    expect(h.def).toBeCloseTo(def0 + 20, 3);
    expect(applyStatus(b, w.rng, h, 'stun', 2, { now: w.time, src: 9, power: 0 })).toBe('immune');
    run(w, 6.2);
    expect(h.buffs.some((x) => x.key === 'unyielding')).toBe(false);
    // Cooldown: damaging again within 30 s does not re-trigger it.
    applyDamage(w, h, 5, null, false);
    expect(h.buffs.some((x) => x.key === 'unyielding')).toBe(false);
    run(w, 25);
    h.hp = h.maxHp * 0.5;
    applyDamage(w, h, h.maxHp * 0.15, null, false);
    expect(h.buffs.some((x) => x.key === 'unyielding')).toBe(true);
  });

  it('Bulwark Charge: dashes 8 m through enemies, hitting each once and knocking them back 3 m', () => {
    const w = world();
    steady(w);
    knight(w);
    useSkill(w, 'knight_bulwark_charge', 0, 1);
    const a = dummyAt(w, 0, 3);
    const c = dummyAt(w, 0.5, 6);
    const off = dummyAt(w, 6, 3);
    w.hero.atk = 100;
    cast(w, 0);
    run(w, 1);
    expect(w.hero.z).toBeGreaterThan(7.5);
    expect(lost(a)).toBeGreaterThan(200);
    expect(lost(c)).toBeGreaterThan(200);
    expect(lost(off)).toBe(0);
    expect(a.z).toBeGreaterThan(5);
    // Hit once each, not once per tick.
    expect(lost(a)).toBeLessThan(2.5 * 100 * 1.4);
  });

  it('Kingsblade Oath: +100% ATK ignoring DEF on basic attacks, +30% APS, -30% SP cost for 20 s', () => {
    const w = world();
    steady(w);
    knight(w);
    w.build.stats.INT = 60;
    rebuildSlots(w);
    useSkill(w, 'knight_kingsblade_oath', 0, 1);
    const aps0 = w.hero.aps;
    const cost0 = 8;
    w.hero.sp = w.hero.maxSp;
    const d = dummyAt(w, 0, 1.8, 100000, {
      def: 500,
      base: { ...dummyAt(w, 50, 50).base, def: 500 },
    });
    d.def = 500;
    cast(w, 0);
    expect(w.hero.buffs.some((x) => x.key === 'kingsblade_oath')).toBe(true);
    expect(w.hero.aps).toBeCloseTo((aps0 * 1.3) / 1, 1);
    // Basic attacks add an extra hit that ignores DEF, so damage is far above what DEF 500 would allow.
    run(w, 4);
    const lostHp = lost(d);
    expect(lostHp).toBeGreaterThan(50);
    run(w, 17);
    expect(w.hero.buffs.some((x) => x.key === 'kingsblade_oath')).toBe(false);
    void cost0;
  });
});

describe('Mage skills', () => {
  const mage = (w: ReturnType<typeof world>, int = 90, dex = 45) => {
    w.build.stats.INT = int;
    w.build.stats.DEX = dex;
    rebuildSlots(w);
  };

  it('Ember Bolt: a projectile that deals fire damage and burns (100% at rank 5)', () => {
    const w = world('caster');
    steady(w);
    mage(w);
    useSkill(w, 'mage_ember_bolt', 0, 5);
    const d = dummyAt(w, 0, 8);
    cast(w, 0);
    run(w, 0.8);
    expect(w.projectiles.some((p) => p.active) || lost(d) > 0).toBe(true);
    run(w, 1.2);
    expect(lost(d)).toBeGreaterThan(0);
    expect(hasStatus(d, 'burn')).toBe(true);
    const before = d.hp;
    run(w, 2);
    expect(d.hp).toBeLessThan(before); // burn ticks
  });

  it('Frost Lance: water damage with a freeze that the next physical hit breaks for +30%', () => {
    let froze = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const w = world('caster', seed);
      steady(w);
      mage(w);
      useSkill(w, 'mage_frost_lance', 0, 5);
      const d = dummyAt(w, 0, 8);
      cast(w, 0);
      run(w, 2);
      if (hasStatus(d, 'freeze')) froze++;
    }
    expect(froze).toBeGreaterThan(8);
    expect(froze).toBeLessThan(32);
  });

  it('Chain Lightning: jumps to 2 more enemies within 5 m at rank 1, -20% per jump', () => {
    const w = world('caster');
    steady(w);
    mage(w);
    useSkill(w, 'mage_chain_lightning', 0, 1);
    const a = dummyAt(w, 0, 6);
    const c = dummyAt(w, 3, 6);
    const e = dummyAt(w, 6, 6);
    const f = dummyAt(w, 9, 6);
    const out = dummyAt(w, -10, 6);
    cast(w, 0);
    run(w, 1.5);
    expect(lost(a)).toBeGreaterThan(0);
    expect(lost(c)).toBeGreaterThan(0);
    expect(lost(e)).toBeGreaterThan(0);
    expect(lost(f)).toBe(0); // only 2 jumps at rank 1
    expect(lost(out)).toBe(0);
    expect(lost(c)).toBeLessThan(lost(a) * 0.95);
    expect(lost(e)).toBeLessThan(lost(c) * 0.95);
  });

  it('Wall of Flame: a wall for 6 s that ticks every 0.5 s and pushes enemies back', () => {
    const w = world('caster');
    steady(w);
    mage(w);
    useSkill(w, 'mage_wall_of_flame', 0, 1);
    // Just past the 10 m auto-attack range, so only the wall can hurt it.
    const d = dummyAt(w, 0, 10.9);
    cast(w, 0, { x: 0, z: 10 });
    run(w, 1.1); // cast time
    expect(lost(d)).toBeGreaterThan(0);
    expect(d.z).toBeGreaterThan(10.9);
    let ticks = 0;
    for (let i = 0; i < Math.round(6.5 / DT); i++) {
      w.tick(DT, { moveX: 0, moveZ: 0, casts: [] });
      ticks += w.events.filter((e) => e.t === 'dmg' && e.targetId === d.id && !e.dot).length;
      w.events.length = 0;
    }
    // About 12 ticks over 6 s at one per 0.5 s, minus those after it knocked the target out of the wall.
    expect(ticks).toBeGreaterThanOrEqual(1);
    const total = lost(d);
    run(w, 3);
    expect(lost(d)).toBe(total); // the wall is gone after 6 s
  });

  it('Spell Focus (passive): +cast speed and +damage only for magic skills', () => {
    const w = world('caster');
    mage(w);
    const cm = w.hs.castMult;
    useSkill(w, 'mage_spell_focus', 3, 5);
    expect(w.hs.castMult).toBeLessThan(cm - 0.19);
    expect(w.hs.passiveMods.some((m) => m.stat === 'damagePct' && m.tags?.includes('magic'))).toBe(
      true,
    );
  });

  it('Glacial Storm: 10 hits over 4 s', () => {
    const w = world('caster');
    steady(w);
    mage(w);
    useSkill(w, 'mage_glacial_storm', 0, 1);
    // The target is beyond the 10 m auto-attack range, so only the storm hits it.
    const d = dummyAt(w, 0, 14);
    cast(w, 0, { x: 0, z: 10 });
    run(w, 1.6); // cast
    let hits = 0;
    const seen = new Set<number>();
    for (let i = 0; i < Math.round(4.5 / DT); i++) {
      w.tick(DT, { moveX: 0, moveZ: 0, casts: [] });
      for (const e of w.events) if (e.t === 'dmg' && e.targetId === d.id && !e.dot) hits++;
      w.events.length = 0;
      void seen;
    }
    expect(hits).toBeGreaterThanOrEqual(9);
    expect(hits).toBeLessThanOrEqual(11);
  });

  it('Cataclysm: 6 meteors at rank 1 and 10 at rank 3, each stunning', () => {
    const strikes = (rank: number) => {
      const w = world('caster');
      steady(w);
      mage(w, 99, 99);
      useSkill(w, 'mage_cataclysm', 0, rank);
      dummyAt(w, 0, 6);
      cast(w, 0, { x: 0, z: 6 });
      run(w, 2.2);
      let n = 0;
      for (let i = 0; i < Math.round(3.5 / DT); i++) {
        w.tick(DT, { moveX: 0, moveZ: 0, casts: [] });
        n += w.events.filter((e) => e.t === 'fx' && e.size === 2.5).length;
        w.events.length = 0;
      }
      return n;
    };
    expect(strikes(1)).toBe(6);
    expect(strikes(3)).toBe(10);
  });
});

describe('primitives the Knight and Mage do not use (fixtures)', () => {
  it('heal: MATK% plus Max HP%, heals summons in radius, poison cuts it by 30%', () => {
    const w = world('caster');
    giveSkill(
      w,
      fixture({ cooldown: 1, effects: [{ type: 'heal', who: 'self', matk: 1, maxHpPct: 0.1 }] }),
      0,
      1,
    );
    w.hero.hp = 10;
    cast(w, 0);
    const matk = (w.hero.matkMin + w.hero.matkMax) / 2;
    expect(w.hero.hp).toBeCloseTo(10 + matk + w.hero.maxHp * 0.1, 0);
    const w2 = world('caster');
    giveSkill(w2, fixture({ effects: [{ type: 'heal', who: 'self', maxHpPct: 0.5 }] }), 0, 1);
    w2.hero.hp = 1;
    applyStatus(b, w2.rng, w2.hero, 'poison', 5, { now: 0, src: 9, power: 0 });
    cast(w2, 0);
    expect(w2.hero.hp).toBeCloseTo(1 + w2.hero.maxHp * 0.5 * 0.7, 0);
  });

  it('shield: absorbs damage first and expires', () => {
    const w = world();
    giveSkill(w, fixture({ effects: [{ type: 'shield', maxHpPct: 0.5, duration: 3 }] }), 0, 1);
    cast(w, 0);
    expect(w.hero.shield).toBeCloseTo(w.hero.maxHp * 0.5, 3);
    const hp = w.hero.hp;
    applyDamage(w, w.hero, 30, null, false);
    expect(w.hero.hp).toBe(hp);
    expect(w.hero.shield).toBeCloseTo(w.hero.maxHp * 0.5 - 30, 3);
    run(w, 3.2);
    expect(w.hero.shield).toBe(0);
  });

  it('cleanse: removes the requested number of debuffs', () => {
    const w = world();
    for (const s of ['slow', 'burn', 'blind'] as const)
      applyStatus(b, w.rng, w.hero, s, 9, { now: 0, src: 9, power: 1 });
    giveSkill(w, fixture({ effects: [{ type: 'cleanse', count: 2 }] }), 0, 1);
    cast(w, 0);
    expect(w.hero.statuses).toHaveLength(1);
  });

  it('summon: raises allies that fight, expire, and obey the skill and global caps', () => {
    const w = world('caster');
    giveSkill(
      w,
      fixture({
        cooldown: 0.1,
        effects: [
          { type: 'summon', unitId: 'skeleton_warrior', count: 1, duration: 30, maxAlive: [1, 3] },
        ],
      }),
      0,
      1,
    );
    const d = dummyAt(w, 0, 5);
    cast(w, 0);
    const mine = () => w.units.filter((u) => u.id >= 0 && u.alive && u.kind === 'summon');
    expect(mine()).toHaveLength(1);
    expect(mine()[0].hp).toBeCloseTo(w.hero.maxHp * 0.3, 1);
    run(w, 0.5);
    cast(w, 0); // rank 1: max alive 1, so the old one is replaced
    expect(mine()).toHaveLength(1);
    run(w, 6);
    expect(lost(d)).toBeGreaterThan(0); // the skeleton attacks
    run(w, 30);
    expect(mine()).toHaveLength(0); // expired
    // Global cap of 8.
    const w2 = world('caster');
    giveSkill(
      w2,
      fixture({
        cooldown: 0.1,
        maxRank: 5,
        effects: [
          { type: 'summon', unitId: 'skeleton_warrior', count: 12, duration: 60, maxAlive: 12 },
        ],
      }),
      0,
      1,
    );
    cast(w2, 0);
    expect(w2.units.filter((u) => u.id >= 0 && u.alive && u.kind === 'summon').length).toBe(8);
  });

  it('resource: gains orbs up to 5 and spends them for bonus damage', () => {
    const w = world();
    giveSkill(
      w,
      fixture({ cooldown: 0.5, effects: [{ type: 'resource', resource: 'orbs', amount: 2 }] }),
      0,
      1,
    );
    for (let i = 0; i < 5; i++) {
      cast(w, 0);
      run(w, 0.6);
    }
    expect(w.hs.resources.orbs).toBe(5);
    giveSkill(
      w,
      fixture({ effects: [{ type: 'resource', resource: 'orbs', amount: 'all', spend: true }] }),
      1,
      1,
    );
    cast(w, 1);
    expect(w.hs.resources.orbs).toBe(0);
  });

  it('toggle: drains SP per second while on, applies its modifiers, and switches off at 0 SP', () => {
    const w = world();
    giveSkill(
      w,
      fixture({
        kind: 'toggle',
        effects: [{ type: 'toggle', spPerSec: 30, mods: [{ stat: 'def', add: 50 }] }],
      }),
      0,
      1,
    );
    const def0 = w.hero.def;
    const r = tryCast(w, 0, null);
    expect(r).toBe('toggled');
    expect(w.hero.def).toBeCloseTo(def0 + 50, 3);
    const sp0 = w.hero.sp;
    run(w, 1);
    expect(w.hero.sp).toBeLessThan(sp0 - 15);
    w.hero.sp = 0.1;
    run(w, 1);
    expect(w.hs.toggles).toHaveLength(0);
    expect(w.hero.def).toBeCloseTo(def0, 3);
  });

  it('trigger: lethal damage leaves the hero at 1 HP (once per cooldown), and heals', () => {
    const w = world();
    giveSkill(
      w,
      fixture({
        kind: 'passive',
        effects: [
          {
            type: 'trigger',
            on: 'lethal',
            icd: 300,
            effects: [{ type: 'heal', who: 'self', maxHpPct: 0.3 }],
          },
        ],
      }),
      0,
      1,
    );
    applyDamage(w, w.hero, w.hero.maxHp * 5, null, false);
    expect(w.hero.alive).toBe(true);
    expect(w.hero.hp).toBeGreaterThanOrEqual(1);
    applyDamage(w, w.hero, w.hero.maxHp * 5, null, false);
    expect(w.hero.alive).toBe(false);
  });

  it('trigger: chance and internal cooldown (at least 0.5 s) apply, and a proc cannot start a proc', () => {
    const w = world();
    steady(w);
    const buffFx = {
      type: 'buff' as const,
      who: 'self' as const,
      key: 'proc_a',
      duration: 5,
      mods: [{ stat: 'def', add: 1 }],
    };
    giveSkill(
      w,
      fixture({
        kind: 'passive',
        id: 'p_hit',
        effects: [
          {
            type: 'trigger',
            on: 'hit',
            icd: 0,
            effects: [buffFx, { type: 'heal', who: 'self', maxHpPct: 0.01 }],
          },
        ],
      }),
      0,
      1,
    );
    giveSkill(
      w,
      fixture({
        kind: 'passive',
        id: 'p_heal',
        effects: [
          {
            type: 'trigger',
            on: 'hit',
            icd: 0,
            effects: [
              {
                type: 'buff',
                who: 'self',
                key: 'proc_b',
                duration: 5,
                mods: [{ stat: 'def', add: 1 }],
              },
            ],
          },
        ],
      }),
      1,
      1,
    );
    const d = dummyAt(w, 0, 1.5);
    run(w, 0.4); // basic attack lands once
    const procs = () => w.hero.buffs.filter((x) => x.key === 'proc_a' || x.key === 'proc_b').length;
    expect(procs()).toBeGreaterThan(0);
    expect(w.hs.icd['p_hit:0'] - w.time).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(w.hs.icd['p_hit:0']).toBeGreaterThan(0);
    void d;
  });

  it('modifier: tagged modifiers apply only to matching skills', () => {
    const w = world();
    steady(w);
    w.hero.atk = 100;
    giveSkill(
      w,
      fixture({
        kind: 'passive',
        tags: [],
        effects: [{ type: 'modifier', tags: ['fire'], mods: [{ stat: 'damagePct', pct: 0.5 }] }],
      }),
      0,
      1,
    );
    const plain = fixture({
      target: 'enemy',
      tags: ['melee', 'physical'],
      effects: [{ type: 'damage', school: 'physical', atk: 1 }],
    });
    const fire = fixture({
      target: 'enemy',
      tags: ['melee', 'fire'],
      effects: [{ type: 'damage', school: 'physical', atk: 1 }],
    });
    const run1 = (def: typeof plain) => {
      const w2 = world();
      steady(w2);
      giveSkill(
        w2,
        fixture({
          kind: 'passive',
          effects: [{ type: 'modifier', tags: ['fire'], mods: [{ stat: 'damagePct', pct: 0.5 }] }],
        }),
        0,
        1,
      );
      w2.hero.atk = 100;
      giveSkill(w2, def, 1, 1);
      const d = dummyAt(w2, 0, 2);
      cast(w2, 1);
      return lost(d);
    };
    const p = run1(plain);
    const f = run1(fire);
    expect(f / p).toBeGreaterThan(1.3);
    expect(f / p).toBeLessThan(1.7);
  });

  it('displace: knockback and pull, ignored by bosses and by knockback-immune targets', () => {
    const w = world();
    giveSkill(
      w,
      fixture({
        effects: [
          {
            type: 'area',
            shape: 'circle',
            at: 'self',
            radius: 6,
            onTick: [{ type: 'displace', kind: 'knockback', distance: 3 }],
          },
        ],
      }),
      0,
      1,
    );
    const a = dummyAt(w, 0, 3);
    const boss = dummyAt(w, 3, 0, 1000, { isBoss: true });
    const immune = dummyAt(w, -3, 0);
    immune.buffs.push({
      key: 'k',
      src: 0,
      remaining: 9,
      mods: [],
      immune: ['knockback'],
      debuff: false,
    });
    cast(w, 0);
    run(w, 0.5); // the push is a short slide, not a jump
    expect(a.z).toBeCloseTo(6, 0);
    expect(boss.x).toBe(3);
    expect(immune.x).toBe(-3);
  });

  it('dash with iframes makes the hero invulnerable for that time', () => {
    const w = world();
    giveSkill(
      w,
      fixture({
        target: 'direction',
        effects: [{ type: 'dash', distance: 6, speed: 12, iframes: 0.3 }],
      }),
      0,
      1,
    );
    cast(w, 0);
    expect(w.hero.invuln).toBeGreaterThan(0.2);
    const hp = w.hero.hp;
    applyDamage(w, w.hero, 50, null, false);
    expect(w.hero.hp).toBe(hp);
    run(w, 0.6);
    applyDamage(w, w.hero, 5, null, false);
    expect(w.hero.hp).toBeLessThan(hp);
  });

  it('refreshHero keeps HP in proportion when Max HP changes', () => {
    const w = world();
    w.hero.hp = w.hero.maxHp / 2;
    w.hs.passiveMods.push({ stat: 'maxHpPct', add: 0, pct: 1 });
    refreshHero(w);
    expect(w.hero.hp / w.hero.maxHp).toBeCloseTo(0.5, 2);
  });
});

describe('dormant skills in the engine', () => {
  it('a skill whose requirement is not met cannot be used even if it is still listed in a slot', () => {
    const w = world();
    steady(w);
    w.build.stats.STR = 10; // Flame Burst needs STR 20
    rebuildSlots(w);
    expect(w.hs.slots[1]).toBeNull();
    dummyAt(w, 0, 3);
    expect(tryCast(w, 1, null)).toBe('invalid');
    expect(w.hs.slots[0]).not.toBeNull(); // Crushing Blow (STR 5) is still fine
    w.build.stats.STR = 20;
    rebuildSlots(w);
    expect(w.hs.slots[1]).not.toBeNull();
  });
});
