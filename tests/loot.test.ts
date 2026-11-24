import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { balance as b } from '../src/data/schema';
import { items, itemMap } from '../src/data/content';
import {
  createItem,
  gearTotals,
  itemBase,
  rollRarity,
  sellValue,
  tierForLevel,
} from '../src/sim/items';
import { rollChest, rollMonsterDrops } from '../src/sim/loot';
import { buildOf, newSave, presetOf, addItem, equipFromBag } from '../src/sim/profile';
import { killUnit } from '../src/sim/combat';
import { dummyAt, monsterAt, run, world } from './helpers';
import { buildFromPreset } from '../src/data/content';

const src = { level: 5, elite: false, materialId: 'iron_shard' };

describe('item data', () => {
  it('follows the Section 12 tier table', () => {
    for (let t = 1; t <= 6; t++) {
      expect(itemMap.get(`sword_t${t}`)!.base.atk).toBeCloseTo(b.items.weaponAtk[t - 1], 5);
      expect(itemMap.get(`plate_t${t}`)!.base.def).toBe(b.items.armorDef[t - 1]);
      expect(itemMap.get(`staff_t${t}`)!.base.matk).toBeCloseTo(b.items.weaponAtk[t - 1], 5);
      expect(itemMap.get(`staff_t${t}`)!.base.atk).toBeCloseTo(b.items.weaponAtk[t - 1] * 0.3, 5);
      expect(itemMap.get(`shield_t${t}`)!.base.def).toBeCloseTo(b.items.armorDef[t - 1] * 0.6, 1);
      expect(itemMap.get(`boots_t${t}`)!.base.moveSpeedPct).toBeCloseTo(0.01 * t, 5);
      expect(itemMap.get(`ring_luk_t${t}`)!.base.stats).toEqual({ LUK: t });
    }
    expect(itemMap.get('greataxe_t1')!.base.atk).toBeCloseTo(12 * 1.35, 5);
    expect(itemMap.get('dagger_t1')!.base.atk).toBeCloseTo(12 * 0.75, 5);
    expect(itemMap.get('mace_t1')!.base.matk).toBeCloseTo(12 * 0.9 * 0.3, 5);
    expect(itemMap.get('tome_t2')!.base.maxSpPct).toBeCloseTo(0.08, 5);
    expect(itemMap.get('hat_t3')!.base.mdef).toBeCloseTo(12, 5);
  });

  it('the Queen legendaries exist with their unique effects', () => {
    const crown = itemMap.get('royal_jelly_crown')!;
    expect(crown.legendary!.healOnKillPct).toBe(0.02);
    expect(crown.base.maxHpPct).toBe(0.05);
    expect(crown.base.stats).toEqual({ VIT: 2 });
    expect(itemMap.get('wobbling_scepter')!.slot).toBe('weapon');
    expect(items.filter((i) => i.legendary)).toHaveLength(2);
  });
});

describe('rarity', () => {
  it('rolls by the 60/28/10/2 weights', () => {
    const rng = new Rng(11);
    const n = 40000;
    const c: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = rollRarity(b, rng);
      c[r] = (c[r] ?? 0) + 1;
    }
    expect(c.common / n).toBeCloseTo(0.6, 1);
    expect(c.fine / n).toBeCloseTo(0.28, 1);
    expect(c.rare / n).toBeCloseTo(0.1, 1);
    expect(c.epic / n).toBeCloseTo(0.02, 2);
    expect(c.legendary).toBeUndefined();
  });

  it('a minimum rarity skips the lower ones', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 500; i++) expect(rollRarity(b, rng, 'rare')).toMatch(/rare|epic/);
  });

  it('scales base stats, rolls slots and bonus stats by rarity, capped by the item type', () => {
    const rng = new Rng(4);
    const sword = itemMap.get('sword_t3')!;
    const common = createItem(b, rng, sword, 'common');
    const epic = createItem(b, rng, sword, 'epic');
    expect(itemBase(b, sword, common).atk).toBeCloseTo(65, 5);
    expect(itemBase(b, sword, epic).atk).toBeCloseTo(65 * 1.4, 5);
    expect(Object.keys(epic.bonus)).toHaveLength(2);
    expect(Object.values(epic.bonus).every((v) => v === 3)).toBe(true);
    expect(Object.keys(createItem(b, rng, sword, 'rare').bonus)).toHaveLength(1);
    expect(Object.keys(common.bonus)).toHaveLength(0);
    const ring = itemMap.get('ring_str_t2')!;
    for (let i = 0; i < 50; i++)
      expect(createItem(b, rng, ring, 'epic').slots.length).toBeLessThanOrEqual(1);
    for (let i = 0; i < 50; i++) {
      const r = createItem(b, rng, sword, 'rare');
      expect(r.slots.length).toBeGreaterThanOrEqual(1);
      expect(r.slots.length).toBeLessThanOrEqual(3);
    }
  });

  it('refine adds 6% to weapons and 8% to other gear', () => {
    const rng = new Rng(4);
    const sword = createItem(b, rng, itemMap.get('sword_t1')!);
    sword.refine = 5;
    expect(itemBase(b, itemMap.get('sword_t1')!, sword).atk).toBeCloseTo(12 * 1.3, 5);
    const plate = createItem(b, rng, itemMap.get('plate_t1')!);
    plate.refine = 5;
    expect(itemBase(b, itemMap.get('plate_t1')!, plate).def).toBeCloseTo(6 * 1.4, 5);
    expect(sellValue(b, itemMap.get('sword_t1')!, sword)).toBeGreaterThan(24);
  });
});

describe('drop tables', () => {
  it('normal monsters drop equipment 4%, ore 15% and potions 5%', () => {
    const rng = new Rng(21);
    const n = 60000;
    let eq = 0;
    let ore = 0;
    let pot = 0;
    for (let i = 0; i < n; i++) {
      const d = rollMonsterDrops(b, rng, src, 0);
      eq += d.items.length;
      ore += d.stacks.filter((s) => s.id === 'iron_shard').length;
      pot += d.stacks.filter((s) => s.id.startsWith('minor_')).length;
    }
    expect(eq / n).toBeCloseTo(0.04, 2);
    expect(ore / n).toBeCloseTo(0.15, 1);
    expect(pot / n).toBeCloseTo(0.05, 2);
  });

  it('LUK and loot bonus multiply the chances, up to +100%', () => {
    const count = (bonus: number) => {
      const rng = new Rng(8);
      let eq = 0;
      for (let i = 0; i < 80000; i++) eq += rollMonsterDrops(b, rng, src, bonus).items.length;
      return eq / 80000;
    };
    expect(count(0.5)).toBeCloseTo(0.06, 2);
    expect(count(5)).toBeCloseTo(0.08, 2);
  });

  it('elites drop one Fine-or-better item, 2 to 4 ore, and a Sigil 25% of the time', () => {
    const rng = new Rng(5);
    let sigil = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const d = rollMonsterDrops(b, rng, { ...src, elite: true }, 0);
      expect(d.items).toHaveLength(1);
      expect(d.items[0].rarity).not.toBe('common');
      const ore = d.stacks.find((s) => s.id === 'iron_shard')!;
      expect(ore.n).toBeGreaterThanOrEqual(2);
      expect(ore.n).toBeLessThanOrEqual(4);
      if (d.stacks.some((s) => s.id === 'boss_sigil')) sigil++;
    }
    expect(sigil / n).toBeCloseTo(0.25, 1);
  });

  it('the chest gives 2 to 3 items, at least one Rare or better, 5 to 8 ore, legendaries at 3% each', () => {
    const rng = new Rng(9);
    let leg = 0;
    let obl = 0;
    let epic = 0;
    const n = 8000;
    for (let i = 0; i < n; i++) {
      const d = rollChest(
        b,
        rng,
        { ...src, level: 12, legendaryIds: ['royal_jelly_crown', 'wobbling_scepter'] },
        0,
      );
      const normal = d.items.filter((x) => x.rarity !== 'legendary');
      expect(normal.length).toBeGreaterThanOrEqual(2);
      expect(normal.length).toBeLessThanOrEqual(3);
      expect(normal.some((x) => ['rare', 'epic'].includes(x.rarity))).toBe(true);
      const ore = d.stacks.find((s) => s.id === 'iron_shard')!.n;
      expect(ore).toBeGreaterThanOrEqual(5);
      expect(ore).toBeLessThanOrEqual(8);
      leg += d.items.filter((x) => x.rarity === 'legendary').length;
      if (d.stacks.some((s) => s.id === 'oblivion_draught')) obl++;
      if (normal.some((x) => x.rarity === 'epic')) epic++;
    }
    expect(leg / n).toBeCloseTo(0.06, 1);
    expect(obl / n).toBeCloseTo(0.1, 1);
    expect(epic / n).toBeGreaterThan(0.2);
  });

  it('the item tier follows the level: tier 1 up to 11, tier 2 from 12', () => {
    expect(tierForLevel(b, 1, items)).toBe(1);
    expect(tierForLevel(b, 11, items)).toBe(1);
    expect(tierForLevel(b, 12, items)).toBe(2);
    expect(tierForLevel(b, 99, items)).toBe(6);
  });
});

describe('gear totals', () => {
  it('sums equipped items into the build: weapon, armor, off-hand SP, boots speed', () => {
    const s = newSave({ name: 'G', look: 'mage', weapon: 'staff', template: 'caster' });
    s.hero.level = 12;
    const rng = new Rng(1);
    for (const id of ['tome_t2', 'boots_t2', 'hat_t2', 'ring_int_t2']) {
      const i = createItem(b, rng, itemMap.get(id)!);
      addItem(s, i);
      expect(equipFromBag(s, i.uid).ok).toBe(true);
    }
    const build = buildOf(s);
    expect(build.offhand).toBe('spellbook_closed');
    expect(build.weapon).toMatchObject({ type: 'staff', matk: 12 });
    expect(build.gear!.maxSpPct).toBeCloseTo(0.03 + 0.08, 5);
    expect(build.gear!.moveSpeedPct).toBeCloseTo(0.02, 5);
    expect(build.gear!.stats).toEqual({ INT: 2 });
    expect(build.gear!.def).toBeCloseTo(2.4 + 14 * 0.4 + 14 * 0.25, 1);
    const eq = presetOf(s).equipment;
    expect(Object.keys(eq).sort()).toEqual(['acc1', 'armor', 'head', 'offhand', 'shoes', 'weapon']);
    const owned = new Map(s.hero.inventory.map((i) => [i.uid, i]));
    expect(gearTotals(b, eq, owned, (id) => itemMap.get(id)).weapon!.type).toBe('staff');
  });

  it('gear changes the hero numbers in the sim: a better sword raises ATK, armor raises DEF', () => {
    const lo = world('warrior');
    lo.build.gear = {
      def: 0,
      mdef: 0,
      maxHpPct: 0,
      maxSpPct: 0,
      flee: 0,
      moveSpeedPct: 0,
      stats: {},
      healOnKillPct: 0,
      spellEchoChance: 0,
    };
    lo.build.weapon = { type: 'sword', tier: 1, atk: 12, matk: 0 };
    lo.loadBuild(lo.build);
    const hi = world('warrior');
    hi.build.gear = { ...lo.build.gear, def: 50, maxHpPct: 0.1 };
    hi.build.weapon = { type: 'sword', tier: 1, atk: 100, matk: 0 };
    hi.loadBuild(hi.build);
    expect(hi.hero.atk).toBeGreaterThan(lo.hero.atk);
    expect(hi.hero.def).toBeGreaterThan(lo.hero.def);
    // +10% Max HP adds to the Iron Body passive's bonus, so the total is a little under 1.1x.
    expect(hi.hero.maxHp).toBeGreaterThan(lo.hero.maxHp * 1.05);
  });
});

describe('loot in a run', () => {
  const field = () => {
    const w = world('warrior');
    return w;
  };

  it('a kill emits its EXP and gold, drops fly to the hero after 0.5 s and are collected', () => {
    const w = field();
    w.hs.dropBonus = 1;
    const kills: number[] = [];
    let dropped = 0;
    for (let i = 0; i < 400 && dropped === 0; i++) {
      const m = monsterAt(w, 'jellop', 3, 0, 5);
      m.hp = 1;
      killUnit(w, m, w.hero);
      dropped = w.pickups.length;
      kills.push(i);
      w.drainEvents();
    }
    expect(dropped).toBeGreaterThan(0);
    const p = w.pickups[0];
    run(w, 0.3);
    expect(w.pickups).toContain(p);
    const before = Math.hypot(p.x - w.hero.x, p.z - w.hero.z);
    run(w, 1.5);
    expect(w.pickups).not.toContain(p);
    expect(before).toBeGreaterThan(0);
    const ev = w.drainEvents();
    expect(ev.some((e) => e.t === 'pickup')).toBe(true);
    expect(w.run.drops.items.length + w.run.drops.stacks.length).toBeGreaterThan(0);
  });

  it('the kill event carries EXP and gold', () => {
    const w = field();
    const m = monsterAt(w, 'jellop', 3, 0, 5);
    w.drainEvents();
    killUnit(w, m, w.hero);
    const r = w.drainEvents().find((e) => e.t === 'reward');
    expect(r).toMatchObject({ t: 'reward', level: 5, boss: false });
    expect((r as { exp: number }).exp).toBeGreaterThan(0);
    expect((r as { gold: number }).gold).toBeGreaterThan(0);
  });

  it('the Royal Jelly Crown heals 2% of Max HP per kill', () => {
    const w = world('warrior');
    w.build.gear = {
      def: 0,
      mdef: 0,
      maxHpPct: 0,
      maxSpPct: 0,
      flee: 0,
      moveSpeedPct: 0,
      stats: {},
      healOnKillPct: 0.02,
      spellEchoChance: 0,
    };
    w.loadBuild(w.build);
    w.hero.hp = w.hero.maxHp * 0.5;
    const m = dummyAt(w, 2, 0);
    m.defId = 'jellop';
    killUnit(w, m, w.hero);
    expect(w.hero.hp).toBeCloseTo(w.hero.maxHp * 0.52, 0);
  });
});

describe('potions', () => {
  const potionWorld = () => {
    const w = world('warrior');
    w.build.consumables = ['minor_health', 'minor_mana'];
    w.build.stacks = { minor_health: 2, minor_mana: 1 };
    return w;
  };

  it('a health draught heals 20% Max HP, uses one, and shares an 8 s cooldown', () => {
    const w = potionWorld();
    w.hero.hp = w.hero.maxHp * 0.3;
    expect(w.usePotion(0)).toBe(true);
    expect(w.hero.hp).toBeCloseTo(w.hero.maxHp * 0.5, 0);
    expect(w.build.stacks!.minor_health).toBe(1);
    expect(w.drainEvents().some((e) => e.t === 'potion' && e.id === 'minor_health')).toBe(true);
    expect(w.usePotion(0)).toBe(false);
    run(w, 8.2);
    expect(w.usePotion(0)).toBe(true);
    expect(w.build.stacks!.minor_health).toBe(0);
    run(w, 8.2);
    expect(w.usePotion(0)).toBe(false);
  });

  it('a mana draught restores SP, independently of the health cooldown', () => {
    const w = potionWorld();
    w.hero.sp = 0;
    w.usePotion(0);
    expect(w.usePotion(1)).toBe(true);
    expect(w.hero.sp).toBeCloseTo(w.hero.maxSp * 0.2, 0);
  });

  it('cannot use an empty or missing slot', () => {
    const w = potionWorld();
    expect(w.usePotion(5)).toBe(false);
    w.build.stacks!.minor_mana = 0;
    expect(w.usePotion(1)).toBe(false);
  });
});

void buildFromPreset;
