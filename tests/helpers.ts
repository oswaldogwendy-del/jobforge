import { balance } from '../src/data/schema';
import { buildFromPreset, skillMap } from '../src/data/content';
import type { MonsterDef, SkillDef } from '../src/data/types';
import { rebuildSlots } from '../src/sim/engine';
import { defaultContent, SimWorld, type Content, type TickInput } from '../src/sim/world';
import { makeUnit } from '../src/sim/unit';
import type { Unit } from '../src/sim/types';

export const DT = 1 / balance.tickRate;
export const still: TickInput = { moveX: 0, moveZ: 0, casts: [] };

/** An empty arena: the yard's dummies are removed, so a test places exactly what it needs. */
export function world(
  preset: 'warrior' | 'caster' = 'warrior',
  seed = 1,
  content: Content = defaultContent,
): SimWorld {
  const w = new SimWorld({ build: buildFromPreset(preset), seed, mode: 'yard', content });
  for (let i = 0; i < w.units.length; i++) w.units[i] = makeUnit({ id: -1, alive: false });
  w.hero.x = w.hero.px = 0;
  w.hero.z = w.hero.pz = 0;
  w.hero.heading = 0; // facing +z
  return w;
}

/** Makes the hero hit reliably and never crit, so damage assertions are not random. */
export function steady(w: SimWorld): void {
  w.hero.hit = 99999;
  w.hero.critPct = 0;
}

export function dummyDef(): MonsterDef {
  return defaultContent.monsters.get('training_dummy')!;
}

/** A training dummy with chosen position, HP and (optionally) stats. */
export function dummyAt(
  w: SimWorld,
  x: number,
  z: number,
  hp = 100000,
  o: Partial<Unit> = {},
): Unit {
  const u = w.spawnMonster(dummyDef(), x, z, 1, {})!;
  u.maxHp = hp;
  u.hp = hp;
  u.flee = 0;
  u.def = 0;
  u.mdef = 0;
  u.base.def = 0;
  u.base.mdef = 0;
  Object.assign(u, o);
  return u;
}

export function monsterAt(w: SimWorld, id: string, x: number, z: number, level = 5): Unit {
  const def = w.content.monsters.get(id) ?? w.content.bosses.get(id)!;
  return w.spawnMonster(def, x, z, level, {})!;
}

/** Registers a skill (usually a fixture) and puts it in a slot at a rank. */
export function giveSkill(w: SimWorld, def: SkillDef, slot = 0, rank = 1): void {
  w.skillDefs.set(def.id, def);
  w.build.learned[def.id] = rank;
  if (def.kind === 'passive') {
    const i = w.build.passives.findIndex((p) => p === null);
    w.build.passives[i < 0 ? 0 : i] = def.id;
  } else {
    w.build.actives[slot] = def.id;
  }
  rebuildSlots(w);
}

export function useSkill(w: SimWorld, id: string, slot = 0, rank?: number): void {
  const def = skillMap.get(id)!;
  giveSkill(w, def, slot, rank ?? w.build.learned[id] ?? 1);
}

export function fixture(o: Partial<SkillDef> & Pick<SkillDef, 'effects'>): SkillDef {
  return {
    id: 'fx_' + Math.random().toString(36).slice(2, 8),
    classId: 'knight',
    name: 'Fixture',
    tier: 1,
    kind: 'active',
    tags: [],
    req: {},
    gold: 0,
    maxRank: 5,
    target: 'self',
    range: 10,
    text: '',
    ...o,
  };
}

/** Runs the sim for some seconds with optional input and cast requests on the first tick. */
export function run(w: SimWorld, seconds: number, input: TickInput = still): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) w.tick(DT, i === 0 ? input : { ...input, casts: [] });
}

export function cast(w: SimWorld, slot: number, aim: { x: number; z: number } | null = null): void {
  w.tick(DT, { moveX: 0, moveZ: 0, casts: [{ slot, aim }] });
}

export function damageEvents(
  w: SimWorld,
): { amount: number; crit: boolean; toHero: boolean; targetId: number }[] {
  return w.events.filter((e) => e.t === 'dmg' && !e.heal).map((e) => e as never);
}
