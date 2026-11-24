import { z } from 'zod';
import classesJson from './classes.json';
import devHeroJson from './devHero.json';
import {
  bossSchema,
  classSchema,
  monsterSchema,
  skillSchema,
  summonSchema,
  zoneSchema,
} from './contentSchema';
import bossesJson from './bosses.json';
import monstersJson from './monsters.json';
import summonsJson from './summons.json';
import zonesJson from './zones.json';
import { balance, modelMap, parseOrThrow } from './schema';
import type {
  BossDef,
  ClassDef,
  MonsterDef,
  SkillDef,
  Stat,
  SummonDef,
  WeaponType,
  ZoneDef,
} from './types';
import { STAT_IDS } from './types';
import type { HeroBuild } from '../sim/loadout';
import skillsJson from './skills.json';

export const classes: ClassDef[] = parseOrThrow('classes.json', z.array(classSchema), classesJson);
export const skills: SkillDef[] = parseOrThrow('skills.json', z.array(skillSchema), skillsJson);
export const monsters: MonsterDef[] = parseOrThrow(
  'monsters.json',
  z.array(monsterSchema),
  monstersJson,
);
export const bosses: BossDef[] = parseOrThrow('bosses.json', z.array(bossSchema), bossesJson);
export const zones: ZoneDef[] = parseOrThrow('zones.json', z.array(zoneSchema), zonesJson);
export const summons: SummonDef[] = parseOrThrow(
  'summons.json',
  z.array(summonSchema),
  summonsJson,
);
export const skillMap: Map<string, SkillDef> = new Map(skills.map((s) => [s.id, s]));
export const classMap: Map<string, ClassDef> = new Map(classes.map((c) => [c.id, c]));

const statBlock = z.object(
  Object.fromEntries(STAT_IDS.map((k) => [k, z.number().int().min(1)])) as Record<
    Stat,
    z.ZodNumber
  >,
);
const slots = (n: number) => z.array(z.string().nullable()).length(n);
const presetSchema = z.strictObject({
  label: z.string(),
  weapon: z.enum(['sword', 'greataxe', 'dagger', 'mace', 'knuckle', 'staff', 'bow', 'gun']),
  stats: statBlock,
  learned: z.record(z.string(), z.number().int().min(1).max(5)),
  actives: slots(balance.loadout.actives),
  passives: slots(balance.loadout.passives),
});
const devHeroSchema = z.strictObject({
  name: z.string(),
  level: z.number().int().min(1).max(99),
  gold: z.number().nonnegative(),
  weapon: z.strictObject({ type: z.string(), tier: z.number().int().min(1).max(6) }),
  armorTier: z.number().int().min(1).max(6),
  presets: z.record(z.string(), presetSchema),
});
export const devHero = parseOrThrow('devHero.json', devHeroSchema, devHeroJson);
export type DevPreset = z.infer<typeof presetSchema>;

// Cross-file references must resolve, and a bad one names the file and entry.
{
  const monsterIds = new Set([...monsters, ...bosses].map((m) => m.id));
  for (const m of [...monsters, ...bosses]) {
    if (m.model !== 'dummy' && !modelMap.monsters[m.model])
      throw new Error(`monsters.json: ${m.id}: model ${m.model} is not in modelMap.json`);
    for (const a of m.attacks)
      if (a.summon && !monsterIds.has(a.summon.monsterId))
        throw new Error(`monsters.json: ${m.id}.${a.id}: unknown summon ${a.summon.monsterId}`);
  }
  for (const b of bosses) {
    const ids = new Set(b.attacks.map((a) => a.id));
    for (const ph of b.phases)
      for (const a of ph.attacks)
        if (!ids.has(a)) throw new Error(`bosses.json: ${b.id}: phase lists unknown attack ${a}`);
  }
  for (const z of zones) {
    for (const m of z.monsters)
      if (!monsterIds.has(m.id)) throw new Error(`zones.json: ${z.id}: unknown monster ${m.id}`);
    if (!monsterIds.has(z.eliteId))
      throw new Error(`zones.json: ${z.id}: unknown elite ${z.eliteId}`);
    if (!bosses.some((b) => b.id === z.bossId))
      throw new Error(`zones.json: ${z.id}: unknown boss ${z.bossId}`);
  }
}

// Every skill reference must point at a real skill, and every class at a real class.
for (const s of skills) {
  if (!classMap.has(s.classId))
    throw new Error(`skills.json: ${s.id}: unknown classId ${s.classId}`);
}
for (const [k, p] of Object.entries(devHero.presets)) {
  for (const id of [...Object.keys(p.learned), ...p.actives, ...p.passives]) {
    if (id && !skillMap.has(id)) throw new Error(`devHero.json: presets.${k}: unknown skill ${id}`);
  }
}

/** A fresh hero build from a dev preset (the Guild Hall and Status window arrive in M2). */
export function buildFromPreset(key: string): HeroBuild {
  const p = devHero.presets[key];
  if (!p) throw new Error(`devHero.json: no preset ${key}`);
  return {
    name: devHero.name,
    level: devHero.level,
    gold: devHero.gold,
    stats: { ...p.stats },
    weapon: { type: p.weapon as WeaponType, tier: devHero.weapon.tier },
    armorTier: devHero.armorTier,
    learned: { ...p.learned },
    actives: [...p.actives],
    passives: [...p.passives],
  };
}
