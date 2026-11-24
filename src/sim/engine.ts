import { rv } from './ranked';
import type { EffectDef, Element, SkillDef, Stat, StatusId } from '../data/types';
import { STAT_IDS } from '../data/types';
import { dealHit, forEachEnemyOf, healUnit, nearestEnemy, targetable } from './combat';
import { dist, headingOf, inShape, blankShape, type ShapeSpec } from './geometry';
import { bonusesFromMods, resolveMods, sumMod } from './mods';
import { applyStatus, canCast, cleanse, hasStatus, isDot } from './status';
import type { BuffInst, FxCtx, ModEntry, Projectile, SlotSkill, Unit } from './types';
import type { SimWorld } from './world';
import { bodyArmorDef, weaponStats } from './gear';
import { reqMet, reqStats } from './loadout';
import { deriveHero, statusResistPct, zeroBonuses } from './stats';

const STATUS_IDS: StatusId[] = [
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
];

export const ELEMENT_COLOR: Record<string, string> = {
  neutral: '#ffffff',
  fire: '#ff8a3d',
  water: '#59d4ff',
  wind: '#d6ff7a',
  earth: '#a67c52',
  poison: '#7ddf64',
  holy: '#ffe27a',
  shadow: '#a050e0',
  ghost: '#b8d8ff',
  undead: '#8fa88a',
};
const ELEMENTS = Object.keys(ELEMENT_COLOR);

export function skillColor(def: SkillDef | null): string {
  const el = def?.tags.find((t) => ELEMENTS.includes(t));
  return ELEMENT_COLOR[el ?? 'neutral'];
}

export type CastResult =
  'ok' | 'cooldown' | 'noSp' | 'noGold' | 'noTarget' | 'blocked' | 'busy' | 'invalid' | 'toggled';

// --- Modifiers ---------------------------------------------------------------------------------

/** Sum of a stat over a unit's passive, toggle and buff modifiers (tag-filtered). */
export function sumUnitMods(
  w: SimWorld,
  u: Unit,
  stat: string,
  tags?: string[],
): { add: number; pct: number } {
  let add = 0;
  let pct = 0;
  if (u.kind === 'hero') {
    const a = sumMod(w.hs.passiveMods, stat, tags);
    const b = sumMod(w.hs.toggleMods, stat, tags);
    add += a.add + b.add;
    pct += a.pct + b.pct;
  }
  for (const buff of u.buffs) {
    const m = sumMod(buff.mods, stat, tags);
    add += m.add;
    pct += m.pct;
  }
  return { add, pct };
}

function buffMods(u: Unit): ModEntry[] {
  const out: ModEntry[] = [];
  for (const b of u.buffs) out.push(...b.mods);
  return out;
}

/** Rebuilds the hero's combat numbers from the build, passives, toggles and buffs. */
export function refreshHero(w: SimWorld): void {
  const h = w.hero;
  const hs = w.hs;
  const b = w.b;
  const mods = [...hs.passiveMods, ...hs.toggleMods, ...buffMods(h)];
  const stats = { ...w.build.stats };
  const gear = w.build.gear;
  for (const k of STAT_IDS) stats[k] += sumMod(mods, k).add + (gear?.stats[k] ?? 0);
  const bw = w.build.weapon;
  const weapon =
    bw.atk !== undefined || bw.matk !== undefined
      ? {
          type: bw.type,
          atk: bw.atk ?? 0,
          matk: bw.matk ?? 0,
          refine: bw.refine ?? 0,
        }
      : weaponStats(b, bw.type, bw.tier);
  const bonuses = bonusesFromMods(mods, {
    ...zeroBonuses(),
    gearDef: gear ? gear.def : bodyArmorDef(b, w.build.armorTier),
    gearMdef: gear?.mdef ?? 0,
    maxHpPct: gear?.maxHpPct ?? 0,
    maxSpPct: gear?.maxSpPct ?? 0,
    flee: gear?.flee ?? 0,
    moveSpeedPct: gear?.moveSpeedPct ?? 0,
  });
  const d = deriveHero(b, {
    level: w.build.level,
    stats,
    weapon,
    weaponAps: b.weapons[w.build.weapon.type].aps,
    bonuses,
  });
  const ratio = h.maxHp > 0 ? h.hp / h.maxHp : 1;
  const spRatio = h.maxSp > 0 ? h.sp / h.maxSp : 1;
  h.maxHp = d.maxHp;
  h.maxSp = d.maxSp;
  if (h.alive) {
    h.hp = Math.min(h.maxHp, Math.max(1, ratio * h.maxHp));
    h.sp = Math.min(h.maxSp, spRatio * h.maxSp);
  }
  Object.assign(h.base, {
    atk: d.atk,
    matkMin: d.matkMin,
    matkMax: d.matkMax,
    def: d.def,
    mdef: d.mdef,
    hit: d.hit,
    flee: d.flee,
    moveSpeed: d.moveSpeed,
    aps: d.aps,
  });
  h.atk = d.atk;
  h.matkMin = d.matkMin;
  h.matkMax = d.matkMax;
  h.def = d.def;
  h.mdef = d.mdef;
  h.hit = d.hit;
  h.flee = d.flee;
  h.critPct = d.critPct;
  h.critMult = d.critMult;
  h.aps = d.aps;
  h.moveSpeed = d.moveSpeed;
  h.perfectDodgePct = d.perfectDodgePct;
  h.damageReduction = Math.min(0.85, sumMod(mods, 'damageReduction').pct);
  for (const id of STATUS_IDS) h.resist[id] = statusResistPct(b, stats, id);
  hs.dropBonus = d.dropBonus;
  hs.goldBonus = d.goldBonus;
  hs.healOnKillPct = gear?.healOnKillPct ?? 0;
  hs.castMult = d.castMult;
  hs.cdrPct = d.cdrPct;
}

/** Applies buff and debuff modifiers to a non-hero unit's base numbers. */
export function refreshUnit(w: SimWorld, u: Unit): void {
  if (u.kind === 'hero') return refreshHero(w);
  const m = (stat: string) => sumMod(buffMods(u), stat);
  const def = m('def');
  const mdef = m('mdef');
  u.def = Math.max(0, u.base.def * (1 + def.pct) + def.add);
  u.mdef = Math.max(0, u.base.mdef * (1 + mdef.pct) + mdef.add);
  u.atk = u.base.atk * (1 + m('atkPct').pct);
  u.moveSpeed = u.base.moveSpeed * (1 + m('moveSpeed').pct);
  u.aps = u.base.aps * (1 + m('aps').pct);
  u.damageReduction = Math.min(0.85, m('damageReduction').pct);
}

/** Resolves the build's equipped skills into slots and passive modifiers. */
export function rebuildSlots(w: SimWorld): void {
  const hs = w.hs;
  const build = w.build;
  const resolve = (id: string | null): SlotSkill | null => {
    if (!id) return null;
    const def = w.skillDefs.get(id);
    const rank = build.learned[id];
    if (!def || !rank) return null;
    // A skill whose requirement is no longer met is dormant: learned, but it cannot be used.
    if (!reqMet(def.req, reqStats(build))) return null;
    return { def, rank };
  };
  hs.slots = build.actives.map(resolve);
  hs.passives = build.passives.map(resolve).filter((s): s is SlotSkill => s !== null);
  hs.cooldown = hs.slots.map(() => 0);
  hs.cooldownMax = hs.slots.map((s) => (s ? rv(s.def.cooldown, s.rank, s.def.maxRank, 0) : 0));
  hs.toggles = [];
  hs.toggleMods = [];
  hs.passiveMods = [];
  for (const p of hs.passives) {
    for (const e of p.def.effects) {
      if (e.type !== 'modifier') continue;
      if (e.atRank && p.rank < e.atRank) continue;
      hs.passiveMods.push(...resolveMods(e.mods, p.rank, p.def.maxRank, e.tags));
    }
  }
  refreshHero(w);
}

// --- Casting -----------------------------------------------------------------------------------

export function spCostOf(w: SimWorld, def: SkillDef, rank: number): number {
  const base = rv(def.sp, rank, def.maxRank, 0);
  const mult = Math.max(0, 1 + sumUnitMods(w, w.hero, 'spCostPct').pct);
  return base * mult;
}

export function cooldownOf(w: SimWorld, def: SkillDef, rank: number): number {
  const base = rv(def.cooldown, rank, def.maxRank, 0);
  return base * (1 - w.hs.cdrPct / 100);
}

interface Aim {
  target: Unit | null;
  ax: number;
  az: number;
  heading: number;
}

function resolveAim(
  w: SimWorld,
  def: SkillDef,
  aim: { x: number; z: number } | null,
  lockedTarget?: Unit | null,
): Aim | null {
  const h = w.hero;
  const range = def.range ?? 10;
  const cfg = w.b.targeting;
  const focus = w.unitById(w.hs.focusId);
  const auto = (): Unit | null =>
    lockedTarget && targetable(lockedTarget)
      ? lockedTarget
      : focus && targetable(focus)
        ? focus
        : nearestEnemy(w, h, h.x, h.z, cfg.castTargetRange);
  const mk = (target: Unit | null, ax: number, az: number): Aim => {
    const d = dist(h.x, h.z, ax, az);
    return { target, ax, az, heading: d > 0.01 ? headingOf(ax - h.x, az - h.z) : h.heading };
  };
  const ahead = (): [number, number] => [
    h.x + Math.sin(h.heading) * 4,
    h.z + Math.cos(h.heading) * 4,
  ];
  switch (def.target ?? 'self') {
    case 'self':
      return mk(null, h.x + Math.sin(h.heading), h.z + Math.cos(h.heading));
    case 'enemy': {
      let t: Unit | null = null;
      // Dragging aims at a different enemy: snap to the nearest one under the aim point.
      if (aim) t = nearestEnemy(w, h, aim.x, aim.z, 3);
      t ??= auto();
      if (!t) return null;
      // Melee skills step toward the target, so they can start from the step distance plus reach.
      const reach = def.tags.includes('melee')
        ? range + w.b.weapons[w.build.weapon.type].range
        : range;
      if (dist(h.x, h.z, t.x, t.z) - t.r > reach) return null;
      return mk(t, t.x, t.z);
    }
    case 'direction': {
      if (aim) return mk(null, aim.x, aim.z);
      const t = auto();
      if (t) return mk(t, t.x, t.z);
      const [ax, az] = ahead();
      return mk(null, ax, az);
    }
    case 'ground': {
      let ax: number;
      let az: number;
      let t: Unit | null = null;
      if (aim) {
        ax = aim.x;
        az = aim.z;
      } else {
        t = auto();
        if (t) {
          ax = t.x;
          az = t.z;
        } else [ax, az] = ahead();
      }
      const d = dist(h.x, h.z, ax, az);
      if (d > range) {
        ax = h.x + ((ax - h.x) / d) * range;
        az = h.z + ((az - h.z) / d) * range;
      }
      return mk(t, ax, az);
    }
  }
}

/** Starts a cast from a skill slot. aim is a world point from the mouse cursor or a drag. */
export function tryCast(
  w: SimWorld,
  slot: number,
  aim: { x: number; z: number } | null,
): CastResult {
  const hs = w.hs;
  const h = w.hero;
  const ss = hs.slots[slot];
  const fail = (reason: CastResult): CastResult => {
    w.emit({ t: 'cast', slot, ok: false, reason });
    return reason;
  };
  if (!ss || !h.alive) return 'invalid';
  const def = ss.def;
  if (def.kind === 'passive') return 'invalid';
  if (!canCast(h)) return fail('blocked');
  if (hs.casting || hs.dash) return fail('busy');
  if (def.kind === 'toggle') return toggleSkill(w, slot);
  if (hs.cooldown[slot] > 0 || hs.gcd > 0) return fail('cooldown');
  const cost = spCostOf(w, def, ss.rank);
  if (h.sp + 1e-9 < cost) return fail('noSp');
  const goldCost = def.goldPerUse
    ? def.goldPerUse.base + def.goldPerUse.perLevel * w.build.level
    : 0;
  if (goldCost > w.build.gold) return fail('noGold');
  const a = resolveAim(w, def, aim);
  if (!a) {
    w.emit({ t: 'text', x: h.x, z: h.z, text: w.str.noTarget, color: '#ff8080' });
    return fail('noTarget');
  }
  // Melee-range skills step up to 4 m toward the target before striking.
  if (def.target === 'enemy' && a.target && def.tags.includes('melee')) {
    const reach = w.b.weapons[w.build.weapon.type].range + a.target.r;
    const d = dist(h.x, h.z, a.target.x, a.target.z);
    if (d > reach) {
      const step = Math.min(w.b.combat.meleeStepMax, d - reach + 0.2);
      const p = {
        x: h.x + ((a.target.x - h.x) / d) * step,
        z: h.z + ((a.target.z - h.z) / d) * step,
      };
      w.nav.collide(p, h.r);
      h.x = p.x;
      h.z = p.z;
    }
  }
  const total = (def.cast ?? 0) * hs.castMult;
  hs.gcd = w.b.combat.globalCooldown;
  h.heading = a.heading;
  if (total > 0) {
    hs.casting = {
      slot,
      t: 0,
      total,
      aimX: aim?.x ?? null,
      aimZ: aim?.z ?? null,
      targetId: a.target?.id ?? -1,
      fresh: true,
    };
    hs.swingSeq++;
    w.emit({ t: 'cast', slot, ok: true });
    return 'ok';
  }
  executeSkill(w, slot, a);
  return 'ok';
}

function toggleSkill(w: SimWorld, slot: number): CastResult {
  const hs = w.hs;
  const i = hs.toggles.indexOf(slot);
  if (i >= 0) hs.toggles.splice(i, 1);
  else hs.toggles.push(slot);
  recomputeToggleMods(w);
  return 'toggled';
}

function recomputeToggleMods(w: SimWorld): void {
  const hs = w.hs;
  hs.toggleMods = [];
  for (const slot of hs.toggles) {
    const ss = hs.slots[slot];
    if (!ss) continue;
    for (const e of ss.def.effects) {
      if (e.type === 'toggle') hs.toggleMods.push(...resolveMods(e.mods, ss.rank, ss.def.maxRank));
    }
  }
  refreshHero(w);
}

function makeCtx(w: SimWorld, caster: Unit, def: SkillDef | null, rank: number, a: Aim): FxCtx {
  const weapon = w.build.weapon.type;
  return {
    caster,
    skill: def,
    rank,
    maxRank: def?.maxRank ?? 5,
    tags: def ? [...def.tags] : [],
    heading: a.heading,
    aimX: a.ax,
    aimZ: a.az,
    target: a.target,
    affinity: !!def?.affinity?.includes(weapon) && caster.kind === 'hero',
    fromProc: false,
    spent: 0,
  };
}

/** Pays for a skill, starts its cooldown and runs its effects. */
function executeSkill(w: SimWorld, slot: number, a: Aim): void {
  const hs = w.hs;
  const h = w.hero;
  const ss = hs.slots[slot]!;
  const def = ss.def;
  h.sp = Math.max(0, h.sp - spCostOf(w, def, ss.rank));
  if (def.goldPerUse) w.build.gold -= def.goldPerUse.base + def.goldPerUse.perLevel * w.build.level;
  const cd = cooldownOf(w, def, ss.rank);
  hs.cooldown[slot] = cd;
  hs.cooldownMax[slot] = cd;
  hs.gcd = Math.max(hs.gcd, w.b.combat.globalCooldown);
  hs.swingSeq++;
  hs.swinging = false;
  hs.swingPending = false;
  h.heading = a.heading;
  h.pheading = a.heading;
  const ctx = makeCtx(w, h, def, ss.rank, a);
  const targets =
    def.target === 'enemy' && a.target ? [a.target] : def.target === 'self' ? [h] : [];
  runEffects(w, ctx, def.effects, targets, h.x, h.z);
}

/** Advances a cast in progress. Moving cancels it and spends nothing (PRD Section 5). */
export function updateCasting(w: SimWorld, dt: number, wantsMove: boolean): void {
  const hs = w.hs;
  const c = hs.casting;
  if (!c) return;
  const ss = hs.slots[c.slot];
  const cancel = (reason: string) => {
    hs.casting = null;
    hs.gcd = 0;
    w.emit({ t: 'cast', slot: c.slot, ok: false, reason });
  };
  if (!ss || !canCast(w.hero)) return cancel('blocked');
  if (c.fresh) c.fresh = false;
  else if (wantsMove) return cancel('moved');
  c.t += dt;
  if (c.t < c.total) return;
  const locked = w.unitById(c.targetId);
  if (ss.def.target === 'enemy' && (!locked || !targetable(locked))) return cancel('lost');
  const aim = c.aimX !== null && c.aimZ !== null ? { x: c.aimX, z: c.aimZ } : null;
  const a = resolveAim(w, ss.def, aim, locked);
  hs.casting = null;
  if (!a) return cancel('noTarget');
  executeSkill(w, c.slot, a);
}

// --- Effects -----------------------------------------------------------------------------------

function summonsOf(w: SimWorld, owner: Unit): Unit[] {
  return w.units.filter(
    (u) => u.id >= 0 && u.alive && u.kind === 'summon' && u.summon?.ownerId === owner.id,
  );
}

function avgMatk(u: Unit): number {
  return (u.matkMin + u.matkMax) / 2;
}

/** Runs an effect list in order against `targets`, from the origin point (ox, oz). */
export function runEffects(
  w: SimWorld,
  ctx: FxCtx,
  effects: EffectDef[],
  targets: Unit[],
  ox: number,
  oz: number,
): void {
  for (const e of effects) {
    if (e.atRank && ctx.rank < e.atRank) continue;
    switch (e.type) {
      case 'damage':
        for (const t of targets) if (t.alive) damageEffect(w, ctx, e, t);
        break;
      case 'status':
        for (const t of targets) statusEffect(w, ctx, e, t);
        break;
      case 'buff':
      case 'debuff':
        buffEffect(w, ctx, e, targets);
        break;
      case 'projectile':
        spawnProjectiles(w, ctx, e, ox, oz);
        break;
      case 'area':
        createArea(w, ctx, e);
        break;
      case 'heal': {
        const amount =
          rv(e.matk, ctx.rank, ctx.maxRank, 0) * avgMatk(ctx.caster) +
          rv(e.maxHpPct, ctx.rank, ctx.maxRank, 0) * ctx.caster.maxHp;
        const who: Unit[] =
          e.who === 'summons'
            ? summonsOf(w, ctx.caster)
            : e.who === 'self'
              ? [ctx.caster]
              : [ctx.caster, ...summonsOf(w, ctx.caster)];
        for (const u of who) {
          if (e.radius !== undefined && dist(u.x, u.z, ctx.caster.x, ctx.caster.z) > e.radius)
            continue;
          healUnit(w, u, amount);
        }
        break;
      }
      case 'shield': {
        const amount =
          rv(e.maxHpPct, ctx.rank, ctx.maxRank, 0) * ctx.caster.maxHp +
          rv(e.matk, ctx.rank, ctx.maxRank, 0) * avgMatk(ctx.caster);
        ctx.caster.shield = Math.max(ctx.caster.shield, amount);
        ctx.caster.shieldT = rv(e.duration, ctx.rank, ctx.maxRank, 0);
        break;
      }
      case 'dash':
        startDash(w, ctx, e);
        break;
      case 'summon':
        w.spawnSummon(ctx, e);
        break;
      case 'displace':
        for (const t of targets) displaceUnit(w, t, ox, oz, e.kind, e.distance);
        break;
      case 'taunt':
        forEachEnemyOf(w, ctx.caster, (u) => {
          if (dist(u.x, u.z, ctx.caster.x, ctx.caster.z) <= e.radius + u.r) {
            applyStatus(w.b, w.rng, u, 'taunt', rv(e.duration, ctx.rank, ctx.maxRank, 1), {
              now: w.time,
              src: ctx.caster.id,
              power: 0,
            });
          }
        });
        break;
      case 'cleanse':
        cleanse(ctx.caster, e.count);
        break;
      case 'resource':
        resourceEffect(w, ctx, e);
        break;
      case 'toggle':
      case 'trigger':
      case 'modifier':
        break; // passives and toggles are registered when the loadout is built
    }
  }
}

function weaponElement(): Element {
  return 'neutral';
}

function damageEffect(
  w: SimWorld,
  ctx: FxCtx,
  e: Extract<EffectDef, { type: 'damage' }>,
  t: Unit,
): void {
  const physical = e.school === 'physical';
  let pct = rv(physical ? e.atk : e.matk, ctx.rank, ctx.maxRank, 1);
  if (e.bonusIfStatus && hasStatus(t, e.bonusIfStatus.status)) pct *= 1 + e.bonusIfStatus.pct;
  const element: Element = !e.element || e.element === 'weapon' ? weaponElement() : e.element;
  const spec = {
    school: e.school,
    element,
    pct,
    canCrit: e.canCrit ?? physical,
    ignoreDef: (e.ignoreDefPct ?? 0) / 100,
    tags: ctx.tags,
    affinity: ctx.affinity,
    melee: ctx.tags.includes('melee'),
    procs: !ctx.fromProc,
  };
  const hits = e.hits ?? 1;
  for (let i = 0; i < hits && t.alive; i++) dealHit(w, ctx.caster, t, spec, ctx);
  if (!e.chain) return;
  // Chain: jump to the nearest enemy not yet hit, losing a share of the damage each jump.
  const jumps = Math.round(rv(e.chain.jumps, ctx.rank, ctx.maxRank, 0));
  const visited = new Set<number>([t.id]);
  let from = t;
  let mult = 1;
  for (let j = 0; j < jumps; j++) {
    let next: Unit | null = null;
    let best = e.chain.radius;
    forEachEnemyOf(w, ctx.caster, (u) => {
      if (visited.has(u.id)) return;
      const d = dist(from.x, from.z, u.x, u.z);
      if (d < best) {
        best = d;
        next = u;
      }
    });
    if (!next) break;
    const n: Unit = next;
    visited.add(n.id);
    mult *= 1 - e.chain.falloff;
    w.emit({
      t: 'fx',
      shape: 'circle',
      x: n.x,
      z: n.z,
      heading: 0,
      size: 1,
      angleDeg: 0,
      width: 0,
      color: ELEMENT_COLOR[element],
    });
    dealHit(w, ctx.caster, n, { ...spec, pct: pct * mult, procs: false }, ctx);
    from = n;
  }
}

function statusEffect(
  w: SimWorld,
  ctx: FxCtx,
  e: Extract<EffectDef, { type: 'status' }>,
  t: Unit,
): void {
  if (!t.alive) return;
  const chance = rv(e.chance, ctx.rank, ctx.maxRank, 1);
  if (w.rng.next() > chance) return;
  const dur = rv(e.duration, ctx.rank, ctx.maxRank, 1);
  let power = rv(e.power, ctx.rank, ctx.maxRank, 0);
  if (isDot(e.status)) {
    // DoT strength is a share of the caster's ATK (or average MATK for magic skills) per second.
    const scale = ctx.tags.includes('magic') ? avgMatk(ctx.caster) : ctx.caster.atk;
    power = (power > 0 ? power : 0.3) * scale;
  }
  applyStatus(w.b, w.rng, t, e.status, dur, { now: w.time, src: ctx.caster.id, power });
}

function buffEffect(
  w: SimWorld,
  ctx: FxCtx,
  e: Extract<EffectDef, { type: 'buff' | 'debuff' }>,
  targets: Unit[],
): void {
  const who = e.who ?? (e.type === 'buff' ? 'self' : 'targets');
  let list: Unit[];
  if (who === 'self') list = [ctx.caster];
  else if (who === 'summons') list = summonsOf(w, ctx.caster);
  else if (who === 'selfAndSummons') list = [ctx.caster, ...summonsOf(w, ctx.caster)];
  else list = targets;
  const key = e.key ?? `${ctx.skill?.id ?? 'fx'}:${e.type}`;
  const mods = resolveMods(e.mods, ctx.rank, ctx.maxRank);
  const duration = rv(e.duration, ctx.rank, ctx.maxRank, 1);
  for (const u of list) {
    if (!u.alive) continue;
    const buff: BuffInst = {
      key,
      src: ctx.caster.id,
      remaining: duration,
      mods,
      immune: e.immune ?? [],
      debuff: e.type === 'debuff',
    };
    const i = u.buffs.findIndex((b) => b.key === key && b.src === buff.src);
    if (i >= 0) u.buffs[i] = buff;
    else u.buffs.push(buff);
    refreshUnit(w, u);
  }
}

function resourceEffect(
  w: SimWorld,
  ctx: FxCtx,
  e: Extract<EffectDef, { type: 'resource' }>,
): void {
  const r = w.hs.resources;
  const cap = e.resource === 'orbs' ? 5 : 10;
  const have = r[e.resource];
  if (e.spend) {
    const n = e.amount === 'all' ? have : Math.min(have, e.amount);
    r[e.resource] = have - n;
    ctx.spent += n;
  } else {
    r[e.resource] = Math.min(cap, have + (e.amount === 'all' ? cap : e.amount));
  }
}

export function displaceUnit(
  w: SimWorld,
  u: Unit,
  ox: number,
  oz: number,
  kind: 'knockback' | 'pull',
  distance: number,
  stun = true,
): void {
  if (!u.alive || u.isBoss || u.buffs.some((b) => b.immune.includes('knockback'))) return;
  const k = w.b.combat.knockback;
  // A target that was just pushed ignores the next push, so basic attacks cannot pin it away.
  if (kind === 'knockback' && u.kbImmuneT > 0) return;
  let dx = u.x - ox;
  let dz = u.z - oz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    dx = Math.sin(u.heading);
    dz = Math.cos(u.heading);
  } else {
    dx /= d;
    dz /= d;
  }
  let move =
    kind === 'knockback' ? distance : -Math.min(distance, Math.max(0, d - k.pullKeepDistance));
  if (kind === 'knockback' && u.elite) move *= k.eliteFactor;
  if (Math.abs(move) < 1e-6) return;
  u.kbX = dx * move;
  u.kbZ = dz * move;
  u.kbT = 0;
  u.kbDur = k.duration;
  w.emit({
    t: 'fx',
    shape: 'circle',
    x: u.x,
    z: u.z,
    heading: 0,
    size: 0.8,
    angleDeg: 0,
    width: 0,
    color: '#d8ceb0',
  });
  if (kind === 'knockback') {
    u.kbImmuneT = k.immuneSec;
    // Normal monsters flinch (the windup is lost); elites and the hero keep acting.
    // A charger already mid-dash finishes it. Basic attacks nudge without interrupting.
    if (stun && u.kind === 'monster' && !u.elite && u.ai?.state !== 'dash') u.hitStunT = k.stunSec;
  }
}

/** Advances a knockback slide and its timers. Walls and obstacles stop the slide. */
export function tickDisplacement(w: SimWorld, u: Unit, dt: number): void {
  if (u.kbImmuneT > 0) u.kbImmuneT = Math.max(0, u.kbImmuneT - dt);
  if (u.hitStunT > 0) u.hitStunT = Math.max(0, u.hitStunT - dt);
  if (u.kbDur <= 0) return;
  const ease = (t: number): number => 1 - (1 - t / u.kbDur) * (1 - t / u.kbDur);
  const t1 = Math.min(u.kbDur, u.kbT + dt);
  const f = ease(t1) - ease(u.kbT);
  u.kbT = t1;
  const p = { x: u.x + u.kbX * f, z: u.z + u.kbZ * f };
  w.nav.collide(p, u.r);
  u.x = p.x;
  u.z = p.z;
  if (t1 >= u.kbDur) u.kbDur = 0;
}

// --- Dash --------------------------------------------------------------------------------------

function startDash(w: SimWorld, ctx: FxCtx, e: Extract<EffectDef, { type: 'dash' }>): void {
  const h = ctx.caster;
  if (h.kind !== 'hero') return;
  if (e.iframes) h.invuln = Math.max(h.invuln, e.iframes);
  if (e.to === 'behindTarget' && ctx.target) {
    const t = ctx.target;
    const behind = {
      x: t.x - Math.sin(t.heading) * (t.r + h.r + 0.3),
      z: t.z - Math.cos(t.heading) * (t.r + h.r + 0.3),
    };
    w.nav.collide(behind, h.r);
    h.x = behind.x;
    h.z = behind.z;
    h.heading = headingOf(t.x - h.x, t.z - h.z);
    if (e.onArrive) runEffects(w, ctx, e.onArrive, [t], h.x, h.z);
    return;
  }
  w.hs.dash = {
    dx: Math.sin(ctx.heading),
    dz: Math.cos(ctx.heading),
    left: e.distance,
    speed: e.speed,
    hit: [],
    onPass: e.onPass ?? [],
    onArrive: e.onArrive ?? [],
    ctx,
  };
  if (e.iframes === undefined) h.invuln = Math.max(h.invuln, 0);
}

export function updateDash(w: SimWorld, dt: number): void {
  const d = w.hs.dash;
  if (!d) return;
  const h = w.hero;
  const step = Math.min(d.left, d.speed * dt);
  const p = { x: h.x + d.dx * step, z: h.z + d.dz * step };
  const before = { x: p.x, z: p.z };
  w.nav.collide(p, h.r);
  const blocked = Math.hypot(p.x - before.x, p.z - before.z) > step * 0.8;
  h.x = p.x;
  h.z = p.z;
  d.left -= step;
  h.heading = headingOf(d.dx, d.dz);
  if (d.onPass.length > 0) {
    const hit: Unit[] = [];
    forEachEnemyOf(w, h, (u) => {
      if (d.hit.includes(u.id)) return;
      if (dist(h.x, h.z, u.x, u.z) <= h.r + u.r + 0.6) {
        d.hit.push(u.id);
        hit.push(u);
      }
    });
    if (hit.length > 0) runEffects(w, d.ctx, d.onPass, hit, h.x, h.z);
  }
  if (d.left <= 1e-6 || blocked) {
    w.hs.dash = null;
    if (d.onArrive.length > 0) runEffects(w, d.ctx, d.onArrive, [], h.x, h.z);
  }
}

// --- Projectiles -------------------------------------------------------------------------------

export function newProjectile(w: SimWorld): Projectile | null {
  const free = w.projectiles.find((p) => !p.active);
  return free ?? null;
}

function spawnProjectiles(
  w: SimWorld,
  ctx: FxCtx,
  e: Extract<EffectDef, { type: 'projectile' }>,
  ox: number,
  oz: number,
): void {
  const count = Math.max(1, Math.round(rv(e.count, ctx.rank, ctx.maxRank, 1)));
  const spread = ((e.spreadDeg ?? 0) * Math.PI) / 180;
  const base = ctx.heading;
  const color = ELEMENT_COLOR[ctx.tags.find((t) => ELEMENTS.includes(t)) ?? 'neutral'];
  for (let i = 0; i < count; i++) {
    const p = newProjectile(w);
    if (!p) return; // 150 projectiles at most (PRD Section 4)
    const a = count === 1 ? base : base + (i / (count - 1) - 0.5) * spread;
    p.active = true;
    p.x = ox + Math.sin(a) * 0.8;
    p.z = oz + Math.cos(a) * 0.8;
    p.dx = Math.sin(a);
    p.dz = Math.cos(a);
    p.speed = e.speed;
    p.radius = e.radius;
    p.range = ctx.skill?.range ?? 14;
    p.pierceLeft = e.pierce ?? 0;
    p.bounceLeft = Math.round(rv(e.bounce, ctx.rank, ctx.maxRank, 0));
    p.homing = !!e.homing;
    p.targetId = ctx.target?.id ?? -1;
    p.team = ctx.caster.team;
    p.color = color;
    p.hitSet.length = 0;
    p.onHit = e.onHit;
    p.ctx = ctx;
    p.attack = null;
    p.attackerId = ctx.caster.id;
  }
}

export function updateProjectiles(w: SimWorld, dt: number): void {
  for (const p of w.projectiles) {
    if (!p.active) continue;
    if (p.homing) {
      const t = w.unitById(p.targetId);
      if (t && t.alive) {
        const want = headingOf(t.x - p.x, t.z - p.z);
        p.dx = Math.sin(want);
        p.dz = Math.cos(want);
      }
    }
    const total = p.speed * dt;
    const steps = Math.max(1, Math.ceil(total / Math.max(0.25, p.radius)));
    const step = total / steps;
    for (let s = 0; s < steps && p.active; s++) {
      p.x += p.dx * step;
      p.z += p.dz * step;
      p.range -= step;
      projectileHit(w, p);
      if (p.range <= 0) p.active = false;
    }
    const lim = w.nav.arena.radius + 4;
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) p.active = false;
  }
}

function projectileHit(w: SimWorld, p: Projectile): void {
  const caster = p.team === 'player' ? w.hero : w.unitById(p.attackerId);
  let hit: Unit | null = null;
  const consider = (u: Unit) => {
    if (hit || !u.alive || u.team === p.team || p.hitSet.includes(u.id) || !targetable(u)) return;
    if (Math.hypot(u.x - p.x, u.z - p.z) <= p.radius + u.r) hit = u;
  };
  if (p.team === 'enemy') {
    consider(w.hero);
    for (const u of w.units) if (u.id >= 0 && u.kind === 'summon') consider(u);
  } else {
    w.hash.query(p.x, p.z, p.radius + 2.5, consider);
  }
  if (!hit) return;
  const u: Unit = hit;
  p.hitSet.push(u.id);
  if (p.onHit && p.ctx) runEffects(w, p.ctx, p.onHit, [u], p.x, p.z);
  else if (p.attack && caster) w.monsterAttackHit(caster, p.attack, u);
  if (p.pierceLeft > 0) {
    p.pierceLeft--;
  } else if (p.bounceLeft > 0) {
    p.bounceLeft--;
    let next: Unit | null = null;
    let best = 8;
    forEachEnemyOf(w, w.hero, (e) => {
      if (p.hitSet.includes(e.id)) return;
      const d = dist(p.x, p.z, e.x, e.z);
      if (d < best) {
        best = d;
        next = e;
      }
    });
    if (next) {
      const n: Unit = next;
      p.targetId = n.id;
      p.homing = true;
      p.range = Math.max(p.range, 10);
    } else p.active = false;
  } else p.active = false;
}

// --- Areas -------------------------------------------------------------------------------------

function createArea(w: SimWorld, ctx: FxCtx, e: Extract<EffectDef, { type: 'area' }>): void {
  const c = ctx.caster;
  let x = c.x;
  let z = c.z;
  if (e.at === 'ground') {
    x = ctx.aimX;
    z = ctx.aimZ;
  } else if (e.at === 'target' && ctx.target) {
    x = ctx.target.x;
    z = ctx.target.z;
  }
  const spec: ShapeSpec = blankShape(e.shape, x, z, ctx.heading);
  spec.radius = e.radius ?? e.length ?? 0;
  spec.angleDeg = e.angleDeg ?? 0;
  spec.length = e.length ?? e.radius ?? 0;
  spec.width = e.width ?? 1;
  spec.inner = e.inner ?? 0;
  if (e.shape === 'line' && e.at === 'ground') {
    // A wall: centred on the point and perpendicular to the cast direction.
    const h2 = ctx.heading + Math.PI / 2;
    spec.x = x - Math.sin(h2) * (spec.length / 2);
    spec.z = z - Math.cos(h2) * (spec.length / 2);
    spec.heading = h2;
  }
  const duration = e.duration ?? 0;
  const delay = e.delay ?? 0;
  const color = ELEMENT_COLOR[ctx.tags.find((t) => ELEMENTS.includes(t)) ?? 'neutral'];
  if (e.shape === 'circle' || e.shape === 'cone' || e.shape === 'line') {
    w.emit({
      t: 'fx',
      shape: e.shape,
      x: spec.x,
      z: spec.z,
      heading: spec.heading,
      size: e.shape === 'line' ? spec.length : spec.radius,
      angleDeg: spec.angleDeg,
      width: spec.width,
      color,
    });
  }
  const scatter = e.scatter
    ? {
        count: Math.max(1, Math.round(rv(e.scatter.count, ctx.rank, ctx.maxRank, 1))),
        hitRadius: e.scatter.hitRadius,
        fired: 0,
      }
    : null;
  if (delay === 0 && duration === 0 && !scatter) {
    applyArea(w, ctx, spec, e.onTick, ctx.caster.team);
    return;
  }
  const a = w.areas.find((x) => !x.active);
  if (!a) return;
  a.active = true;
  a.spec = spec;
  a.delay = delay;
  a.duration = duration;
  a.tick = e.tick ?? 0.5;
  a.elapsed = 0;
  a.nextTick = delay;
  a.effects = e.onTick;
  a.ctx = ctx;
  a.team = ctx.caster.team;
  a.scatter = scatter;
  a.once = duration === 0 && !scatter;
}

function applyArea(
  w: SimWorld,
  ctx: FxCtx,
  spec: ShapeSpec,
  effects: EffectDef[],
  team: 'player' | 'enemy',
): void {
  const hit: Unit[] = [];
  const probe = { team } as Unit;
  forEachEnemyOf(w, probe, (u) => {
    if (inShape(spec, u.x, u.z, u.r)) hit.push(u);
  });
  // A wall pushes enemies away from the caster rather than along its own length.
  const ox = spec.shape === 'line' ? ctx.caster.x : spec.x;
  const oz = spec.shape === 'line' ? ctx.caster.z : spec.z;
  if (hit.length > 0) runEffects(w, ctx, effects, hit, ox, oz);
}

export function updateAreas(w: SimWorld, dt: number): void {
  for (const a of w.areas) {
    if (!a.active) continue;
    a.elapsed += dt;
    if (a.scatter) {
      const s = a.scatter;
      const interval = a.duration / s.count;
      while (s.fired < s.count && a.elapsed >= a.delay + s.fired * interval) {
        s.fired++;
        const ang = w.rng.next() * Math.PI * 2;
        const rad = Math.sqrt(w.rng.next()) * a.spec.radius;
        const strike: ShapeSpec = blankShape(
          'circle',
          a.spec.x + Math.cos(ang) * rad,
          a.spec.z + Math.sin(ang) * rad,
          0,
        );
        strike.radius = s.hitRadius;
        w.emit({
          t: 'fx',
          shape: 'circle',
          x: strike.x,
          z: strike.z,
          heading: 0,
          size: s.hitRadius,
          angleDeg: 0,
          width: 0,
          color: ELEMENT_COLOR[a.ctx.tags.find((t) => ELEMENTS.includes(t)) ?? 'fire'],
        });
        applyArea(w, a.ctx, strike, a.effects, a.team);
      }
      if (s.fired >= s.count) a.active = false;
      continue;
    }
    if (a.once) {
      if (a.elapsed >= a.delay) {
        applyArea(w, a.ctx, a.spec, a.effects, a.team);
        a.active = false;
      }
      continue;
    }
    while (a.nextTick <= a.elapsed + 1e-9 && a.nextTick <= a.delay + a.duration + 1e-9) {
      applyArea(w, a.ctx, a.spec, a.effects, a.team);
      a.nextTick += a.tick;
    }
    if (a.elapsed >= a.delay + a.duration) a.active = false;
  }
}

// --- Triggers ----------------------------------------------------------------------------------

type TriggerOn = Extract<EffectDef, { type: 'trigger' }>['on'];

/**
 * Fires the hero's passive triggers for an event. Chance and internal cooldown (at least 0.5 s)
 * apply, and a proc cannot start another proc. Returns true if any trigger fired.
 */
export function fireTrigger(w: SimWorld, on: TriggerOn, info: { target?: Unit }): boolean {
  const hs = w.hs;
  const h = w.hero;
  if (hs.inProc || !h.alive) return false;
  let fired = false;
  for (const p of hs.passives) {
    p.def.effects.forEach((e, i) => {
      if (e.type !== 'trigger' || e.on !== on) return;
      if (e.atRank && p.rank < e.atRank) return;
      const key = `${p.def.id}:${i}`;
      if ((hs.icd[key] ?? 0) > w.time) return;
      if (on === 'lowHp' && !(h.hp / h.maxHp < (e.threshold ?? 0.4))) return;
      if (w.rng.next() > rv(e.chance, p.rank, p.def.maxRank, 1)) return;
      hs.icd[key] = w.time + Math.max(rv(e.icd, p.rank, p.def.maxRank, 0), w.b.combat.procIcd);
      const ctx: FxCtx = {
        caster: h,
        skill: p.def,
        rank: p.rank,
        maxRank: p.def.maxRank,
        tags: [...p.def.tags],
        heading: h.heading,
        aimX: h.x,
        aimZ: h.z,
        target: info.target ?? null,
        affinity: false,
        fromProc: true,
        spent: 0,
      };
      hs.inProc = true;
      try {
        const targets =
          on === 'hit' || on === 'crit' || on === 'kill' ? (info.target ? [info.target] : []) : [h];
        runEffects(w, ctx, e.effects, targets, h.x, h.z);
      } finally {
        hs.inProc = false;
      }
      fired = true;
    });
  }
  return fired;
}

// --- Basic attacks -----------------------------------------------------------------------------

/** One basic attack from the hero: the weapon's hit plus any basic-attack bonuses. */
export function heroBasicAttack(w: SimWorld, target: Unit): void {
  const h = w.hero;
  const type = w.build.weapon.type;
  const magic = type === 'staff';
  const tags = [
    'basic',
    magic ? 'magic' : 'physical',
    ...(type === 'bow' || type === 'gun' || magic ? ['ranged'] : ['melee']),
  ];
  const spec = {
    school: (magic ? 'magic' : 'physical') as 'magic' | 'physical',
    element: 'neutral' as Element,
    pct: magic ? w.b.basicAttack.staffMatkPct : 1,
    canCrit: !magic,
    ignoreDef: 0,
    tags,
    affinity: false,
    melee: !magic && type !== 'bow' && type !== 'gun',
    basic: true,
  };
  dealHit(w, h, target, spec);
  // Basic attacks nudge the target back a little (distance by weapon type), without a flinch.
  if (target.alive) {
    const push = w.b.combat.knockback.basic[type];
    if (push > 0) displaceUnit(w, target, h.x, h.z, 'knockback', push, false);
  }
  const extraAtk = sumUnitMods(w, h, 'basicBonusAtk').pct;
  if (extraAtk > 0 && target.alive)
    dealHit(w, h, target, { ...spec, pct: extraAtk, ignoreDef: 1, procs: false });
  const fire = sumUnitMods(w, h, 'basicFireBonus').pct;
  if (fire > 0 && target.alive)
    dealHit(w, h, target, { ...spec, element: 'fire', pct: fire, procs: false });
}

export function skillSummary(def: SkillDef): string {
  return `${def.name} T${def.tier}`;
}

export type { Stat };

export interface SkillStatus {
  /** SP the skill would cost right now. */
  cost: number;
  noSp: boolean;
  /** For single-enemy skills: is there an enemy in range? Other types are always true. */
  hasTarget: boolean;
  kind: SkillDef['kind'];
  toggled: boolean;
}

/** What a skill button needs to show: SP short, no target in range, toggle state. */
export function skillStatus(w: SimWorld, slot: number): SkillStatus | null {
  const ss = w.hs.slots[slot];
  if (!ss) return null;
  const cost = spCostOf(w, ss.def, ss.rank);
  const hasTarget = ss.def.target === 'enemy' ? resolveAim(w, ss.def, null) !== null : true;
  return {
    cost,
    noSp: w.hero.sp + 1e-9 < cost,
    hasTarget,
    kind: ss.def.kind,
    toggled: w.hs.toggles.includes(slot),
  };
}
