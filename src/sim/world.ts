import { Rng } from '../core/rng';
import type { Balance, DebugSkill } from '../data/schema';
import { rollHit } from './damage';
import { angleDiff, circleHits, coneHits, dist, headingOf, lineHits } from './geometry';

export interface Dummy {
  id: number;
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  /** Seconds of hit flash left. */
  flash: number;
  alive: boolean;
  deadFor: number;
}

export interface HeroState {
  x: number;
  z: number;
  px: number;
  pz: number;
  heading: number;
  pheading: number;
  /** True while the hero moves, from joystick or from stepping toward a target. */
  moving: boolean;
  swinging: boolean;
  swingT: number;
  swingPending: boolean;
  /** Increments whenever an attack animation should start. */
  swingSeq: number;
}

export type SimEvent =
  | { t: 'dmg'; targetId: number; x: number; z: number; amount: number; crit: boolean }
  | { t: 'kill'; targetId: number }
  | {
      t: 'fx';
      shape: 'circle' | 'cone' | 'line';
      x: number;
      z: number;
      heading: number;
      size: number;
      angleDeg: number;
      width: number;
      color: string;
    };

export interface CastRequest {
  slot: number;
  /** World point the player aimed at (mouse cursor or drag). Null means tap: use target or facing. */
  aim: { x: number; z: number } | null;
}

export interface TickInput {
  /** Desired move vector, magnitude 0..1 (analog). */
  moveX: number;
  moveZ: number;
  casts: CastRequest[];
}

export type CastResult = 'ok' | 'cooldown' | 'noTarget' | 'invalid';

/** M0 skeleton of the simulation: pure logic, no three.js and no DOM (PRD Section 0, rule 5). */
export class SimWorld {
  readonly hero: HeroState;
  readonly dummies: Dummy[] = [];
  readonly rng: Rng;
  readonly events: SimEvent[] = [];
  readonly cooldown: number[];
  readonly cooldownMax: number[];
  gcd = 0;
  focusId = -1;
  godMode = false;
  time = 0;

  constructor(
    readonly cfg: Balance,
    readonly skills: DebugSkill[],
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.hero = {
      x: 0,
      z: 0,
      px: 0,
      pz: 0,
      heading: Math.PI,
      pheading: Math.PI,
      moving: false,
      swinging: false,
      swingT: 0,
      swingPending: false,
      swingSeq: 0,
    };
    this.cooldown = skills.map(() => 0);
    this.cooldownMax = skills.map((s) => s.cooldown);
    this.placeDummies();
  }

  private placeDummies(): void {
    const d = this.cfg.dummies;
    const layout = new Rng(d.seed);
    let guard = 0;
    while (this.dummies.length < d.count && guard++ < 20000) {
      const ang = layout.next() * Math.PI * 2;
      const rad =
        d.spawnClearRadius + Math.sqrt(layout.next()) * (d.placeRadius - d.spawnClearRadius);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (this.dummies.some((o) => dist(o.x, o.z, x, z) < d.minSpacing)) continue;
      this.dummies.push({
        id: this.dummies.length,
        x,
        z,
        r: d.radius,
        hp: d.hp,
        maxHp: d.hp,
        flash: 0,
        alive: true,
        deadFor: 0,
      });
    }
  }

  drainEvents(): SimEvent[] {
    return this.events.splice(0, this.events.length);
  }

  nearestAlive(x: number, z: number, maxDist: number): Dummy | null {
    let best: Dummy | null = null;
    let bestD = maxDist;
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const dd = dist(x, z, d.x, d.z) - d.r;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  /** Closest alive dummy to a ground point, used to turn a screen tap into a focus target. */
  pickAt(x: number, z: number): Dummy | null {
    let best: Dummy | null = null;
    let bestD = this.cfg.targeting.focusPickRadius;
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const dd = dist(x, z, d.x, d.z) - d.r;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  setFocus(id: number): void {
    this.focusId = id;
  }

  /** Tab: focus the next alive target by distance. */
  cycleFocus(): void {
    const h = this.hero;
    const alive = this.dummies
      .filter((d) => d.alive)
      .sort((a, b) => dist(h.x, h.z, a.x, a.z) - dist(h.x, h.z, b.x, b.z));
    if (alive.length === 0) {
      this.focusId = -1;
      return;
    }
    const i = alive.findIndex((d) => d.id === this.focusId);
    this.focusId = alive[(i + 1) % alive.length].id;
  }

  private currentTarget(): Dummy | null {
    if (this.focusId >= 0) {
      const f = this.dummies[this.focusId];
      if (f && f.alive) return f;
      this.focusId = -1;
    }
    return this.nearestAlive(this.hero.x, this.hero.z, this.cfg.targeting.autoAttackRange);
  }

  tick(dt: number, input: TickInput): void {
    const { cfg, hero } = this;
    this.time += dt;
    hero.px = hero.x;
    hero.pz = hero.z;
    hero.pheading = hero.heading;

    for (let i = 0; i < this.cooldown.length; i++)
      this.cooldown[i] = Math.max(0, this.cooldown[i] - dt);
    this.gcd = Math.max(0, this.gcd - dt);
    for (const d of this.dummies) {
      if (d.flash > 0) d.flash = Math.max(0, d.flash - dt);
      if (!d.alive) {
        d.deadFor += dt;
        if (d.deadFor >= cfg.dummies.respawnSec) {
          d.alive = true;
          d.hp = d.maxHp;
          d.deadFor = 0;
        }
      }
    }

    const mag = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    hero.moving = false;

    if (mag > 0) {
      // Moving cancels an attack wind-up: stop to attack, move to dodge (PRD Section 5).
      hero.swinging = false;
      hero.swingPending = false;
      const nx = input.moveX / mag;
      const nz = input.moveZ / mag;
      this.moveHero(nx * mag * cfg.hero.moveSpeed * dt, nz * mag * cfg.hero.moveSpeed * dt);
      this.turnToward(headingOf(nx, nz), dt);
      hero.moving = true;
    } else {
      this.autoAttack(dt);
    }

    for (const c of input.casts) this.cast(c);
  }

  private moveHero(dx: number, dz: number): void {
    const { hero, cfg } = this;
    hero.x += dx;
    hero.z += dz;
    const lim = cfg.arena.radius - cfg.hero.radius;
    const r = Math.hypot(hero.x, hero.z);
    if (r > lim) {
      hero.x *= lim / r;
      hero.z *= lim / r;
    }
    // Push out of dummies (circle vs circle).
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const minD = d.r + cfg.hero.radius;
      const dd = dist(hero.x, hero.z, d.x, d.z);
      if (dd < minD && dd > 1e-6) {
        hero.x = d.x + ((hero.x - d.x) / dd) * minD;
        hero.z = d.z + ((hero.z - d.z) / dd) * minD;
      }
    }
  }

  private turnToward(target: number, dt: number): void {
    const h = this.hero;
    const diff = angleDiff(h.heading, target);
    const maxStep = this.cfg.hero.turnRate * dt;
    h.heading += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
  }

  private autoAttack(dt: number): void {
    const { hero, cfg } = this;
    const w = cfg.hero.weapon;
    const cycle = 1 / w.aps;
    const target = this.currentTarget();

    if (hero.swinging) {
      hero.swingT += dt;
      if (hero.swingPending && hero.swingT >= cycle * w.windupFraction) {
        hero.swingPending = false;
        if (target) this.hit(target, 1);
      }
      if (hero.swingT >= cycle) hero.swinging = false;
      return;
    }
    if (!target) return;

    const reach = w.range + target.r;
    const d = dist(hero.x, hero.z, target.x, target.z);
    const want = headingOf(target.x - hero.x, target.z - hero.z);
    this.turnToward(want, dt);
    if (d > reach) {
      // Step into weapon range.
      const step = Math.min(cfg.hero.moveSpeed * dt, d - reach + 0.05);
      this.moveHero(((target.x - hero.x) / d) * step, ((target.z - hero.z) / d) * step);
      hero.moving = true;
    } else if (Math.abs(angleDiff(hero.heading, want)) < 0.5) {
      hero.swinging = true;
      hero.swingT = 0;
      hero.swingPending = true;
      hero.swingSeq++;
    }
  }

  private hit(target: Dummy, atkPct: number): void {
    const { cfg } = this;
    const roll = rollHit(this.rng, {
      atk: cfg.hero.atk,
      atkPct,
      critChance: cfg.hero.critChance,
      critMult: cfg.hero.critMult,
      variance: cfg.hero.variance,
    });
    target.hp -= roll.amount;
    target.flash = cfg.dummies.flashSec;
    this.events.push({
      t: 'dmg',
      targetId: target.id,
      x: target.x,
      z: target.z,
      amount: roll.amount,
      crit: roll.crit,
    });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deadFor = 0;
      if (this.focusId === target.id) this.focusId = -1;
      this.events.push({ t: 'kill', targetId: target.id });
    }
  }

  /** Casts a debug skill. Returns why it failed, or 'ok'. */
  cast(req: CastRequest): CastResult {
    const skill = this.skills[req.slot];
    if (!skill) return 'invalid';
    if (this.cooldown[req.slot] > 0 || this.gcd > 0) return 'cooldown';
    const { hero, cfg } = this;
    const fx = skill.effect;

    // Aim: explicit point, else focus or nearest enemy, else the facing direction.
    let ax: number;
    let az: number;
    if (req.aim) {
      ax = req.aim.x;
      az = req.aim.z;
    } else {
      const t = this.currentTargetForCast();
      if (t) {
        ax = t.x;
        az = t.z;
      } else {
        // Nothing to aim at: ground areas land 4 m ahead (PRD Section 5 table).
        ax = hero.x + Math.sin(hero.heading) * 4;
        az = hero.z + Math.cos(hero.heading) * 4;
      }
    }
    const heading = headingOf(ax - hero.x, az - hero.z) || hero.heading;
    hero.heading = heading;
    hero.pheading = heading;

    let cx = hero.x;
    let cz = hero.z;
    if (fx.at === 'ground') {
      const reach = fx.reach ?? 10;
      const d = dist(hero.x, hero.z, ax, az);
      const k = d > reach ? reach / d : 1;
      cx = hero.x + (ax - hero.x) * k;
      cz = hero.z + (az - hero.z) * k;
    }

    this.cooldown[req.slot] = skill.cooldown;
    this.gcd = cfg.skills.globalCooldown;
    hero.swingSeq++;
    hero.swinging = false;
    hero.swingPending = false;

    const angleRad = ((fx.angleDeg ?? 0) * Math.PI) / 180;
    this.events.push({
      t: 'fx',
      shape: fx.shape,
      x: cx,
      z: cz,
      heading,
      size: fx.range,
      angleDeg: fx.angleDeg ?? 0,
      width: fx.width ?? 0,
      color: skill.color,
    });

    for (const d of this.dummies) {
      if (!d.alive) continue;
      let inside: boolean;
      if (fx.shape === 'circle') inside = circleHits(cx, cz, fx.range, d.x, d.z, d.r);
      else if (fx.shape === 'cone')
        inside = coneHits(cx, cz, heading, fx.range, angleRad, d.x, d.z, d.r);
      else inside = lineHits(cx, cz, heading, fx.range, fx.width ?? 1, d.x, d.z, d.r);
      if (!inside) continue;
      for (let h = 0; h < fx.hits && d.alive; h++) this.hit(d, fx.atkPct);
    }
    return 'ok';
  }

  private currentTargetForCast(): Dummy | null {
    if (this.focusId >= 0) {
      const f = this.dummies[this.focusId];
      if (f && f.alive) return f;
    }
    return this.nearestAlive(this.hero.x, this.hero.z, this.cfg.targeting.castTargetRange);
  }
}
