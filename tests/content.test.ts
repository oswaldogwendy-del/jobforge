import { describe, expect, it } from 'vitest';
import { balance as b } from '../src/data/schema';
import { buildFromPreset, classes, devHero, skillMap, skills } from '../src/data/content';
import { skillTierGold, skillSchema } from '../src/data/contentSchema';
import { formatSkillText, rv } from '../src/sim/ranked';
import {
  canLearn,
  dormantSkills,
  equip,
  learn,
  rankUp,
  reqMet,
  skillPointsTotal,
  unequipDormant,
  unmetReq,
  validateBuild,
  type HeroBuild,
} from '../src/sim/loadout';
import { emptyStats } from '../src/sim/stats';
import { weaponStats } from '../src/sim/gear';

const hero = (o: Partial<HeroBuild> = {}): HeroBuild => ({
  name: 'T',
  look: 'knight',
  offhand: null,
  level: 12,
  gold: 100000,
  stats: emptyStats(),
  weapon: { type: 'sword', tier: 1 },
  armorTier: 1,
  learned: {},
  actives: Array(6).fill(null),
  passives: Array(4).fill(null),
  ...o,
});
const ctx = { unlockedClasses: new Set(['knight', 'mage']), skills: skillMap };

describe('ranked values', () => {
  it('interpolates linearly from r1 to the max rank', () => {
    expect(rv([1.8, 3.0], 1, 5)).toBeCloseTo(1.8, 6);
    expect(rv([1.8, 3.0], 5, 5)).toBeCloseTo(3.0, 6);
    expect(rv([1.8, 3.0], 3, 5)).toBeCloseTo(2.4, 6);
    expect(rv([1, 2], 3, 3)).toBeCloseTo(2, 6);
    expect(rv(7, 4, 5)).toBe(7);
    expect(rv(undefined, 1, 5, 9)).toBe(9);
  });
  it('fills text placeholders from the effect values', () => {
    const t = formatSkillText(
      'Hit for {matk}, {chance} to burn.',
      [
        {
          type: 'projectile',
          onHit: [
            { type: 'damage', matk: [1.6, 3.0] },
            { type: 'status', chance: [0.2, 1.0] },
          ],
        },
      ],
      5,
      5,
    );
    expect(t).toBe('Hit for 300%, 100% to burn.');
    expect(formatSkillText('x {nope}', [], 1, 5)).toBe('x {nope}');
  });
});

describe('Knight and Mage data (PRD Section 8)', () => {
  it('has 16 skills, 8 per class, one per tier slot', () => {
    expect(skills).toHaveLength(16);
    expect(
      classes
        .filter((c) => !c.comingIn)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['knight', 'mage']);
    expect(classes).toHaveLength(12);
    expect(classes.filter((c) => c.unlock.type === 'start')).toHaveLength(6);
    for (const c of ['knight', 'mage']) {
      const own = skills.filter((s) => s.classId === c);
      expect(own).toHaveLength(8);
      expect(own.filter((s) => s.tier === 5)).toHaveLength(1);
      expect(own.filter((s) => s.kind === 'passive')).toHaveLength(c === 'knight' ? 2 : 2);
    }
  });
  it('learn gold follows the tier table and ultimates stop at rank 3', () => {
    for (const s of skills) {
      expect(s.gold).toBe(skillTierGold[s.tier]);
      expect(s.maxRank).toBe(s.tier === 5 ? 3 : 5);
    }
  });
  it('requirements match the PRD', () => {
    const req = (id: string) => skillMap.get(id)!.req;
    expect(req('knight_crushing_blow')).toEqual({ STR: 5 });
    expect(req('knight_flame_burst')).toEqual({ STR: 20 });
    expect(req('knight_bulwark_charge')).toEqual({ STR: 60, VIT: 25 });
    expect(req('knight_kingsblade_oath')).toEqual({ STR: 80, VIT: 40 });
    expect(req('mage_chain_lightning')).toEqual({ INT: 25, DEX: 10 });
    expect(req('mage_spell_focus')).toEqual({ INT: 30, DEX: 30 });
    expect(req('mage_cataclysm')).toEqual({ INT: 80, DEX: 40 });
  });
  it('SP, cooldown and cast time match the PRD', () => {
    const s = (id: string) => skillMap.get(id)!;
    expect([s('knight_crushing_blow').sp, s('knight_crushing_blow').cooldown]).toEqual([8, 4]);
    expect([s('knight_flame_burst').sp, s('knight_flame_burst').cooldown]).toEqual([15, 8]);
    expect([s('knight_kingsblade_oath').sp, s('knight_kingsblade_oath').cooldown]).toEqual([
      70, 75,
    ]);
    expect([
      s('mage_ember_bolt').sp,
      s('mage_ember_bolt').cooldown,
      s('mage_ember_bolt').cast,
    ]).toEqual([10, 3, 0.6]);
    expect([s('mage_chain_lightning').sp, s('mage_chain_lightning').cast]).toEqual([18, 0.8]);
    expect([
      s('mage_glacial_storm').sp,
      s('mage_glacial_storm').cooldown,
      s('mage_glacial_storm').cast,
    ]).toEqual([50, 20, 1.5]);
    expect([
      s('mage_cataclysm').sp,
      s('mage_cataclysm').cooldown,
      s('mage_cataclysm').cast,
    ]).toEqual([90, 60, 2]);
  });
  it('ranked damage values run r1 to r5', () => {
    const dmg = (id: string) => {
      const find = (e: unknown): unknown => {
        if (!e || typeof e !== 'object') return undefined;
        const o = e as Record<string, unknown>;
        if (o.type === 'damage') return o;
        for (const v of Object.values(o)) {
          for (const c of Array.isArray(v) ? v : [v]) {
            const r = find(c);
            if (r) return r;
          }
        }
        return undefined;
      };
      return find(skillMap.get(id)!.effects) as { atk?: [number, number]; matk?: [number, number] };
    };
    expect(dmg('knight_crushing_blow').atk).toEqual([1.8, 3.0]);
    expect(dmg('knight_flame_burst').atk).toEqual([1.5, 2.5]);
    expect(dmg('knight_crescent_sweep').atk).toEqual([2.2, 4.0]);
    expect(dmg('knight_bulwark_charge').atk).toEqual([2.5, 4.2]);
    expect(dmg('mage_ember_bolt').matk).toEqual([1.6, 3.0]);
    expect(dmg('mage_frost_lance').matk).toEqual([1.4, 2.6]);
    expect(dmg('mage_chain_lightning').matk).toEqual([1.5, 2.5]);
    expect(dmg('mage_cataclysm').matk).toEqual([2.2, 3.3]);
  });
  it('every skill text placeholder resolves', () => {
    for (const s of skills) {
      const t = formatSkillText(s.text, s.effects, 1, s.maxRank);
      expect(t, s.id).not.toMatch(/\{\w+\}/);
    }
  });
  it('strict schemas reject unknown keys and bad effects', () => {
    const good = skillMap.get('knight_crushing_blow')!;
    expect(skillSchema.safeParse({ ...good, bogus: 1 }).success).toBe(false);
    expect(skillSchema.safeParse({ ...good, effects: [{ type: 'explode' }] }).success).toBe(false);
  });
});

describe('learning, equipping and dormant skills (PRD Section 7)', () => {
  const crush = skillMap.get('knight_crushing_blow')!;
  const flame = skillMap.get('knight_flame_burst')!;
  const sweep = skillMap.get('knight_crescent_sweep')!;
  it('needs the stat requirement', () => {
    const h = hero();
    expect(canLearn(h, crush, ctx)).toEqual({ ok: false, reason: 'requirement' });
    h.stats.STR = 5;
    expect(canLearn(h, crush, ctx)).toEqual({ ok: true });
    expect(unmetReq(flame.req, h.stats)).toEqual([{ stat: 'STR', need: 20, have: 5 }]);
    expect(reqMet(crush.req, h.stats)).toBe(true);
  });
  it('needs the trainer unlocked and the gold', () => {
    const h = hero({ stats: { ...emptyStats(), STR: 5 } });
    expect(canLearn(h, crush, { ...ctx, unlockedClasses: new Set() })).toEqual({
      ok: false,
      reason: 'trainer',
    });
    h.gold = 50;
    expect(canLearn(h, crush, ctx)).toEqual({ ok: false, reason: 'gold' });
  });
  it('needs a tier N-1 skill of the same class already learned', () => {
    const h = hero({ stats: { ...emptyStats(), STR: 40 } });
    expect(canLearn(h, flame, ctx)).toEqual({ ok: false, reason: 'tier' });
    learn(h, crush);
    expect(canLearn(h, flame, ctx)).toEqual({ ok: true });
    // A tier-1 skill from another class does not count.
    const h2 = hero({ stats: { ...emptyStats(), STR: 40, INT: 5 } });
    learn(h2, skillMap.get('mage_ember_bolt')!);
    expect(canLearn(h2, flame, ctx)).toEqual({ ok: false, reason: 'tier' });
    // Tier 3 needs a tier 2 skill.
    learn(h, flame);
    expect(canLearn(h, sweep, ctx)).toEqual({ ok: true });
  });
  it('learning pays the gold and gives rank 1; ranks cost 1 skill point up to max', () => {
    const h = hero({ stats: { ...emptyStats(), STR: 5 }, gold: 150 });
    learn(h, crush);
    expect(h.learned[crush.id]).toBe(1);
    expect(h.gold).toBe(50);
    expect(canLearn(h, crush, ctx)).toEqual({ ok: false, reason: 'known' });
    expect(rankUp(h, crush, 0)).toBe(false);
    for (let i = 0; i < 4; i++) expect(rankUp(h, crush, 1)).toBe(true);
    expect(h.learned[crush.id]).toBe(5);
    expect(rankUp(h, crush, 1)).toBe(false);
  });
  it('skill points: 1 per level plus 2 per first boss kill', () => {
    expect(skillPointsTotal(b, 12)).toBe(11);
    expect(skillPointsTotal(b, 99, 6)).toBe(98 + 12);
  });
  it('equipping needs the skill learned and the requirement met, and moves it between slots', () => {
    const h = hero({ stats: { ...emptyStats(), STR: 5 } });
    expect(equip(h, crush, 0, skillMap)).toBe(false);
    learn(h, crush);
    expect(equip(h, crush, 0, skillMap)).toBe(true);
    expect(equip(h, crush, 3, skillMap)).toBe(true);
    expect(h.actives[0]).toBeNull();
    expect(h.actives[3]).toBe(crush.id);
    expect(equip(h, crush, 9, skillMap)).toBe(false);
  });
  it('a skill whose requirement fails turns dormant and is unequipped, but stays learned', () => {
    const h = hero({ stats: { ...emptyStats(), STR: 20 } });
    learn(h, crush);
    learn(h, flame);
    equip(h, crush, 0, skillMap);
    equip(h, flame, 1, skillMap);
    h.stats.STR = 10; // a stat reset or a gear change
    expect(dormantSkills(h, skillMap)).toEqual([flame.id]);
    expect(equip(h, flame, 2, skillMap)).toBe(false);
    expect(unequipDormant(h, skillMap)).toEqual([flame.id]);
    expect(h.actives[1]).toBeNull();
    expect(h.actives[0]).toBe(crush.id);
    expect(h.learned[flame.id]).toBe(1);
  });
  it('gear bonuses count toward requirements', () => {
    const h = hero({ stats: { ...emptyStats(), STR: 18 } });
    expect(reqMet(flame.req, { ...h.stats, STR: h.stats.STR + 2 })).toBe(true);
    expect(canLearn({ ...h, learned: { [crush.id]: 1 } }, flame, ctx, { STR: 2 })).toEqual({
      ok: true,
    });
  });
});

describe('dev hero presets', () => {
  it('both presets are valid builds at level 12 (90 stat points, 11 skill points)', () => {
    for (const key of Object.keys(devHero.presets)) {
      expect(validateBuild(b, buildFromPreset(key), skillMap), key).toEqual([]);
    }
  });
  it('weapon values come from the tier table and type multipliers', () => {
    expect(weaponStats(b, 'sword', 1).atk).toBe(12);
    expect(weaponStats(b, 'greataxe', 1).atk).toBeCloseTo(16.2, 6);
    expect(weaponStats(b, 'dagger', 2).atk).toBeCloseTo(26.25, 6);
    const staff = weaponStats(b, 'staff', 1);
    expect([staff.matk, staff.atk]).toEqual([12, 3.5999999999999996]);
    const mace = weaponStats(b, 'mace', 1);
    expect(mace.atk).toBeCloseTo(10.8, 6);
    expect(mace.matk).toBeCloseTo(3.24, 6);
  });
});
