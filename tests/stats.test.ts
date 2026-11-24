import { describe, expect, it } from 'vitest';
import { balance as b } from '../src/data/schema';
import {
  apsFor,
  atkFor,
  castMultFor,
  cdrPctFor,
  costToReach,
  critPct,
  defFor,
  defenseFactor,
  deriveHero,
  dropBonusFor,
  emptyStats,
  expForKill,
  expMonster,
  expToNext,
  fleeFor,
  goldForKill,
  hitChancePct,
  hitFor,
  hpRegenFor,
  levelGapFactor,
  matkRange,
  maxHpFor,
  maxSpFor,
  mdefFor,
  monsterStats,
  moveSpeedFor,
  perfectDodgePct,
  pointsGained,
  pointsSpent,
  spRegenFor,
  statCost,
  statusResistPct,
  totalPoints,
  zeroBonuses,
} from '../src/sim/stats';

const sword = { type: 'sword', atk: 12, matk: 0, refine: 0 } as const;
const stats = (o: Partial<ReturnType<typeof emptyStats>>) => ({ ...emptyStats(), ...o });

describe('stat points (PRD Section 6)', () => {
  it('gains floor(x / 5) + 3 points per level', () => {
    expect(pointsGained(b, 1)).toBe(3);
    expect(pointsGained(b, 5)).toBe(4);
    expect(pointsGained(b, 10)).toBe(5);
    expect(pointsGained(b, 98)).toBe(22);
  });
  it('starts with 48 points and matches the PRD totals', () => {
    expect(totalPoints(b, 1)).toBe(48);
    expect(totalPoints(b, 12)).toBe(90);
    expect(totalPoints(b, 30)).toBe(210);
    expect(totalPoints(b, 60)).toBe(555);
    expect(totalPoints(b, 80)).toBe(885);
    expect(totalPoints(b, 99)).toBe(1273);
  });
  it('costs floor((n - 1) / 10) + 2 to raise a stat', () => {
    expect(statCost(b, 1)).toBe(2);
    expect(statCost(b, 10)).toBe(2);
    expect(statCost(b, 11)).toBe(3);
    expect(statCost(b, 21)).toBe(4);
    expect(statCost(b, 98)).toBe(11);
  });
  it('matches the PRD cumulative costs', () => {
    expect(costToReach(b, 20)).toBe(47);
    expect(costToReach(b, 40)).toBe(135);
    expect(costToReach(b, 60)).toBe(263);
    expect(costToReach(b, 80)).toBe(431);
    expect(costToReach(b, 99)).toBe(628);
  });
  it('counts points spent across a stat block', () => {
    expect(pointsSpent(b, emptyStats())).toBe(0);
    expect(pointsSpent(b, stats({ STR: 20, INT: 11 }))).toBe(47 + 20);
  });
});

describe('Max HP and SP', () => {
  it('HP = (80 + 12L + 0.25L^2) x (1 + VIT/100)', () => {
    expect(maxHpFor(b, 1, 1)).toBeCloseTo((80 + 12 + 0.25) * 1.01, 6);
    expect(maxHpFor(b, 20, 40)).toBeCloseTo((80 + 240 + 100) * 1.4, 6);
  });
  it('SP = (20 + 3L + 0.05L^2) x (1 + INT/100)', () => {
    expect(maxSpFor(b, 20, 50)).toBeCloseTo((20 + 60 + 20) * 1.5, 6);
  });
  it('gear and percent bonuses apply after the base', () => {
    const d = deriveHero(b, {
      level: 20,
      stats: stats({ VIT: 40, INT: 50 }),
      weapon: sword,
      weaponAps: 1.25,
      bonuses: { ...zeroBonuses(), gearHp: 100, maxHpPct: 0.1, gearSp: 10, maxSpPct: 0.2 },
    });
    expect(d.maxHp).toBeCloseTo((420 * 1.4 + 100) * 1.1, 6);
    expect(d.maxSp).toBeCloseTo((100 * 1.5 + 10) * 1.2, 6);
  });
});

describe('ATK and MATK', () => {
  it('melee ATK = STR + floor(STR/10)^2 + floor(DEX/5) + floor(LUK/5) + weapon', () => {
    expect(atkFor(b, stats({ STR: 40, DEX: 25, LUK: 10 }), sword)).toBe(40 + 16 + 5 + 2 + 12);
  });
  it('bow and gun ATK use DEX as the main stat', () => {
    const bow = { type: 'bow', atk: 12, matk: 0, refine: 0 } as const;
    expect(atkFor(b, stats({ STR: 10, DEX: 40, LUK: 10 }), bow)).toBe(40 + 16 + 2 + 2 + 12);
  });
  it('knuckles with a gun skill still use the melee formula', () => {
    const knuckle = { type: 'knuckle', atk: 8, matk: 0, refine: 0 } as const;
    expect(atkFor(b, stats({ STR: 70, DEX: 50 }), knuckle)).toBe(70 + 49 + 10 + 0 + 8);
  });
  it('refine multiplies weapon ATK and flat bonuses add', () => {
    expect(atkFor(b, stats({}), { ...sword, refine: 0.5 }, 3)).toBe(1 + 0 + 0 + 0 + 18 + 3);
  });
  it('MATK rolls between INT + floor(INT/7)^2 and INT + floor(INT/5)^2 plus weapon', () => {
    const staff = { type: 'staff', atk: 4, matk: 12, refine: 0.1 } as const;
    const r = matkRange(b, stats({ INT: 35 }), staff);
    expect(r.min).toBeCloseTo(35 + 25 + 13.2, 6);
    expect(r.max).toBeCloseTo(35 + 49 + 13.2, 6);
  });
});

describe('hit, flee and dodge', () => {
  it('HIT = L + DEX and FLEE = L + AGI', () => {
    expect(hitFor(b, 20, 30, 5)).toBe(55);
    expect(fleeFor(b, 20, 15, 2)).toBe(37);
  });
  it('hit chance = 80 + HIT - FLEE, clamped to 15..100', () => {
    expect(hitChancePct(b, 50, 40)).toBe(90);
    expect(hitChancePct(b, 10, 200)).toBe(15);
    expect(hitChancePct(b, 200, 10)).toBe(100);
  });
  it('perfect dodge = 1 + LUK/10, capped at 30', () => {
    expect(perfectDodgePct(b, 40)).toBeCloseTo(5, 6);
    expect(perfectDodgePct(b, 999)).toBe(30);
  });
  it('crit chance = 1 + 0.3 LUK plus bonuses, capped at 80', () => {
    expect(critPct(b, 40)).toBeCloseTo(13, 6);
    expect(critPct(b, 40, 5)).toBeCloseTo(18, 6);
    expect(critPct(b, 999)).toBe(80);
  });
  it('crit damage is x1.5 plus bonuses', () => {
    const d = deriveHero(b, {
      level: 1,
      stats: emptyStats(),
      weapon: sword,
      weaponAps: 1,
      bonuses: { ...zeroBonuses(), critDamage: 0.25 },
    });
    expect(d.critMult).toBeCloseTo(1.75, 6);
  });
});

describe('attack speed, cast time and cooldown reduction', () => {
  it('APS = weapon APS x (1 + 0.008 AGI + 0.002 DEX + bonus), capped at 3', () => {
    expect(apsFor(b, 1.25, 50, 10)).toBeCloseTo(1.25 * (1 + 0.4 + 0.02), 6);
    expect(apsFor(b, 1.25, 50, 10, 0.3)).toBeCloseTo(1.25 * 1.72, 6);
    expect(apsFor(b, 1.7, 99, 99, 2)).toBe(3);
  });
  it('cast time = base x max(0.2, 1 - DEX/150 - bonus)', () => {
    expect(castMultFor(b, 30)).toBeCloseTo(0.8, 6);
    expect(castMultFor(b, 30, 0.2)).toBeCloseTo(0.6, 6);
    expect(castMultFor(b, 150, 0.5)).toBe(0.2);
  });
  it('cooldown reduction comes from gear and passives only, capped at 40%', () => {
    expect(cdrPctFor(b, 15)).toBe(15);
    expect(cdrPctFor(b, 90)).toBe(40);
  });
});

describe('defense and regeneration', () => {
  it('DEF = armor + 0.5 VIT + 0.25 L', () => {
    expect(defFor(b, 20, 40, 6)).toBeCloseTo(6 + 20 + 5, 6);
  });
  it('MDEF = gear + 0.5 INT + 0.2 VIT + 0.25 L', () => {
    expect(mdefFor(b, 20, 50, 40, 3)).toBeCloseTo(3 + 25 + 8 + 5, 6);
  });
  it('damage taken x 100 / (100 + DEF), reduction at most 80%', () => {
    expect(defenseFactor(b, 100, 80)).toBeCloseTo(0.5, 6);
    expect(defenseFactor(b, 0, 80)).toBe(1);
    expect(defenseFactor(b, 9999, 80)).toBeCloseTo(0.2, 6);
  });
  it('HP regen = 0.2% of Max HP + 0.05 VIT, x5 after 4 s without damage', () => {
    expect(hpRegenFor(b, 1000, 40, false)).toBeCloseTo(2 + 2, 6);
    expect(hpRegenFor(b, 1000, 40, true)).toBeCloseTo(20, 6);
  });
  it('SP regen = 0.5 + 0.4% of Max SP + 0.04 INT, x3 out of combat', () => {
    expect(spRegenFor(b, 200, 50, false)).toBeCloseTo(0.5 + 0.8 + 2, 6);
    expect(spRegenFor(b, 200, 50, true)).toBeCloseTo(3.3 * 3, 6);
    expect(spRegenFor(b, 200, 50, false, 1.5)).toBeCloseTo(4.8, 6);
  });
});

describe('status resist, drops and speed', () => {
  it('stun, poison and bleed resist by 0.4% x (VIT + LUK/2)', () => {
    expect(statusResistPct(b, stats({ VIT: 40, LUK: 20 }), 'stun')).toBeCloseTo(0.4 * 50, 6);
    expect(statusResistPct(b, stats({ VIT: 40, LUK: 20 }), 'bleed')).toBeCloseTo(20, 6);
  });
  it('freeze, silence, curse and blind resist by INT instead', () => {
    expect(statusResistPct(b, stats({ INT: 60, LUK: 20 }), 'freeze')).toBeCloseTo(0.4 * 70, 6);
    expect(statusResistPct(b, stats({ INT: 60, LUK: 0 }), 'silence')).toBeCloseTo(0.4 * 60, 6);
  });
  it('other statuses have no base resist, and the cap is 75%', () => {
    expect(statusResistPct(b, stats({ VIT: 99 }), 'burn')).toBe(0);
    expect(statusResistPct(b, stats({ VIT: 99, LUK: 99 }), 'stun', 90)).toBe(75);
  });
  it('drop rate gains +0.3% (relative) per LUK, capped at +100%', () => {
    expect(dropBonusFor(b, 40)).toBeCloseTo(0.12, 6);
    expect(dropBonusFor(b, 40, 0.1)).toBeCloseTo(0.22, 6);
    expect(dropBonusFor(b, 999, 5)).toBe(1);
  });
  it('move speed is 5.0 m/s plus bonuses, capped at +60%', () => {
    expect(moveSpeedFor(b)).toBe(5);
    expect(moveSpeedFor(b, 0.2)).toBeCloseTo(6, 6);
    expect(moveSpeedFor(b, 5)).toBeCloseTo(8, 6);
  });
});

describe('monster curves and EXP (Section 13)', () => {
  it('monster stats follow the level formulas with per-monster multipliers', () => {
    const m = monsterStats(b, 10);
    expect(m.hp).toBeCloseTo(20 + 80 + 12, 6);
    expect(m.atk).toBeCloseTo(6 + 26 + 3, 6);
    expect(m.def).toBeCloseTo(11, 6);
    expect(m.mdef).toBeCloseTo(10, 6);
    expect(m.hit).toBeCloseTo(35, 6);
    expect(m.flee).toBeCloseTo(22, 6);
    const golem = monsterStats(b, 10, { hp: 1.5, def: 2 });
    expect(golem.hp).toBeCloseTo(112 * 1.5, 6);
    expect(golem.def).toBeCloseTo(22, 6);
  });
  it('EXP per kill is 10 x 1.06^m + 2m and kills per level match the PRD', () => {
    expect(expMonster(b, 1)).toBeCloseTo(10.6 + 2, 6);
    const kills = (L: number) => expToNext(b, L) / expMonster(b, L);
    expect(kills(1)).toBeCloseTo(17.04, 2);
    expect(Math.round(kills(30))).toBe(111);
    expect(Math.round(kills(60))).toBe(279);
    expect(Math.round(kills(98))).toBe(595);
  });
  it('level gap = clamp(1 + 0.05 x gap, 0.1, 1.5)', () => {
    expect(levelGapFactor(b, 10, 10)).toBe(1);
    expect(levelGapFactor(b, 10, 14)).toBeCloseTo(1.2, 6);
    expect(levelGapFactor(b, 10, 40)).toBe(1.5);
    expect(levelGapFactor(b, 40, 10)).toBe(0.1);
    expect(expForKill(b, 10, 14)).toBeCloseTo(expMonster(b, 14) * 1.2, 6);
  });
  it('gold per kill is 3 + 1.5 x monster level', () => {
    expect(goldForKill(b, 10)).toBe(18);
    expect(goldForKill(b, 10, 8)).toBe(144);
  });
});
