import { Rng } from '../core/rng';
import { balance, strings } from '../data/schema';
import { bosses, monsters, summons, zones, skillMap } from '../data/content';
import type { Balance } from '../data/schema';
import type { BossDef, EffectDef, MonsterDef, SkillDef, SummonDef, ZoneDef } from '../data/types';
import { updateMonster } from './ai';
import { applyDamage, dealHit, forEachEnemyOf, killUnit, nearestEnemy, targetable } from './combat';
import {
  displaceUnit,
  heroBasicAttack,
  rebuildSlots,
  refreshHero,
  refreshUnit,
  tryCast,
  updateAreas,
  updateCasting,
  updateDash,
  updateProjectiles,
  type CastResult,
} from './engine';
import { angleDiff, dist, headingOf } from './geometry';
import type { HeroBuild } from './loadout';
import { Nav, circleArena, rectArena } from './nav';
import { rv } from './ranked';
import { newRun, type RunResult, type RunState } from './run';
import { SpatialHash } from './spatial';
import { spawnerUpdate, startFieldSpawns, type Pack } from './spawner';
import { applyStatus, apsMult, canAct, canMove, moveMult, tickStatuses } from './status';
import { expForKill, expToNext, goldForKill, monsterStats } from './stats';
import type { AreaInst, FxCtx, HeroState, Projectile, SimEvent, Telegraph, Unit } from './types';
import { makeUnit } from './unit';
import { updateBoss } from './boss';
import { blankShape } from './geometry';

export interface Content {
  skills: Map<string, SkillDef>;
  monsters: Map<string, MonsterDef>;
  bosses: Map<string, BossDef>;
  zones: Map<string, ZoneDef>;
  summons: Map<string, SummonDef>;
}

export const defaultContent: Content = {
  skills: skillMap,
  monsters: new Map(monsters.map((m) => [m.id, m])),
  bosses: new Map(bosses.map((m) => [m.id, m])),
  zones: new Map(zones.map((z) => [z.id, z])),
  summons: new Map(summons.map((s) => [s.id, s])),
};

export interface CastRequest {
  slot: number;
  /** World point the player aimed at. Null means a tap: use the target or the facing direction. */
  aim: { x: number; z: number } | null;
}

export interface TickInput {
  /** Desired move vector, magnitude 0..1 (analog). */
  moveX: number;
  moveZ: number;
  casts: CastRequest[];
}

export type Mode = 'yard' | 'field' | 'boss';

export interface WorldOptions {
  build: HeroBuild;
  seed: number;
  mode: Mode;
  zoneId?: string;
  content?: Content;
  b?: Balance;
}

const POOL = 64;
const DEAD_LINGER = 1.4;

/** The pure simulation: no three.js, no DOM (PRD Section 0, rule 5). Ticks at 30 Hz. */
export class SimWorld {
  readonly b: Balance;
  readonly rng: Rng;
  readonly content: Content;
  readonly str = { miss: strings.miss, noTarget: strings.noTarget };
  readonly skillDefs: Map<string, SkillDef>;
  readonly seed: number;
  build: HeroBuild;
  hero: Unit;
  hs: HeroState;
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  areas: AreaInst[] = [];
  telegraphs: Telegraph[] = [];
  nav: Nav;
  hash = new SpatialHash(4);
  events: SimEvent[] = [];
  time = 0;
  nextId = 1;
  godMode = false;
  mode: Mode;
  zone: ZoneDef | null = null;
  run: RunState;
  boss: Unit | null = null;
  bossDef: BossDef | null = null;
  packs: Pack[] = [];
  /** Sim time of the last damage dealt or taken, for out-of-combat regen. */
  lastCombat = -999;

  constructor(o: WorldOptions) {
    this.b = o.b ?? balance;
    this.seed = o.seed;
    this.rng = new Rng(o.seed);
    this.content = o.content ?? defaultContent;
    this.skillDefs = this.content.skills;
    this.build = o.build;
    this.mode = o.mode;
    for (let i = 0; i < POOL; i++) this.units.push(makeUnit({ id: -1, alive: false }));
    for (let i = 0; i < 150; i++) this.projectiles.push(blankProjectile());
    for (let i = 0; i < 48; i++) this.areas.push(blankArea());
    for (let i = 0; i < 40; i++) this.telegraphs.push(blankTelegraph());
    this.hero = makeUnit({
      id: 0,
      kind: 'hero',
      team: 'player',
      defId: 'hero',
      name: o.build.name,
      r: this.b.hero.radius,
      heading: Math.PI,
      pheading: Math.PI,
    });
    this.hs = newHeroState();
    this.nav = new Nav(circleArena(this.b.arena.radius), []);
    this.run = newRun('yard', 100, 150);
    this.loadBuild(o.build);
    this.hero.hp = this.hero.maxHp;
    this.hero.sp = this.hero.maxSp;
    if (o.mode === 'field') this.startField(o.zoneId ?? 'meadowmere');
    else if (o.mode === 'yard') this.startYard();
  }

  // --- Events and lookup ------------------------------------------------------------------

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    return this.events.splice(0, this.events.length);
  }

  unitById(id: number): Unit | null {
    if (id < 0) return null;
    if (id === this.hero.id) return this.hero;
    for (const u of this.units) if (u.id === id) return u;
    return null;
  }

  /** Living units other than the hero. */
  liveUnits(): Unit[] {
    return this.units.filter((u) => u.id >= 0 && u.alive);
  }

  aliveEnemies(): number {
    let n = 0;
    for (const u of this.units) if (u.id >= 0 && u.alive && u.team === 'enemy') n++;
    return n;
  }

  // --- Build ---------------------------------------------------------------------------------

  /** (Re)loads the hero's loadout: skill slots, passives and derived stats. */
  loadBuild(build: HeroBuild): void {
    this.build = build;
    this.hero.name = build.name;
    this.hero.level = build.level;
    this.hero.buffs.length = 0;
    this.hero.statuses.length = 0;
    this.hero.maxHp = 0;
    this.hero.maxSp = 0;
    this.hero.hp = 1;
    this.hero.sp = 1;
    rebuildSlots(this);
    this.hero.hp = this.hero.maxHp;
    this.hero.sp = this.hero.maxSp;
    this.hs.focusId = -1;
  }

  // --- Modes ---------------------------------------------------------------------------------

  private clearField(): void {
    for (let i = 0; i < this.units.length; i++) this.units[i] = makeUnit({ id: -1, alive: false });
    this.projectiles.forEach((p) => (p.active = false));
    this.areas.forEach((a) => (a.active = false));
    this.telegraphs.forEach((t) => (t.active = false));
    this.boss = null;
    this.bossDef = null;
    this.hs.casting = null;
    this.hs.dash = null;
  }

  /** The M0 training yard: a circle of 30 training dummies, for testing skills. */
  startYard(): void {
    this.clearField();
    this.mode = 'yard';
    this.nav = new Nav(circleArena(this.b.arena.radius), []);
    this.run = newRun('yard', 100, 150);
    this.placeHero(0, 0, Math.PI);
    const d = this.b.dummies;
    const layout = new Rng(d.seed);
    const def = this.content.monsters.get('training_dummy')!;
    let guard = 0;
    let n = 0;
    const placed: { x: number; z: number }[] = [];
    while (n < d.count && guard++ < 20000) {
      const ang = layout.next() * Math.PI * 2;
      const rad =
        d.spawnClearRadius + Math.sqrt(layout.next()) * (d.placeRadius - d.spawnClearRadius);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (placed.some((o) => dist(o.x, o.z, x, z) < d.minSpacing)) continue;
      placed.push({ x, z });
      const u = this.spawnMonster(def, x, z, 1, {});
      if (u) {
        u.maxHp = d.hp;
        u.hp = d.hp;
        n++;
      }
    }
  }

  startField(zoneId: string): void {
    const zone = this.content.zones.get(zoneId);
    if (!zone) throw new Error(`Unknown zone ${zoneId}`);
    this.clearField();
    this.zone = zone;
    this.mode = 'field';
    const [w, d] = zone.field.size;
    this.nav = new Nav(rectArena(w, d), zone.field.obstacles);
    this.run = newRun(zoneId, zone.gauge.full, zone.eliteEverySec);
    this.placeHero(0, d / 2 - 6, Math.PI);
    this.hero.hp = this.hero.maxHp;
    this.hero.sp = this.hero.maxSp;
    this.hero.alive = true;
    this.hero.statuses.length = 0;
    this.hero.buffs.length = 0;
    refreshHero(this);
    this.hero.hp = this.hero.maxHp;
    this.hero.sp = this.hero.maxSp;
    startFieldSpawns(this);
  }

  /** "Grind again": back to the field with the gauge reset, keeping the run's totals. */
  grindAgain(): void {
    if (!this.zone) return;
    const keep = {
      kills: this.run.kills,
      gold: this.run.gold,
      exp: this.run.exp,
      elites: this.run.elites,
      elapsed: this.run.elapsed,
    };
    this.startField(this.zone.id);
    Object.assign(this.run, keep);
    this.run.bossFirstKill = false;
  }

  private placeHero(x: number, z: number, heading: number): void {
    const h = this.hero;
    h.x = h.px = x;
    h.z = h.pz = z;
    h.heading = h.pheading = heading;
    h.alive = true;
    h.deadFor = 0;
  }

  /** Walks into the boss portal: swap to the boss arena and start the intro (name card). */
  enterBoss(): void {
    if (!this.zone || this.run.phase !== 'field') return;
    const def = this.content.bosses.get(this.zone.bossId);
    if (!def) throw new Error(`Unknown boss ${this.zone.bossId}`);
    this.clearField();
    this.bossDef = def;
    this.mode = 'boss';
    this.nav = new Nav(circleArena(def.arenaRadius), []);
    this.placeHero(0, def.arenaRadius - 4, Math.PI);
    this.run.phase = 'intro';
    this.run.introT = this.b.boss.introSec;
    this.run.portal = null;
    const boss = this.spawnBoss(def);
    this.boss = boss;
    this.hs.focusId = boss.id;
    this.emit({ t: 'bossIntro', name: def.name });
  }

  /** Skip the name card (it is skippable, PRD Section 14). */
  skipIntro(): void {
    if (this.run.phase === 'intro') this.run.introT = 0;
  }

  // --- Spawning ------------------------------------------------------------------------------

  private freeSlot(): number {
    return this.units.findIndex((u) => u.id < 0);
  }

  spawnMonster(
    def: MonsterDef,
    x: number,
    z: number,
    level: number,
    o: { packId?: number; elite?: boolean; heading?: number; script?: Record<string, number> },
  ): Unit | null {
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const m = this.b.monster;
    const elite = !!o.elite || !!def.elite;
    const mult = { ...def.mult };
    if (elite) {
      mult.hp = (mult.hp ?? 1) * m.elite.hp;
      mult.atk = (mult.atk ?? 1) * m.elite.atk;
      mult.def = (mult.def ?? 1) * m.elite.def;
    }
    const s = monsterStats(this.b, level, mult);
    const r = (def.radius ?? 0.7) * (elite ? m.elite.scale / 1.4 : 1);
    const u = makeUnit({
      id: this.nextId++,
      kind: 'monster',
      team: 'enemy',
      defId: def.id,
      name: def.name,
      x,
      z,
      px: x,
      pz: z,
      heading: o.heading ?? this.rng.next() * Math.PI * 2,
      r,
      level,
      element: def.element,
      race: def.race,
      hp: s.hp,
      maxHp: s.hp,
      alive: true,
      atk: s.atk,
      matkMin: s.atk,
      matkMax: s.atk,
      hit: s.hit,
      flee: s.flee,
      def: s.def,
      mdef: s.mdef,
      moveSpeed: def.moveSpeed * (def.mult?.speed ?? 1) * m.unitSpeedScale,
      aps: 1 * (def.mult?.aps ?? 1),
      elite,
      isBoss: false,
    });
    u.pheading = u.heading;
    u.base = {
      atk: s.atk,
      matkMin: s.atk,
      matkMax: s.atk,
      def: s.def,
      mdef: s.mdef,
      hit: s.hit,
      flee: s.flee,
      moveSpeed: u.moveSpeed,
      aps: u.aps,
    };
    if (def.id === 'thornling') u.reflectMelee = 0.05;
    u.ai = {
      archetype: def.archetype,
      state: def.archetype === 'burrower' ? 'hidden' : 'idle',
      t: 0,
      spawnX: x,
      spawnZ: z,
      packId: o.packId ?? -1,
      cooldowns: {},
      attackId: null,
      lockX: 0,
      lockZ: 0,
      lockHeading: 0,
      telegraphId: -1,
      hasAggro: false,
      path: null,
      pathT: 0,
      script: o.script ?? {},
      dashLeft: 0,
      think: this.rng.next() * 0.5,
      strafeDir: this.rng.next() < 0.5 ? -1 : 1,
    };
    this.units[slot] = u;
    return u;
  }

  private spawnBoss(def: BossDef): Unit {
    const slot = this.freeSlot();
    const s = monsterStats(this.b, def.level, { hp: def.hpMult, atk: def.mult?.atk ?? 1 });
    const u = makeUnit({
      id: this.nextId++,
      kind: 'monster',
      team: 'enemy',
      defId: def.id,
      name: def.name,
      x: 0,
      z: -def.arenaRadius / 2.5,
      r: def.radius ?? 2.2,
      level: def.level,
      element: def.element,
      race: def.race,
      hp: s.hp,
      maxHp: s.hp,
      alive: true,
      atk: s.atk,
      matkMin: s.atk,
      matkMax: s.atk,
      hit: s.hit,
      flee: s.flee,
      def: s.def,
      mdef: s.mdef,
      moveSpeed: def.moveSpeed,
      aps: 1,
      isBoss: true,
      elite: false,
    });
    u.px = u.x;
    u.pz = u.z;
    u.heading = 0;
    u.pheading = 0;
    u.base = {
      atk: s.atk,
      matkMin: s.atk,
      matkMax: s.atk,
      def: s.def,
      mdef: s.mdef,
      hit: s.hit,
      flee: s.flee,
      moveSpeed: u.moveSpeed,
      aps: u.aps,
    };
    u.ai = {
      archetype: def.archetype,
      state: 'idle',
      t: 0,
      spawnX: u.x,
      spawnZ: u.z,
      packId: -1,
      cooldowns: {},
      attackId: null,
      lockX: 0,
      lockZ: 0,
      lockHeading: 0,
      telegraphId: -1,
      hasAggro: true,
      path: null,
      pathT: 0,
      script: { phase: 0, splits: 0, enraged: 0 },
      dashLeft: 0,
      think: 1.0,
      strafeDir: 1,
    };
    this.units[slot] = u;
    return u;
  }

  /** Raises allied units from a summon effect, dismissing the oldest beyond the cap of 8. */
  spawnSummon(ctx: FxCtx, e: Extract<EffectDef, { type: 'summon' }>): void {
    const def = this.content.summons.get(e.unitId);
    if (!def) return;
    const owner = ctx.caster;
    const count = Math.round(rv(e.count, ctx.rank, ctx.maxRank, 1));
    const maxAlive = Math.round(rv(e.maxAlive, ctx.rank, ctx.maxRank, 1));
    const mine = () =>
      this.units.filter(
        (u) =>
          u.id >= 0 &&
          u.alive &&
          u.kind === 'summon' &&
          u.summon?.ownerId === owner.id &&
          u.defId === def.id,
      );
    for (let i = 0; i < count; i++) {
      // Respect this skill's own maximum, then the global cap of 8 summons.
      while (mine().length >= maxAlive) this.dismissOldest(mine());
      const all = this.units.filter((u) => u.id >= 0 && u.alive && u.kind === 'summon');
      while (all.length >= this.b.combat.maxSummons) {
        this.dismissOldest(all);
      }
      const slot = this.freeSlot();
      if (slot < 0) return;
      const ang = (i / Math.max(1, count)) * Math.PI * 2;
      const hp = owner.maxHp * def.hpPctOfOwner;
      const matk = rv(def.attack.matk, ctx.rank, ctx.maxRank, 0);
      const atkPct = rv(def.attack.atk, ctx.rank, ctx.maxRank, 0);
      const power =
        def.attack.school === 'magic'
          ? ((owner.matkMin + owner.matkMax) / 2) * matk
          : owner.atk * atkPct;
      const u = makeUnit({
        id: this.nextId++,
        kind: 'summon',
        team: 'player',
        defId: def.id,
        name: def.id,
        x: owner.x + Math.cos(ang) * 1.5,
        z: owner.z + Math.sin(ang) * 1.5,
        r: 0.6,
        level: owner.level,
        hp,
        maxHp: hp,
        alive: true,
        atk: power,
        matkMin: power,
        matkMax: power,
        hit: owner.hit + 50,
        flee: 0,
        def: owner.def * 0.5,
        mdef: owner.mdef * 0.5,
        moveSpeed: owner.moveSpeed * 0.9,
        aps: def.attack.aps,
        element: def.attack.element,
      });
      u.px = u.x;
      u.pz = u.z;
      u.base = {
        atk: power,
        matkMin: power,
        matkMax: power,
        def: u.def,
        mdef: u.mdef,
        hit: u.hit,
        flee: 0,
        moveSpeed: u.moveSpeed,
        aps: u.aps,
      };
      u.summon = { ownerId: owner.id, expires: this.time + e.duration, attackCd: 0 };
      u.ai = {
        archetype: def.archetype,
        state: 'idle',
        t: 0,
        spawnX: u.x,
        spawnZ: u.z,
        packId: -1,
        cooldowns: {},
        attackId: null,
        lockX: 0,
        lockZ: 0,
        lockHeading: 0,
        telegraphId: -1,
        hasAggro: true,
        path: null,
        pathT: 0,
        script: {},
        dashLeft: 0,
        think: 0,
        strafeDir: 1,
      };
      this.units[slot] = u;
    }
  }

  private dismissOldest(list: Unit[]): void {
    let oldest: Unit | null = null;
    for (const u of list) if (!oldest || u.id < oldest.id) oldest = u;
    if (oldest) {
      oldest.alive = false;
      oldest.id = -1;
      list.splice(list.indexOf(oldest), 1);
    }
  }

  // --- Kills, run totals and deaths ------------------------------------------------------------

  /** Called when an enemy dies: gauge, gold, EXP and the kill count. */
  onMonsterKilled(u: Unit): void {
    const r = this.run;
    if (u.defId === 'training_dummy') return;
    const m = this.b.monster;
    const boss = u.isBoss;
    const mult = boss ? m.bossGold : u.elite ? m.elite.gold : 1;
    const expMult = boss
      ? r.bossFirstKill
        ? m.bossFirstKillExp
        : m.bossExp
      : u.elite
        ? m.elite.exp
        : 1;
    const variance = 1 + (this.rng.next() * 2 - 1) * this.b.gold.variance;
    r.gold += Math.round(goldForKill(this.b, u.level, mult) * variance);
    r.exp += expForKill(this.b, this.build.level, u.level, expMult);
    r.kills++;
    if (u.elite) r.elites++;
    if (this.mode === 'field' && this.zone && r.phase === 'field') {
      r.gauge = Math.min(
        r.gaugeFull,
        r.gauge + (u.elite ? this.zone.gauge.elite : this.zone.gauge.normal),
      );
      if (r.gauge >= r.gaugeFull && !r.portal) {
        const h = this.hero;
        const px = h.x + Math.sin(h.heading) * this.b.field.portalDistance;
        const pz = h.z + Math.cos(h.heading) * this.b.field.portalDistance;
        const p = { x: px, z: pz };
        this.nav.collide(p, 1.2);
        r.portal = p;
        this.emit({ t: 'banner', text: `The Queen stirs in ${this.zone.name.split(' ')[0]}…` });
        this.emit({ t: 'portal', x: p.x, z: p.z });
      }
    }
    if (boss) this.bossDefeated();
  }

  private bossDefeated(): void {
    const r = this.run;
    if (r.phase !== 'boss') return;
    r.phase = 'chest';
    const loot: RunResult['loot'] = [{ kind: 'gold', text: `${Math.round(r.gold)} gold` }];
    loot.push({
      kind: 'note',
      text: 'Items, cards and the unique drops arrive with inventory in M2.',
    });
    r.result = this.makeResult('victory', true, loot);
    this.projectiles.forEach((p) => (p.active = false));
    this.areas.forEach((a) => (a.active = false));
    this.telegraphs.forEach((t) => (t.active = false));
  }

  private makeResult(
    outcome: RunResult['outcome'],
    bossDefeated: boolean,
    loot: RunResult['loot'] = [],
  ): RunResult {
    const r = this.run;
    return {
      outcome,
      timeSec: r.elapsed,
      kills: r.kills,
      elites: r.elites,
      exp: Math.round(r.exp),
      expPct: r.exp / expToNext(this.b, this.build.level),
      gold: Math.round(r.gold),
      bossDefeated,
      loot: loot.length ? loot : [{ kind: 'gold', text: `${Math.round(r.gold)} gold` }],
      seed: this.seed,
    };
  }

  /** Death ends the run: loot and EXP are kept and the hero returns to town (PRD Section 10). */
  heroDied(): void {
    const r = this.run;
    if (r.phase === 'ended') return;
    r.phase = 'ended';
    r.result = this.makeResult('death', false);
    this.emit({ t: 'died', targetId: this.hero.id });
    this.hs.casting = null;
    this.hs.dash = null;
  }

  /** Leave the run from the pause menu (keeps loot). */
  leaveRun(): void {
    const r = this.run;
    if (r.phase === 'ended') return;
    const defeated = r.phase === 'chest';
    r.phase = 'ended';
    r.result = r.result && defeated ? r.result : this.makeResult('left', false);
  }

  /** Called from the chest screen: "Return to town" ends the run. */
  finishRun(): void {
    if (this.run.phase === 'chest') this.run.phase = 'ended';
  }

  // --- Tick ----------------------------------------------------------------------------------

  tick(dt: number, input: TickInput): void {
    this.time += dt;
    const h = this.hero;
    h.px = h.x;
    h.pz = h.z;
    h.pheading = h.heading;
    for (const u of this.units) {
      if (u.id < 0) continue;
      u.px = u.x;
      u.pz = u.z;
      u.pheading = u.heading;
    }
    if (this.run.phase === 'ended' || this.run.phase === 'chest') {
      // The run is over: keep corpses and effects animating, but nothing fights.
      for (const u of this.units) if (u.id >= 0 && !u.alive) u.deadFor += dt;
      return;
    }
    if (this.run.phase === 'intro') {
      this.run.introT -= dt;
      if (this.run.introT <= 0) this.run.phase = 'boss';
      return;
    }
    this.run.elapsed += dt;
    this.hash.clear();
    for (const u of this.units) if (u.id >= 0 && u.alive) this.hash.insert(u);

    this.updateHero(dt, input);
    for (const u of this.units) {
      if (u.id < 0) continue;
      if (!u.alive) {
        u.deadFor += dt;
        if (u.deadFor > DEAD_LINGER) this.release(u);
        continue;
      }
      this.updateCommon(u, dt);
      if (!u.alive) continue;
      if (u.summon && this.time >= u.summon.expires) {
        u.alive = false;
        u.id = -1;
        continue;
      }
      updateMonster(this, u, dt);
      if (u.isBoss) updateBoss(this, u, dt);
    }
    updateProjectiles(this, dt);
    updateAreas(this, dt);
    for (const t of this.telegraphs) if (t.active) t.t += dt;
    spawnerUpdate(this, dt);
    if (
      this.run.portal &&
      this.run.phase === 'field' &&
      dist(h.x, h.z, this.run.portal.x, this.run.portal.z) < 1.6
    ) {
      this.enterBoss();
    }
  }

  private release(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units[i] = makeUnit({ id: -1, alive: false });
  }

  /** Per-unit upkeep: statuses and DoTs, buffs, shields. */
  updateCommon(u: Unit, dt: number): void {
    const ticks = tickStatuses(u, dt);
    for (const t of ticks) {
      const src = this.unitById(t.src);
      applyDamage(this, u, Math.max(1, Math.round(t.dmg)), src, false, { dot: true });
      if (!u.alive) return;
    }
    if (u.shieldT > 0) {
      u.shieldT -= dt;
      if (u.shieldT <= 0) u.shield = 0;
    }
    if (u.invuln > 0) u.invuln = Math.max(0, u.invuln - dt);
    let changed = false;
    for (let i = u.buffs.length - 1; i >= 0; i--) {
      u.buffs[i].remaining -= dt;
      if (u.buffs[i].remaining <= 0) {
        u.buffs.splice(i, 1);
        changed = true;
      }
    }
    if (changed) refreshUnit(this, u);
    // A debuffed unit's status power (slow etc.) is already folded into moveMult.
  }

  // --- Hero ----------------------------------------------------------------------------------

  private updateHero(dt: number, input: TickInput): void {
    const h = this.hero;
    const hs = this.hs;
    if (!h.alive) return;
    this.updateCommon(h, dt);
    if (!h.alive) return;
    for (let i = 0; i < hs.cooldown.length; i++) hs.cooldown[i] = Math.max(0, hs.cooldown[i] - dt);
    hs.gcd = Math.max(0, hs.gcd - dt);

    // Regeneration: HP x5 after 4 s without damage, SP x3 out of combat.
    const r = this.b.derived;
    const idle = this.time - h.lastDamagedAt >= r.hpRegen.idleSec;
    const ooc = this.time - Math.max(this.lastCombat, h.lastDamagedAt) >= r.hpRegen.idleSec;
    if (h.hp < h.maxHp) {
      const base = h.maxHp * r.hpRegen.pct + r.hpRegen.perVit * this.build.stats.VIT;
      h.hp = Math.min(h.maxHp, h.hp + base * (idle ? r.hpRegen.idleMult : 1) * dt);
    }
    if (h.sp < h.maxSp) {
      const int = this.build.stats.INT;
      const bonus = this.hs.passiveMods
        .filter((m) => m.stat === 'spRegen')
        .reduce((s, m) => s + m.add, 0);
      const base = r.spRegen.base + h.maxSp * r.spRegen.pct + r.spRegen.perInt * int + bonus;
      h.sp = Math.min(h.maxSp, h.sp + base * (ooc ? r.spRegen.oocMult : 1) * dt);
    }
    // Toggles drain SP and switch off when it runs out.
    for (const slot of [...hs.toggles]) {
      const ss = hs.slots[slot];
      const e = ss?.def.effects.find((x) => x.type === 'toggle');
      if (!ss || !e || e.type !== 'toggle') continue;
      h.sp -= e.spPerSec * dt;
      if (h.sp <= 0) {
        h.sp = 0;
        tryCast(this, slot, null);
      }
    }

    const mag = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    if (!canAct(h)) {
      hs.casting = null;
      hs.dash = null;
      hs.swinging = false;
      hs.swingPending = false;
      hs.moving = false;
      return;
    }
    if (hs.dash) {
      updateDash(this, dt);
      hs.moving = true;
      return;
    }
    updateCasting(this, dt, mag > 0 && canMove(h));
    for (const c of input.casts) {
      const res: CastResult = tryCast(this, c.slot, c.aim);
      void res;
    }
    hs.moving = false;
    if (hs.casting) return;

    if (mag > 0 && canMove(h)) {
      // Moving cancels an attack wind-up: stop to attack, move to dodge (PRD Section 5).
      hs.swinging = false;
      hs.swingPending = false;
      const nx = input.moveX / Math.max(mag, 1e-6);
      const nz = input.moveZ / Math.max(mag, 1e-6);
      this.moveHero(
        nx * mag * h.moveSpeed * moveMult(this.b, h) * dt,
        nz * mag * h.moveSpeed * moveMult(this.b, h) * dt,
      );
      this.turnHero(headingOf(nx, nz), dt);
      hs.moving = true;
    } else if (mag === 0) {
      this.autoAttack(dt);
    }
  }

  moveHero(dx: number, dz: number): void {
    const h = this.hero;
    const p = { x: h.x + dx, z: h.z + dz };
    this.nav.collide(p, h.r);
    // Training dummies and the boss are solid.
    for (const u of this.units) {
      if (u.id < 0 || !u.alive || u.team !== 'enemy') continue;
      if (!(u.defId === 'training_dummy' || u.isBoss)) continue;
      const min = u.r + h.r;
      const d = dist(p.x, p.z, u.x, u.z);
      if (d < min && d > 1e-6) {
        p.x = u.x + ((p.x - u.x) / d) * min;
        p.z = u.z + ((p.z - u.z) / d) * min;
      }
    }
    h.x = p.x;
    h.z = p.z;
  }

  private turnHero(target: number, dt: number): void {
    const h = this.hero;
    const diff = angleDiff(h.heading, target);
    const maxStep = this.b.hero.turnRate * dt;
    h.heading += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
  }

  /** The hero's current auto-attack target: the focus, else the nearest enemy within 10 m. */
  currentTarget(): Unit | null {
    const f = this.unitById(this.hs.focusId);
    if (f && targetable(f) && f.team === 'enemy') return f;
    this.hs.focusId = -1;
    return nearestEnemy(
      this,
      this.hero,
      this.hero.x,
      this.hero.z,
      this.b.targeting.autoAttackRange,
    );
  }

  private autoAttack(dt: number): void {
    const h = this.hero;
    const hs = this.hs;
    const w = this.b.weapons[this.build.weapon.type];
    const aps = h.aps * apsMult(this.b, h);
    const cycle = 1 / aps;
    const target = this.currentTarget();
    if (hs.swinging) {
      hs.swingT += dt;
      if (hs.swingPending && hs.swingT >= cycle * this.b.basicAttack.windupFraction) {
        hs.swingPending = false;
        if (target && dist(h.x, h.z, target.x, target.z) <= w.range + target.r + 0.6)
          heroBasicAttack(this, target);
        this.lastCombat = this.time;
      }
      if (hs.swingT >= cycle) hs.swinging = false;
      return;
    }
    if (!target) return;
    const reach = w.range + target.r;
    const d = dist(h.x, h.z, target.x, target.z);
    const want = headingOf(target.x - h.x, target.z - h.z);
    this.turnHero(want, dt);
    if (d > reach) {
      const step = Math.min(h.moveSpeed * moveMult(this.b, h) * dt, d - reach + 0.05);
      if (canMove(h)) {
        this.moveHero(((target.x - h.x) / d) * step, ((target.z - h.z) / d) * step);
        hs.moving = true;
      }
    } else if (Math.abs(angleDiff(h.heading, want)) < 0.5) {
      hs.swinging = true;
      hs.swingT = 0;
      hs.swingPending = true;
      hs.swingSeq++;
    }
  }

  // --- Targeting helpers (used by input) -------------------------------------------------------

  setFocus(id: number): void {
    this.hs.focusId = id;
  }

  /** Closest enemy to a ground point, to turn a screen tap into a focus target. */
  pickAt(x: number, z: number): Unit | null {
    let best: Unit | null = null;
    let bestD = this.b.targeting.focusPickRadius;
    for (const u of this.units) {
      if (u.id < 0 || u.team !== 'enemy' || !targetable(u)) continue;
      const d = dist(x, z, u.x, u.z) - u.r;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** Tab: focus the next living enemy by distance. */
  cycleFocus(): void {
    const h = this.hero;
    const list = this.units
      .filter((u) => u.id >= 0 && u.team === 'enemy' && targetable(u))
      .sort((a, b) => dist(h.x, h.z, a.x, a.z) - dist(h.x, h.z, b.x, b.z));
    if (list.length === 0) {
      this.hs.focusId = -1;
      return;
    }
    const i = list.findIndex((u) => u.id === this.hs.focusId);
    this.hs.focusId = list[(i + 1) % list.length].id;
  }

  // --- Monster attacks (called by AI and projectiles) -----------------------------------------

  /** Resolves one monster attack's hit on a target: damage, status and displacement. */
  monsterAttackHit(attacker: Unit, atk: import('../data/types').AttackDef, target: Unit): void {
    const d = atk.damage;
    if (!d || !target.alive) return;
    const res = dealHit(this, attacker, target, {
      school: 'physical',
      element: d.element ?? attacker.element,
      pct: d.atkPct,
      canCrit: false,
      ignoreDef: 0,
      tags: [],
      affinity: false,
      melee: !atk.projectile,
      procs: false,
    });
    if (res.missed || res.dodged || res.amount <= 0) return;
    if (d.status) this.applyAttackStatus(attacker, target, d.status);
    if (atk.displace && target.alive)
      this.displaceFrom(attacker, target, atk.displace.kind, atk.displace.distance);
  }

  applyAttackStatus(
    attacker: Unit,
    target: Unit,
    st: { id: import('../data/types').StatusId; chance: number; duration: number },
  ): void {
    if (this.rng.next() >= st.chance) return;
    const dps =
      st.id === 'poison' || st.id === 'burn' || st.id === 'bleed' ? attacker.atk * 0.25 : 0;
    applyStatus(this.b, this.rng, target, st.id, st.duration, {
      now: this.time,
      src: attacker.id,
      power: dps,
    });
  }

  displaceFrom(from: Unit, target: Unit, kind: 'knockback' | 'pull', distance: number): void {
    displaceUnit(this, target, from.x, from.z, kind, distance);
  }

  /** A summon's basic attack: one hit using the strength baked into the unit when it was raised. */
  summonHit(summon: Unit, target: Unit, def: SummonDef): void {
    dealHit(this, summon, target, {
      school: def.attack.school,
      element: def.attack.element,
      pct: 1,
      canCrit: false,
      ignoreDef: 0,
      tags: ['summon', def.attack.school],
      affinity: false,
      melee: def.attack.range < 3,
      procs: false,
    });
  }

  /** Test and cheat helper: kill everything but the hero. */
  killAllEnemies(): void {
    for (const u of this.units)
      if (u.id >= 0 && u.alive && u.team === 'enemy') killUnit(this, u, this.hero);
  }

  allEnemiesOfHero(fn: (u: Unit) => void): void {
    forEachEnemyOf(this, this.hero, fn);
  }
}

export function newHeroState(): HeroState {
  return {
    slots: [],
    passives: [],
    cooldown: [],
    cooldownMax: [],
    gcd: 0,
    casting: null,
    dash: null,
    toggles: [],
    resources: { orbs: 0, coins: 0 },
    swinging: false,
    swingT: 0,
    swingPending: false,
    swingSeq: 0,
    focusId: -1,
    icd: {},
    moving: false,
    passiveMods: [],
    toggleMods: [],
    inProc: false,
    lowHpArmed: true,
    castMult: 1,
    cdrPct: 0,
  };
}

function blankProjectile(): Projectile {
  return {
    id: 0,
    active: false,
    x: 0,
    z: 0,
    dx: 0,
    dz: 1,
    speed: 0,
    radius: 0.3,
    range: 0,
    pierceLeft: 0,
    bounceLeft: 0,
    homing: false,
    targetId: -1,
    team: 'player',
    color: '#fff',
    hitSet: [],
    onHit: null,
    ctx: null,
    attack: null,
    attackerId: -1,
  };
}
function blankArea(): AreaInst {
  return {
    id: 0,
    active: false,
    spec: blankShape('circle'),
    delay: 0,
    duration: 0,
    tick: 0.5,
    elapsed: 0,
    nextTick: 0,
    effects: [],
    ctx: null as unknown as FxCtx,
    team: 'player',
    scatter: null,
    once: false,
  };
}
function blankTelegraph(): Telegraph {
  return {
    id: 0,
    shape: 'circle',
    x: 0,
    z: 0,
    heading: 0,
    radius: 0,
    angleDeg: 0,
    length: 0,
    width: 0,
    inner: 0,
    t: 0,
    warn: 1,
    kind: 'damage',
    ownerId: -1,
    active: false,
  };
}
