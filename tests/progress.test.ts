import { describe, expect, it } from 'vitest';
import { balance as b } from '../src/data/schema';
import { skillMap } from '../src/data/content';
import { expToNext, pointsGained, totalPoints } from '../src/sim/stats';
import {
  addItem,
  addStack,
  bagFree,
  bagExpansionCost,
  buildOf,
  buyStack,
  claimOverflow,
  dormantOf,
  equipFromBag,
  expandBag,
  gainExp,
  learnSkill,
  newSave,
  oracleCost,
  oracleReset,
  presetOf,
  rankUpSkill,
  raiseStat,
  recordBossKill,
  resetRanks,
  sellItem,
  setSkillSlot,
  slotCounts,
  bossOrderOf,
  templateStats,
  unlockedClassIds,
  defaultCtx,
} from '../src/sim/profile';
import { Rng } from '../src/core/rng';
import { createItem } from '../src/sim/items';
import { itemMap } from '../src/data/content';
import { STAT_IDS } from '../src/data/types';

const hero = (template: 'warrior' | 'caster' | 'rogue' | 'custom' = 'warrior') =>
  newSave({ name: 'Tester', look: 'knight', weapon: 'sword', template });

describe('new hero', () => {
  it('spends the 48 starting points by template and keeps the rest free', () => {
    for (const t of ['warrior', 'caster', 'rogue'] as const) {
      const s = hero(t);
      const p = presetOf(s);
      const spent = STAT_IDS.reduce((x, k) => {
        let c = 0;
        for (let n = 1; n < p.stats[k]; n++) c += Math.floor((n - 1) / 10) + 2;
        return x + c;
      }, 0);
      expect(spent + p.statPointsFree).toBe(b.stats.startPoints);
      expect(p.statPointsFree).toBeLessThan(3);
    }
    expect(templateStats(b, 'warrior', 48).STR).toBeGreaterThan(
      templateStats(b, 'warrior', 48).INT,
    );
    expect(presetOf(hero('custom')).statPointsFree).toBe(48);
  });

  it('starts at level 1 with a starter weapon, armor, gold and potions, and no skills', () => {
    const s = hero();
    expect(s.hero.level).toBe(1);
    expect(s.hero.gold).toBe(200);
    expect(s.hero.stacks.minor_health).toBe(5);
    expect(Object.keys(s.hero.learned)).toHaveLength(0);
    const build = buildOf(s);
    expect(build.weapon.type).toBe('sword');
    expect(build.weapon.atk).toBeCloseTo(12, 5);
    expect(build.gear!.def).toBeCloseTo(6, 5);
  });
});

describe('EXP and levels', () => {
  it('levels up on the PRD curve and gives stat and skill points', () => {
    const s = hero();
    expect(gainExp(b, s, expToNext(b, 1) - 1)).toBeNull();
    const up = gainExp(b, s, 2)!;
    expect(up.to).toBe(2);
    expect(s.hero.skillPointsFree).toBe(1);
    expect(presetOf(s).statPointsFree).toBeGreaterThanOrEqual(pointsGained(b, 1));
    expect(s.hero.exp).toBeCloseTo(1, 5);
  });

  it('a big gain crosses several levels, and the point total matches the PRD table', () => {
    const s = hero();
    const before = presetOf(s).statPointsFree;
    const up = gainExp(b, s, 1e6)!;
    expect(up.to).toBeGreaterThan(10);
    const gained = presetOf(s).statPointsFree - before;
    expect(gained).toBe(totalPoints(b, s.hero.level) - totalPoints(b, 1));
    expect(s.hero.skillPointsFree).toBe(s.hero.level - 1);
  });

  it('applies stat points to every preset', () => {
    const s = hero();
    s.hero.presets.push(structuredClone(s.hero.presets[0]));
    const f0 = s.hero.presets[1].statPointsFree;
    gainExp(b, s, expToNext(b, 1) + 1);
    expect(s.hero.presets[1].statPointsFree).toBeGreaterThan(f0);
  });
});

describe('stats and the Oracle', () => {
  it('raising a stat costs floor((n-1)/10)+2 and needs free points', () => {
    const s = hero('custom');
    const p = presetOf(s);
    expect(raiseStat(b, p, 'STR')).toBe(true);
    expect(p.stats.STR).toBe(2);
    expect(p.statPointsFree).toBe(46);
    p.statPointsFree = 1;
    expect(raiseStat(b, p, 'STR')).toBe(false);
  });

  it('a reset is free up to level 20, then 5 x L squared, or a draught', () => {
    expect(oracleCost(b, 20)).toBe(0);
    expect(oracleCost(b, 50)).toBe(12500);
    expect(oracleCost(b, 99)).toBe(49005);
    const s = hero();
    s.hero.level = 30;
    s.hero.gold = 100;
    expect(oracleReset(s)).toEqual({ ok: false, reason: 'gold' });
    expect(oracleReset(s, defaultCtx, true)).toEqual({ ok: false, reason: 'draught' });
    addStack(s, 'oblivion_draught', 1);
    const r = oracleReset(s, defaultCtx, true);
    expect(r.ok).toBe(true);
    expect(presetOf(s).stats.STR).toBe(1);
    expect(presetOf(s).statPointsFree).toBe(totalPoints(b, 30));
    expect(s.hero.stacks.oblivion_draught).toBeUndefined();
  });

  it('a reset unequips skills whose requirements fail', () => {
    const s = hero();
    s.hero.level = 25;
    s.hero.gold = 100000;
    presetOf(s).stats.STR = 12;
    expect(learnSkill(s, 'knight_crushing_blow').ok).toBe(true);
    expect(setSkillSlot(s, 'active', 0, 'knight_crushing_blow')).toBe(true);
    const r = oracleReset(s);
    expect(r.ok && r.cost).toBe(3125);
    expect(r.ok && r.unequipped).toEqual(['knight_crushing_blow']);
    expect(presetOf(s).actives[0]).toBeNull();
    expect(s.hero.learned.knight_crushing_blow).toBe(1);
  });
});

describe('Guild Hall: learning and ranks', () => {
  const strong = () => {
    const s = hero();
    s.hero.level = 20;
    s.hero.gold = 100000;
    s.hero.skillPointsFree = 10;
    presetOf(s).stats = { STR: 30, AGI: 1, VIT: 20, INT: 20, DEX: 15, LUK: 1 };
    return s;
  };

  it('needs the requirement, the tier prerequisite and the gold', () => {
    const s = hero('custom');
    expect(learnSkill(s, 'knight_crushing_blow')).toEqual({ ok: false, reason: 'requirement' });
    const t = strong();
    expect(learnSkill(t, 'knight_flame_burst')).toEqual({ ok: false, reason: 'tier' });
    const gold = t.hero.gold;
    expect(learnSkill(t, 'knight_crushing_blow').ok).toBe(true);
    expect(t.hero.gold).toBe(gold - skillMap.get('knight_crushing_blow')!.gold);
    expect(learnSkill(t, 'knight_crushing_blow')).toEqual({ ok: false, reason: 'known' });
    t.hero.gold = 1;
    expect(learnSkill(t, 'knight_flame_burst')).toEqual({ ok: false, reason: 'gold' });
  });

  it('other trainers are locked until their class unlocks', () => {
    const s = strong();
    expect(unlockedClassIds(defaultCtx, s.progress)).toEqual(new Set(['knight', 'mage']));
    expect(learnSkill(s, 'nonexistent_skill').ok).toBe(false);
  });

  it('a rank costs 1 skill point up to the max, and a reset refunds every point for free', () => {
    const s = strong();
    learnSkill(s, 'knight_crushing_blow');
    for (let i = 0; i < 4; i++) expect(rankUpSkill(s, 'knight_crushing_blow')).toBe(true);
    expect(rankUpSkill(s, 'knight_crushing_blow')).toBe(false);
    expect(s.hero.learned.knight_crushing_blow).toBe(5);
    expect(s.hero.skillPointsFree).toBe(6);
    const gold = s.hero.gold;
    expect(resetRanks(s)).toBe(4);
    expect(s.hero.learned.knight_crushing_blow).toBe(1);
    expect(s.hero.skillPointsFree).toBe(10);
    expect(s.hero.gold).toBe(gold);
  });

  it('lowering a stat makes a skill dormant and it cannot be equipped', () => {
    const s = strong();
    learnSkill(s, 'knight_crushing_blow');
    setSkillSlot(s, 'active', 0, 'knight_crushing_blow');
    presetOf(s).stats.STR = 1;
    expect(dormantOf(s)).toEqual(['knight_crushing_blow']);
    expect(setSkillSlot(s, 'active', 1, 'knight_crushing_blow')).toBe(false);
  });
});

describe('loadout slots', () => {
  it('starts with 4 active and 2 passive slots and grows with boss kills', () => {
    const s = hero();
    const order = bossOrderOf();
    expect(slotCounts(b, s.progress, order)).toEqual({
      active: 4,
      passive: 2,
      consumable: 2,
      presets: 1,
    });
    expect(setSkillSlot(s, 'active', 4, null)).toBe(false);
    const first = recordBossKill(s, 'queen_gelatina');
    expect(first).toBe(true);
    expect(s.hero.skillPointsFree).toBe(2);
    expect(slotCounts(b, s.progress, order).active).toBe(5);
    expect(recordBossKill(s, 'queen_gelatina')).toBe(false);
    expect(s.hero.skillPointsFree).toBe(2);
    expect(s.progress.bossKills.queen_gelatina).toBe(2);
    recordBossKill(s, 'hollow_abbot');
    recordBossKill(s, 'gilded_scarab_rex');
    recordBossKill(s, 'rimeclaw');
    recordBossKill(s, 'ignar');
    recordBossKill(s, 'malgrath');
    expect(slotCounts(b, s.progress, order)).toEqual({
      active: 6,
      passive: 4,
      consumable: 2,
      presets: 3,
    });
  });

  it('a skill sits in one slot only', () => {
    const s = hero();
    s.hero.gold = 1000;
    presetOf(s).stats.STR = 12;
    learnSkill(s, 'knight_crushing_blow');
    setSkillSlot(s, 'active', 0, 'knight_crushing_blow');
    setSkillSlot(s, 'active', 2, 'knight_crushing_blow');
    expect(presetOf(s).actives).toEqual([null, null, 'knight_crushing_blow', null, null, null]);
  });
});

describe('bag, shop and selling', () => {
  const mk = (id: string, rarity: 'common' | 'rare' = 'common') =>
    createItem(b, new Rng(5), itemMap.get(id)!, rarity);

  it('a full bag sends pickups to the overflow box, and claiming moves them back', () => {
    const s = hero();
    s.hero.bagSize = 3;
    for (let i = 0; i < 3; i++) expect(addItem(s, mk('helm_t1'))).toBe('bag');
    expect(bagFree(s)).toBe(0);
    expect(addItem(s, mk('helm_t1'))).toBe('overflow');
    expect(s.hero.overflow).toHaveLength(1);
    expect(claimOverflow(s)).toBe(0);
    sellItem(s, s.hero.inventory[2].uid);
    expect(claimOverflow(s)).toBe(1);
    expect(s.hero.overflow).toHaveLength(0);
  });

  it('auto-sell Common sells on pickup', () => {
    const s = hero();
    s.settings.autoSellCommon = true;
    const gold = s.hero.gold;
    expect(addItem(s, mk('helm_t1'))).toBe('sold');
    expect(s.hero.gold).toBeGreaterThan(gold);
    expect(addItem(s, mk('helm_t1', 'rare'))).toBe('bag');
  });

  it('cannot sell an equipped or locked item; selling pays the rarity-scaled price', () => {
    const s = hero();
    const equipped = presetOf(s).equipment.weapon!;
    expect(sellItem(s, equipped)).toBe(0);
    const it = mk('helm_t1', 'rare');
    addItem(s, it);
    it.locked = true;
    expect(sellItem(s, it.uid)).toBe(0);
    it.locked = false;
    expect(sellItem(s, it.uid)).toBe(
      Math.round(itemMap.get('helm_t1')!.sellPrice * b.items.sellMult.rare),
    );
  });

  it('shop: potions need the level and the gold; bag expansions follow the price list', () => {
    const s = hero();
    expect(buyStack(s, 'minor_health', 2)).toBe(true);
    expect(s.hero.stacks.minor_health).toBe(7);
    expect(s.hero.gold).toBe(200 - 60);
    expect(buyStack(s, 'greater_health', 1)).toBe(false);
    expect(buyStack(s, 'boss_sigil', 1)).toBe(false);
    expect(bagExpansionCost(b, 60)).toBe(5000);
    expect(bagExpansionCost(b, 70)).toBe(12000);
    expect(bagExpansionCost(b, 120)).toBeNull();
    expect(expandBag(s)).toBe(false);
    s.hero.gold = 5000;
    expect(expandBag(s)).toBe(true);
    expect(s.hero.bagSize).toBe(70);
  });

  it('equipping needs the level; a two-handed weapon pushes the off-hand out', () => {
    const s = hero();
    const axe = mk('greataxe_t2');
    const shield = mk('shield_t1');
    const axe1 = mk('greataxe_t1');
    for (const i of [axe, shield, axe1]) addItem(s, i);
    expect(equipFromBag(s, axe.uid)).toEqual({ ok: false, reason: 'level' });
    expect(equipFromBag(s, shield.uid).ok).toBe(true);
    expect(presetOf(s).equipment.offhand).toBe(shield.uid);
    const r = equipFromBag(s, axe1.uid);
    expect(r.ok && r.removed.length).toBe(2);
    expect(presetOf(s).equipment.offhand).toBeUndefined();
    expect(equipFromBag(s, shield.uid)).toEqual({ ok: false, reason: 'twoHanded' });
    expect(buildOf(s).weapon.type).toBe('greataxe');
  });

  it('gear stat bonuses count towards skill requirements', () => {
    const s = hero('custom');
    s.hero.gold = 5000;
    expect(learnSkill(s, 'knight_crushing_blow').ok).toBe(false);
    // Five rings of +1 are not available at once, so use a Rare with bonus STR on a helm.
    const helm = mk('helm_t1', 'rare');
    helm.bonus = { STR: 5 };
    addItem(s, helm);
    expect(equipFromBag(s, helm.uid).ok).toBe(true);
    expect(buildOf(s).stats.STR).toBe(1);
    expect(learnSkill(s, 'knight_crushing_blow').ok).toBe(true);
  });
});
