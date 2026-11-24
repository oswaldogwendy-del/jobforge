import { z } from 'zod';
import type {
  BossDef,
  ClassDef,
  EffectDef,
  MonsterDef,
  SkillDef,
  SummonDef,
  ZoneDef,
} from './types';

// zod schemas for classes and skills (PRD Section 16). Strict objects, so a typo in a JSON key
// fails loudly instead of being ignored.

const num = z.number().finite();
const ranked = z.union([num, z.tuple([num, num])]);
const element = z.enum([
  'neutral',
  'fire',
  'water',
  'wind',
  'earth',
  'poison',
  'holy',
  'shadow',
  'ghost',
  'undead',
]);
const statusId = z.enum([
  'stun',
  'freeze',
  'root',
  'slow',
  'burn',
  'poison',
  'bleed',
  'blind',
  'silence',
  'curse',
  'mark',
  'taunt',
]);
const shape = z.enum(['circle', 'cone', 'line', 'donut', 'cross']);
const stat = z.enum(['STR', 'AGI', 'VIT', 'INT', 'DEX', 'LUK']);
const weaponType = z.enum([
  'sword',
  'greataxe',
  'dagger',
  'mace',
  'knuckle',
  'staff',
  'bow',
  'gun',
]);
const statMod = z.strictObject({
  stat: z.string(),
  add: ranked.optional(),
  pct: ranked.optional(),
});
const atRank = { atRank: z.number().int().min(1).max(5).optional() };

export const effectSchema: z.ZodType<EffectDef> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal('damage'),
      ...atRank,
      school: z.enum(['physical', 'magic']),
      element: z.union([element, z.literal('weapon')]).optional(),
      atk: ranked.optional(),
      matk: ranked.optional(),
      hits: z.number().int().positive().optional(),
      canCrit: z.boolean().optional(),
      ignoreDefPct: num.optional(),
      bonusIfStatus: z.strictObject({ status: statusId, pct: num }).optional(),
      chain: z.strictObject({ jumps: ranked, radius: num, falloff: num }).optional(),
    }),
    z.strictObject({
      type: z.literal('projectile'),
      ...atRank,
      speed: num,
      radius: num,
      count: ranked.optional(),
      spreadDeg: num.optional(),
      pierce: z.number().int().optional(),
      homing: z.boolean().optional(),
      bounce: ranked.optional(),
      onHit: z.array(effectSchema),
    }),
    z.strictObject({
      type: z.literal('area'),
      ...atRank,
      shape,
      at: z.enum(['self', 'target', 'ground']),
      radius: num.optional(),
      angleDeg: num.optional(),
      length: num.optional(),
      width: num.optional(),
      inner: num.optional(),
      delay: num.optional(),
      duration: num.optional(),
      tick: num.optional(),
      scatter: z.strictObject({ count: ranked, hitRadius: num }).optional(),
      onTick: z.array(effectSchema),
    }),
    z.strictObject({
      type: z.literal('heal'),
      ...atRank,
      who: z.enum(['self', 'summons', 'selfAndSummons']),
      matk: ranked.optional(),
      maxHpPct: ranked.optional(),
      radius: num.optional(),
    }),
    z.strictObject({
      type: z.literal('shield'),
      ...atRank,
      maxHpPct: ranked.optional(),
      matk: ranked.optional(),
      duration: ranked,
    }),
    z.strictObject({
      type: z.literal('status'),
      ...atRank,
      status: statusId,
      duration: ranked,
      chance: ranked.optional(),
      power: ranked.optional(),
    }),
    z.strictObject({
      type: z.enum(['buff', 'debuff']),
      ...atRank,
      mods: z.array(statMod),
      duration: ranked,
      who: z.enum(['self', 'summons', 'selfAndSummons', 'targets']).optional(),
      immune: z.array(z.union([statusId, z.literal('knockback')])).optional(),
      key: z.string().optional(),
    }),
    z.strictObject({
      type: z.literal('dash'),
      ...atRank,
      distance: num,
      speed: num,
      to: z.enum(['direction', 'behindTarget', 'point']).optional(),
      iframes: num.optional(),
      onArrive: z.array(effectSchema).optional(),
      onPass: z.array(effectSchema).optional(),
    }),
    z.strictObject({
      type: z.literal('summon'),
      ...atRank,
      unitId: z.string(),
      count: ranked,
      duration: num,
      maxAlive: ranked,
    }),
    z.strictObject({
      type: z.literal('displace'),
      ...atRank,
      kind: z.enum(['knockback', 'pull']),
      distance: num,
    }),
    z.strictObject({ type: z.literal('taunt'), ...atRank, radius: num, duration: ranked }),
    z.strictObject({ type: z.literal('cleanse'), ...atRank, count: z.number().int().positive() }),
    z.strictObject({
      type: z.literal('resource'),
      ...atRank,
      resource: z.enum(['orbs', 'coins']),
      amount: z.union([num, z.literal('all')]),
      spend: z.boolean().optional(),
    }),
    z.strictObject({ type: z.literal('toggle'), ...atRank, mods: z.array(statMod), spPerSec: num }),
    z.strictObject({
      type: z.literal('trigger'),
      ...atRank,
      on: z.enum([
        'hit',
        'crit',
        'kill',
        'block',
        'damaged',
        'lowHp',
        'dodge',
        'lethal',
        'summonDeath',
      ]),
      chance: ranked.optional(),
      icd: ranked.optional(),
      threshold: num.optional(),
      effects: z.array(effectSchema),
    }),
    z.strictObject({
      type: z.literal('modifier'),
      ...atRank,
      mods: z.array(statMod),
      tags: z.array(z.string()).optional(),
    }),
  ]),
) as z.ZodType<EffectDef>;

export const skillSchema: z.ZodType<SkillDef> = z.strictObject({
  id: z.string(),
  classId: z.string(),
  name: z.string(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  kind: z.enum(['active', 'passive', 'toggle']),
  tags: z.array(z.string()),
  req: z.partialRecord(stat, num),
  gold: num.nonnegative(),
  maxRank: z.union([z.literal(3), z.literal(5)]),
  target: z.enum(['self', 'enemy', 'direction', 'ground']).optional(),
  range: num.optional(),
  cast: num.optional(),
  cooldown: ranked.optional(),
  sp: ranked.optional(),
  goldPerUse: z.strictObject({ base: num, perLevel: num }).optional(),
  hpCostPct: num.optional(),
  affinity: z.array(weaponType).optional(),
  effects: z.array(effectSchema),
  anim: z.string().optional(),
  vfx: z.string().optional(),
  sfx: z.string().optional(),
  ai: z
    .strictObject({
      priority: num,
      when: z.enum(['always', 'enemiesInRange', 'hpBelow', 'boss']).optional(),
      value: num.optional(),
    })
    .optional(),
  text: z.string(),
}) as z.ZodType<SkillDef>;

export const classSchema: z.ZodType<ClassDef> = z.strictObject({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  primary: stat,
  secondary: stat,
  affinity: z.array(weaponType),
  unlock: z.union([
    z.strictObject({ type: z.literal('start') }),
    z.strictObject({ type: z.literal('boss'), bossId: z.string() }),
  ]),
  blurb: z.string(),
}) as z.ZodType<ClassDef>;

export const skillTierGold: Record<number, number> = { 1: 100, 2: 600, 3: 2500, 4: 8000, 5: 25000 };

const race = z.enum([
  'formless',
  'undead',
  'brute',
  'plant',
  'insect',
  'demon',
  'humanoid',
  'dragon',
]);
const archetype = z.enum([
  'dummy',
  'chaser',
  'kiter',
  'caster',
  'charger',
  'swarmer',
  'burrower',
  'exploder',
  'support',
  'splitter',
]);

const attackSchema = z.strictObject({
  id: z.string(),
  weight: num.nonnegative(),
  cooldown: num.nonnegative(),
  range: num.nonnegative(),
  telegraph: z
    .strictObject({
      shape,
      at: z.enum(['self', 'target', 'targetLocked']),
      radius: num.optional(),
      angleDeg: num.optional(),
      length: num.optional(),
      width: num.optional(),
      inner: num.optional(),
      warn: num.positive(),
    })
    .optional(),
  projectile: z
    .strictObject({
      speed: num.positive(),
      count: z.number().int().positive().optional(),
      spreadDeg: num.optional(),
    })
    .optional(),
  damage: z
    .strictObject({
      atkPct: num.nonnegative(),
      element: element.optional(),
      status: z
        .strictObject({ id: statusId, chance: num.min(0).max(1), duration: num.positive() })
        .optional(),
    })
    .optional(),
  displace: z.strictObject({ kind: z.enum(['knockback', 'pull']), distance: num }).optional(),
  summon: z.strictObject({ monsterId: z.string(), count: z.number().int().positive() }).optional(),
  script: z.string().optional(),
});

const monsterShape = {
  id: z.string(),
  name: z.string(),
  zoneId: z.string(),
  race,
  element,
  archetype,
  model: z.string(),
  mult: z
    .strictObject({
      hp: num.positive().optional(),
      atk: num.positive().optional(),
      def: num.positive().optional(),
      mdef: num.positive().optional(),
      hit: num.positive().optional(),
      flee: num.positive().optional(),
      speed: num.positive().optional(),
      aps: num.positive().optional(),
    })
    .optional(),
  moveSpeed: num.nonnegative(),
  aggroRange: num.nonnegative(),
  packSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  attacks: z.array(attackSchema),
  cardId: z.string(),
  radius: num.positive().optional(),
  elite: z.boolean().optional(),
};
export const monsterSchema: z.ZodType<MonsterDef> = z.strictObject(
  monsterShape,
) as z.ZodType<MonsterDef>;

export const bossSchema: z.ZodType<BossDef> = z.strictObject({
  ...monsterShape,
  level: z.number().int().positive(),
  hpMult: num.positive(),
  arenaRadius: num.positive(),
  phases: z.array(
    z.strictObject({
      belowHpPct: num,
      attacks: z.array(z.string()),
      onEnter: z.string().optional(),
    }),
  ),
  enrage: z.strictObject({ atSec: num.positive(), mods: z.array(statMod) }),
  legendaryIds: z.tuple([z.string(), z.string()]),
  firstKill: z.strictObject({
    unlockClasses: z.array(z.string()).optional(),
    unlockZone: z.string().optional(),
    activeSlots: z.number().optional(),
    passiveSlots: z.number().optional(),
    presets: z.number().optional(),
    feature: z.enum(['tower', 'refine10', 'nightmare']).optional(),
    guaranteedItemId: z.string().optional(),
  }),
}) as z.ZodType<BossDef>;

export const zoneSchema: z.ZodType<ZoneDef> = z.strictObject({
  id: z.string(),
  name: z.string(),
  levels: z.tuple([z.number().int(), z.number().int()]),
  element,
  field: z.strictObject({
    size: z.tuple([num.positive(), num.positive()]),
    seed: z.number().int(),
    fog: z.string(),
    spawnPoints: z.array(z.strictObject({ x: num, z: num, level: z.number().int().positive() })),
    obstacles: z.array(
      z.strictObject({ x: num, z: num, r: num.optional(), w: num.optional(), d: num.optional() }),
    ),
    props: z.array(z.strictObject({ model: z.string(), x: num, z: num, rot: num, scale: num })),
  }),
  monsters: z.array(z.strictObject({ id: z.string(), weight: num.positive() })),
  eliteId: z.string(),
  eliteEverySec: num.positive(),
  bossId: z.string(),
  gauge: z.strictObject({ full: num.positive(), normal: num.positive(), elite: num.positive() }),
  maxAlive: z.number().int().positive(),
  respawnSec: num.positive(),
  materialId: z.string(),
}) as z.ZodType<ZoneDef>;

export const summonSchema: z.ZodType<SummonDef> = z.strictObject({
  id: z.string(),
  model: z.string(),
  hpPctOfOwner: num.positive(),
  archetype: z.enum(['chaser', 'kiter']),
  attack: z.strictObject({
    school: z.enum(['physical', 'magic']),
    element,
    atk: ranked.optional(),
    matk: ranked.optional(),
    aps: num.positive(),
    range: num.positive(),
  }),
  taunt: z.strictObject({ radius: num.positive() }).optional(),
}) as z.ZodType<SummonDef>;
