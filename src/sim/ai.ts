import type { AttackDef, MonsterDef } from '../data/types';
import { dist, headingOf, inShape, blankShape, angleDiff, type ShapeSpec } from './geometry';
import { forEachEnemyOf, healUnit, targetable } from './combat';
import { canAct, moveMult } from './status';
import type { AiState, Telegraph, Unit } from './types';
import type { SimWorld } from './world';

// Monster AI archetypes (PRD Section 10): chaser, kiter, caster, charger and burrower, with
// telegraphed attacks. Every attack that can hit hard shows a ground shape that fills up first.

const RECOVER = 0.45;

function defOf(w: SimWorld, m: Unit): MonsterDef | null {
  return w.content.monsters.get(m.defId) ?? w.content.bosses.get(m.defId) ?? null;
}

/** The attacks a monster may use right now: a boss is limited to its current phase's list. */
function attackPool(w: SimWorld, m: Unit, def: MonsterDef): AttackDef[] {
  if (!m.isBoss || !w.bossDef) return def.attacks;
  const phase = w.bossDef.phases[Math.min(m.ai!.script.phase ?? 0, w.bossDef.phases.length - 1)];
  return def.attacks.filter((a) => phase.attacks.includes(a.id));
}

/** Who a monster fights: its taunter, else the nearest of the hero and the hero's summons. */
function pickTarget(w: SimWorld, m: Unit): Unit | null {
  if (m.ai?.script.toQueen) return w.boss && w.boss.alive ? w.boss : null;
  if (m.tauntT > 0) {
    const t = w.unitById(m.tauntTarget);
    if (t && t.alive) return t;
  }
  let best: Unit | null = w.hero.alive ? w.hero : null;
  let bestD = best ? dist(m.x, m.z, best.x, best.z) : Infinity;
  forEachEnemyOf(w, m, (u) => {
    if (u.kind !== 'summon') return;
    const d = dist(m.x, m.z, u.x, u.z);
    if (d < bestD - 2) {
      best = u;
      bestD = d;
    }
  });
  return best;
}

function turnToward(m: Unit, want: number, dt: number, rate = 10): void {
  const diff = angleDiff(m.heading, want);
  const step = rate * dt;
  m.heading += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
}

/** Moves toward a point, using A* around obstacles when the straight line is blocked. */
function moveToward(
  w: SimWorld,
  m: Unit,
  tx: number,
  tz: number,
  dt: number,
  stop: number,
  speedMult = 1,
): number {
  const ai = m.ai!;
  const d = dist(m.x, m.z, tx, tz);
  if (d <= stop) return d;
  let gx = tx;
  let gz = tz;
  ai.pathT -= dt;
  if (ai.pathT <= 0) {
    ai.pathT = 0.35;
    if (w.nav.lineClear(m.x, m.z, tx, tz, m.r * 0.8)) ai.path = null;
    else ai.path = w.nav.findPath(m.x, m.z, tx, tz);
  }
  if (ai.path && ai.path.length > 0) {
    while (ai.path.length > 1 && dist(m.x, m.z, ai.path[0].x, ai.path[0].z) < 0.9) ai.path.shift();
    gx = ai.path[0].x;
    gz = ai.path[0].z;
  }
  const want = headingOf(gx - m.x, gz - m.z);
  turnToward(m, want, dt);
  const speed = m.moveSpeed * moveMult(w.b, m) * speedMult;
  const step = Math.min(speed * dt, d - stop + 0.01);
  stepBy(w, m, Math.sin(want) * step, Math.cos(want) * step, dt);
  return d;
}

function stepBy(w: SimWorld, m: Unit, dx: number, dz: number, dt: number): void {
  // Separation: push away from close neighbours so packs spread out instead of stacking.
  let sx = 0;
  let sz = 0;
  let hx = 0;
  let hz = 0;
  w.hash.query(m.x, m.z, m.r + 1.2, (o) => {
    if (o === m || !o.alive || o.team !== m.team) return;
    let d = dist(m.x, m.z, o.x, o.z);
    const min = m.r + o.r;
    if (d < 1e-6) {
      // Exactly stacked: pick a stable direction from the ids so the pair separates.
      d = 1e-3;
      sx += m.id > o.id ? 1 : -1;
    }
    if (d < min + 0.4) {
      const push = (min + 0.4 - d) / (min + 0.4);
      sx += ((m.x - o.x) / d) * push;
      sz += ((m.z - o.z) / d) * push;
    }
    // Hard correction: never let two bodies overlap by more than 15%.
    if (d < min * 0.85) {
      const fix = (min * 0.85 - d) * 0.5;
      hx += ((m.x - o.x) / d) * fix;
      hz += ((m.z - o.z) / d) * fix;
    }
  });
  // Separation scales with the unit's speed, so it can beat the pull toward the hero.
  const push = w.b.monster.separation * Math.max(m.moveSpeed, 2) * 1.5 * dt;
  const p = { x: m.x + dx + sx * push + hx, z: m.z + dz + sz * push + hz };
  w.nav.collide(p, m.r);
  m.x = p.x;
  m.z = p.z;
}

// --- Telegraphs -------------------------------------------------------------------------------

function newTelegraph(w: SimWorld): Telegraph | null {
  return w.telegraphs.find((t) => !t.active) ?? null;
}

function shapeFor(atk: AttackDef, x: number, z: number, heading: number): ShapeSpec {
  const t = atk.telegraph!;
  const s = blankShape(t.shape, x, z, heading);
  s.radius = t.radius ?? t.length ?? 0;
  s.angleDeg = t.angleDeg ?? 0;
  s.length = t.length ?? t.radius ?? 0;
  s.width = t.width ?? 1;
  s.inner = t.inner ?? 0;
  return s;
}

function openTelegraph(w: SimWorld, m: Unit, atk: AttackDef, spec: ShapeSpec): number {
  const t = newTelegraph(w);
  if (!t) return -1;
  t.active = true;
  t.id = w.nextId++;
  t.shape = spec.shape;
  t.x = spec.x;
  t.z = spec.z;
  t.heading = spec.heading;
  t.radius = spec.radius;
  t.angleDeg = spec.angleDeg;
  t.length = spec.length;
  t.width = spec.width;
  t.inner = spec.inner;
  t.t = 0;
  t.warn = atk.telegraph!.warn;
  t.ownerId = m.id;
  const st = atk.damage?.status?.id;
  t.kind =
    st === 'freeze'
      ? 'freeze'
      : st && st !== 'poison' && st !== 'burn' && st !== 'bleed' && st !== 'root'
        ? 'debuff'
        : 'damage';
  return t.id;
}

function closeTelegraph(w: SimWorld, id: number): void {
  if (id < 0) return;
  const t = w.telegraphs.find((x) => x.active && x.id === id);
  if (t) t.active = false;
}

export function cancelWindup(w: SimWorld, m: Unit): void {
  const ai = m.ai;
  if (!ai) return;
  if (ai.state === 'windup' || ai.state === 'erupt') {
    closeTelegraph(w, ai.telegraphId);
    ai.telegraphId = -1;
    ai.attackId = null;
    ai.state = ai.archetype === 'burrower' ? 'hidden' : 'chase';
    ai.t = 0;
  }
}

// --- Attacks ----------------------------------------------------------------------------------

function readyAttack(
  w: SimWorld,
  m: Unit,
  def: MonsterDef,
  target: Unit,
  filter?: (a: AttackDef) => boolean,
): AttackDef | null {
  const ai = m.ai!;
  const d = dist(m.x, m.z, target.x, target.z) - target.r;
  const ready = attackPool(w, m, def).filter(
    (a) => a.weight > 0 && (ai.cooldowns[a.id] ?? 0) <= 0 && d <= a.range && (!filter || filter(a)),
  );
  if (ready.length === 0) return null;
  const total = ready.reduce((s, a) => s + a.weight, 0);
  let r = w.rng.next() * total;
  for (const a of ready) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ready[0];
}

function beginAttack(w: SimWorld, m: Unit, atk: AttackDef, target: Unit, warnScale = 1): void {
  const ai = m.ai!;
  ai.state = 'windup';
  ai.t = 0;
  ai.attackId = atk.id;
  ai.cooldowns[atk.id] = atk.cooldown;
  const toward = headingOf(target.x - m.x, target.z - m.z);
  ai.lockHeading = toward;
  ai.script.warnScale = warnScale;
  if (atk.telegraph) {
    const at = atk.telegraph.at;
    const shape = atk.telegraph.shape;
    // Circles and donuts land where the hero stood; lines and cones start at the monster.
    const atTarget =
      (at === 'target' || at === 'targetLocked') &&
      (shape === 'circle' || shape === 'donut' || shape === 'cross');
    ai.lockX = atTarget ? target.x : m.x;
    ai.lockZ = atTarget ? target.z : m.z;
    const spec = shapeFor(atk, ai.lockX, ai.lockZ, toward);
    if (atk.telegraph.at === 'self') {
      spec.x = m.x;
      spec.z = m.z;
    }
    ai.telegraphId = openTelegraph(w, m, atk, spec);
    const tg = w.telegraphs.find((t) => t.active && t.id === ai.telegraphId);
    if (tg) tg.warn *= warnScale;
  } else {
    ai.lockX = target.x;
    ai.lockZ = target.z;
    ai.telegraphId = -1;
  }
}

function windupTime(atk: AttackDef, scale: number): number {
  return (atk.telegraph?.warn ?? (atk.projectile ? 0.4 : 0.3)) * scale;
}

function resolveAttack(w: SimWorld, m: Unit, atk: AttackDef, target: Unit | null): void {
  const ai = m.ai!;
  const tgId = ai.telegraphId;
  closeTelegraph(w, tgId);
  ai.telegraphId = -1;

  if (atk.summon) {
    for (let i = 0; i < atk.summon.count; i++) {
      const def = w.content.monsters.get(atk.summon.monsterId);
      if (def) w.spawnMonster(def, m.x + Math.cos(i) * 2, m.z + Math.sin(i) * 2, m.level, {});
    }
    return;
  }
  if (atk.projectile) {
    const count = atk.projectile.count ?? 1;
    const spread = ((atk.projectile.spreadDeg ?? 0) * Math.PI) / 180;
    const base = target ? headingOf(target.x - m.x, target.z - m.z) : m.heading;
    for (let i = 0; i < count; i++) {
      const p = w.projectiles.find((x) => !x.active);
      if (!p) return;
      const a = count === 1 ? base : base + (i / (count - 1) - 0.5) * spread;
      p.active = true;
      p.x = m.x + Math.sin(a) * (m.r + 0.2);
      p.z = m.z + Math.cos(a) * (m.r + 0.2);
      p.dx = Math.sin(a);
      p.dz = Math.cos(a);
      p.speed = atk.projectile.speed;
      p.radius = 0.4;
      p.range = atk.range + 4;
      p.pierceLeft = 0;
      p.bounceLeft = 0;
      p.homing = false;
      p.targetId = -1;
      p.team = 'enemy';
      p.color = '#c46bff';
      p.hitSet.length = 0;
      p.onHit = null;
      p.ctx = null;
      p.attack = atk;
      p.attackerId = m.id;
    }
    return;
  }
  const hitShape = (spec: ShapeSpec) =>
    forEachEnemyOf(w, m, (u) => {
      if (inShape(spec, u.x, u.z, u.r)) w.monsterAttackHit(m, atk, u);
    });
  if (atk.script === 'leap') {
    // The Queen leaps onto the hero's spot, then lands.
    const p = { x: ai.lockX, z: ai.lockZ };
    w.nav.collide(p, m.r);
    m.x = p.x;
    m.z = p.z;
    const spec = shapeFor(atk, m.x, m.z, ai.lockHeading);
    hitShape(spec);
    return;
  }
  if (atk.script === 'roll') {
    const spec = shapeFor(atk, ai.lockX, ai.lockZ, ai.lockHeading);
    hitShape(spec);
    ai.state = 'dash';
    ai.dashLeft = spec.length;
    ai.t = 0;
    return;
  }
  if (atk.telegraph) {
    const t = atk.telegraph;
    if (m.ai!.archetype === 'charger' && t.shape === 'line') {
      ai.state = 'dash';
      ai.dashLeft = t.length ?? 8;
      ai.script.hitDuringDash = 0;
      ai.script.dashAttack = 1;
      return;
    }
    const spec = shapeFor(atk, ai.lockX, ai.lockZ, ai.lockHeading);
    if (t.at === 'self') {
      spec.x = m.x;
      spec.z = m.z;
    }
    hitShape(spec);
    return;
  }
  // Plain melee swing: hits whatever is still within reach when the windup ends.
  if (target && dist(m.x, m.z, target.x, target.z) <= atk.range + target.r + 0.5)
    w.monsterAttackHit(m, atk, target);
}

function attackById(def: MonsterDef, id: string | null): AttackDef | null {
  return def.attacks.find((a) => a.id === id) ?? null;
}

// --- Per-archetype update ---------------------------------------------------------------------

export function updateMonster(w: SimWorld, m: Unit, dt: number): void {
  const ai = m.ai;
  if (!ai) return;
  if (m.summon) return updateSummon(w, m, dt);
  if (ai.archetype === 'dummy') return;
  const def = defOf(w, m);
  if (!def) return;
  for (const k of Object.keys(ai.cooldowns)) ai.cooldowns[k] = Math.max(0, ai.cooldowns[k] - dt);
  if (m.staggerT > 0 || !canAct(m)) {
    cancelWindup(w, m);
    return;
  }
  ai.t += dt;
  // Packs spread out even while standing still (attacking, recovering, waiting).
  if (ai.state !== 'hidden' && ai.state !== 'erupt' && ai.state !== 'dash' && !m.isBoss)
    stepBy(w, m, 0, 0, dt);
  const target = pickTarget(w, m);
  if (!target) {
    ai.state = ai.state === 'hidden' ? 'hidden' : 'idle';
    ai.hasAggro = false;
    return;
  }
  // The leash comes first: a monster dragged more than 30 m from its spawn gives up, even mid-attack.
  if (
    !m.isBoss &&
    !ai.script.toQueen &&
    ai.hasAggro &&
    ai.state !== 'return' &&
    dist(m.x, m.z, ai.spawnX, ai.spawnZ) > w.b.monster.leashRange
  ) {
    cancelWindup(w, m);
    ai.state = 'return';
    ai.hasAggro = false;
  }
  switch (ai.archetype) {
    case 'kiter':
    case 'support':
      return kiter(w, m, ai, def, target, dt);
    case 'caster':
      return caster(w, m, ai, def, target, dt);
    case 'burrower':
      return burrower(w, m, ai, def, target, dt);
    default:
      return chaser(w, m, ai, def, target, dt);
  }
}

/** Shared windup, recover and dash states. Returns true when the state consumed this tick. */
function commonStates(
  w: SimWorld,
  m: Unit,
  ai: AiState,
  def: MonsterDef,
  target: Unit,
  dt: number,
): boolean {
  if (ai.state === 'windup') {
    const atk = attackById(def, ai.attackId);
    if (!atk) {
      ai.state = 'chase';
      return true;
    }
    // Plain attacks keep facing the target; telegraphed ones are locked in place.
    if (!atk.telegraph) turnToward(m, headingOf(target.x - m.x, target.z - m.z), dt);
    if (ai.t >= windupTime(atk, ai.script.warnScale ?? 1)) {
      resolveAttack(w, m, atk, target);
      // Enraged double slam: do it again at once with a shorter warning.
      if (ai.state === 'windup') {
        ai.state = 'recover';
        ai.t = 0;
        if (m.isBoss && ai.script.enraged && atk.script === 'leap' && !ai.script.slammedTwice) {
          ai.script.slammedTwice = 1;
          ai.cooldowns[atk.id] = 0;
          beginAttack(w, m, atk, target, 0.6);
        } else if (atk.script === 'leap') {
          ai.script.slammedTwice = 0;
        }
      }
    }
    return true;
  }
  if (ai.state === 'dash') {
    const dirX = Math.sin(ai.lockHeading);
    const dirZ = Math.cos(ai.lockHeading);
    const speed = ai.script.dashAttack ? 14 : 30;
    const step = Math.min(ai.dashLeft, speed * dt);
    const p = { x: m.x + dirX * step, z: m.z + dirZ * step };
    const before = { ...p };
    w.nav.collide(p, m.r);
    m.x = p.x;
    m.z = p.z;
    m.heading = ai.lockHeading;
    ai.dashLeft -= step;
    if (ai.script.dashAttack && !ai.script.hitDuringDash) {
      const atk = attackById(def, ai.attackId);
      if (atk && dist(m.x, m.z, target.x, target.z) <= m.r + target.r + 0.6) {
        ai.script.hitDuringDash = 1;
        w.monsterAttackHit(m, atk, target);
      }
    }
    if (ai.dashLeft <= 1e-6 || Math.hypot(p.x - before.x, p.z - before.z) > step * 0.8) {
      ai.state = 'recover';
      ai.t = 0;
      ai.script.dashAttack = 0;
    }
    return true;
  }
  if (ai.state === 'recover') {
    if (ai.t >= RECOVER) {
      ai.state = 'chase';
      ai.t = 0;
    }
    return true;
  }
  return false;
}

/** Wake up when the hero comes within aggro range; give up and return when too far from spawn. */
function updateAggro(w: SimWorld, m: Unit, ai: AiState, target: Unit, dt: number): boolean {
  const d = dist(m.x, m.z, target.x, target.z);
  if (!ai.hasAggro) {
    if (d <= aggroOf(w, m)) {
      ai.hasAggro = true;
      ai.state = 'chase';
    } else return false;
  }
  if (!m.isBoss && !ai.script.toQueen) {
    const fromSpawn = dist(m.x, m.z, ai.spawnX, ai.spawnZ);
    if (ai.state !== 'return' && fromSpawn > w.b.monster.leashRange) {
      ai.state = 'return';
      ai.hasAggro = false;
      cancelWindup(w, m);
    }
  }
  void dt;
  return true;
}

/** Separate function so TypeScript does not keep a stale narrowed state across updateAggro. */
function isReturning(ai: AiState): boolean {
  return ai.state === 'return';
}

function aggroOf(w: SimWorld, m: Unit): number {
  return defOf(w, m)?.aggroRange ?? w.b.monster.aggroRange;
}

/** Walks back to the spawn point and heals to full after leashing. */
function returnHome(w: SimWorld, m: Unit, ai: AiState, dt: number): void {
  const d = moveToward(w, m, ai.spawnX, ai.spawnZ, dt, 0.6, 1.3);
  if (d <= 0.7) {
    ai.state = 'idle';
    ai.hasAggro = false;
    m.hp = m.maxHp;
  }
}

function chaser(
  w: SimWorld,
  m: Unit,
  ai: AiState,
  def: MonsterDef,
  target: Unit,
  dt: number,
): void {
  if (ai.state === 'return') return returnHome(w, m, ai, dt);
  if (commonStates(w, m, ai, def, target, dt)) return;
  if (ai.script.toQueen) return crawlToQueen(w, m, ai, target, dt);
  if (!updateAggro(w, m, ai, target, dt)) return;
  if (isReturning(ai)) return returnHome(w, m, ai, dt);
  ai.think -= dt;
  const atk = ai.think <= 0 ? readyAttack(w, m, def, target) : null;
  if (atk) {
    beginAttack(w, m, atk, target);
    ai.think = m.isBoss ? 0.8 : 0.1;
    return;
  }
  // Close in until just inside the shortest melee reach, or the boss's comfortable distance.
  const reach = Math.min(
    ...attackPool(w, m, def)
      .filter((a) => a.weight > 0)
      .map((a) => a.range),
    3,
  );
  const stop = Math.max(0.6, Math.min(reach * 0.8, m.isBoss ? 6 : 1.6)) + target.r + m.r * 0.3;
  moveToward(w, m, target.x, target.z, dt, stop);
}

/** A Jelly add on its way to the Queen. Reaching her heals her 4% and the add is gone. */
function crawlToQueen(w: SimWorld, m: Unit, ai: AiState, queen: Unit, dt: number): void {
  const d = moveToward(w, m, queen.x, queen.z, dt, queen.r + m.r + 0.3, 1.1);
  if (d <= queen.r + m.r + 0.6) {
    healUnit(w, queen, queen.maxHp * 0.04);
    m.alive = false;
    m.id = -1;
    void ai;
  }
}

function kiter(w: SimWorld, m: Unit, ai: AiState, def: MonsterDef, target: Unit, dt: number): void {
  if (ai.state === 'return') return returnHome(w, m, ai, dt);
  if (commonStates(w, m, ai, def, target, dt)) return;
  if (!updateAggro(w, m, ai, target, dt)) return;
  if (isReturning(ai)) return returnHome(w, m, ai, dt);
  const atk = def.attacks[0];
  const d = dist(m.x, m.z, target.x, target.z);
  const want = headingOf(target.x - m.x, target.z - m.z);
  if (d < 3) {
    // Back off when the hero gets close.
    turnToward(m, want + Math.PI, dt);
    stepBy(
      w,
      m,
      -Math.sin(want) * m.moveSpeed * moveMult(w.b, m) * dt,
      -Math.cos(want) * m.moveSpeed * moveMult(w.b, m) * dt,
      dt,
    );
  } else if (d > Math.min(9, atk.range)) {
    moveToward(w, m, target.x, target.z, dt, 6);
  } else if (d < 6) {
    const side = want + (Math.PI / 2) * ai.strafeDir;
    stepBy(
      w,
      m,
      Math.sin(side) * m.moveSpeed * 0.5 * dt,
      Math.cos(side) * m.moveSpeed * 0.5 * dt,
      dt,
    );
    turnToward(m, want, dt);
  } else {
    turnToward(m, want, dt);
    if (Math.floor(ai.t / 2) % 2 === 0) ai.strafeDir = ai.strafeDir || 1;
  }
  if (
    (ai.cooldowns[atk.id] ?? 0) <= 0 &&
    d <= atk.range &&
    w.nav.lineClear(m.x, m.z, target.x, target.z, 0.2)
  ) {
    beginAttack(w, m, atk, target);
  }
}

function caster(
  w: SimWorld,
  m: Unit,
  ai: AiState,
  def: MonsterDef,
  target: Unit,
  dt: number,
): void {
  if (ai.state === 'return') return returnHome(w, m, ai, dt);
  if (commonStates(w, m, ai, def, target, dt)) return;
  if (!updateAggro(w, m, ai, target, dt)) return;
  if (isReturning(ai)) return returnHome(w, m, ai, dt);
  const atk = def.attacks[0];
  const d = dist(m.x, m.z, target.x, target.z);
  const want = headingOf(target.x - m.x, target.z - m.z);
  if (d > atk.range - 1) moveToward(w, m, target.x, target.z, dt, atk.range - 2);
  else if (d < 4) {
    turnToward(m, want + Math.PI, dt);
    stepBy(w, m, -Math.sin(want) * m.moveSpeed * dt, -Math.cos(want) * m.moveSpeed * dt, dt);
  } else turnToward(m, want, dt);
  if ((ai.cooldowns[atk.id] ?? 0) <= 0 && d <= atk.range) beginAttack(w, m, atk, target);
}

/**
 * Rootmole: hides underground and cannot be targeted. When the hero comes near it shows an
 * eruption circle under them, then pops up there and fights for a few seconds before burrowing.
 */
function burrower(
  w: SimWorld,
  m: Unit,
  ai: AiState,
  def: MonsterDef,
  target: Unit,
  dt: number,
): void {
  const erupt = def.attacks.find((a) => a.telegraph);
  const bite = def.attacks.find((a) => !a.telegraph);
  const d = dist(m.x, m.z, target.x, target.z);
  if (ai.state === 'hidden') {
    if (d <= def.aggroRange && erupt && (ai.cooldowns[erupt.id] ?? 0) <= 0 && ai.t > 1.0) {
      ai.state = 'erupt';
      ai.t = 0;
      ai.attackId = erupt.id;
      ai.cooldowns[erupt.id] = erupt.cooldown;
      ai.lockX = target.x;
      ai.lockZ = target.z;
      ai.lockHeading = headingOf(target.x - m.x, target.z - m.z);
      ai.telegraphId = openTelegraph(
        w,
        m,
        erupt,
        shapeFor(erupt, ai.lockX, ai.lockZ, ai.lockHeading),
      );
    }
    return;
  }
  // ai.t restarts on every state change, so the time spent above ground has its own counter.
  if (ai.state !== 'erupt') ai.script.surfaced = (ai.script.surfaced ?? 0) + dt;
  if (ai.state === 'erupt') {
    if (ai.t >= erupt!.telegraph!.warn) {
      closeTelegraph(w, ai.telegraphId);
      ai.telegraphId = -1;
      const p = { x: ai.lockX, z: ai.lockZ };
      w.nav.collide(p, m.r);
      m.x = p.x;
      m.z = p.z;
      const spec = shapeFor(erupt!, m.x, m.z, 0);
      forEachEnemyOf(w, m, (u) => {
        if (inShape(spec, u.x, u.z, u.r)) w.monsterAttackHit(m, erupt!, u);
      });
      ai.state = 'chase';
      ai.t = 0;
      ai.script.surfaced = 0;
    }
    return;
  }
  if (commonStates(w, m, ai, def, target, dt)) return;
  if (ai.script.surfaced >= 4.5 && ai.state !== 'windup') {
    ai.state = 'hidden';
    ai.t = 0;
    return;
  }
  const atk = bite && (ai.cooldowns[bite.id] ?? 0) <= 0 && d - target.r <= bite.range ? bite : null;
  if (atk) beginAttack(w, m, atk, target);
  else moveToward(w, m, target.x, target.z, dt, 1.2 + target.r);
}

// --- Summons ----------------------------------------------------------------------------------

function updateSummon(w: SimWorld, m: Unit, dt: number): void {
  const s = m.summon!;
  const def = w.content.summons.get(m.defId);
  if (!def || !canAct(m)) return;
  s.attackCd = Math.max(0, s.attackCd - dt);
  let best: Unit | null = null;
  let bestD = 14;
  forEachEnemyOf(w, m, (u) => {
    const d = dist(m.x, m.z, u.x, u.z);
    if (d < bestD && targetable(u)) {
      bestD = d;
      best = u;
    }
  });
  const owner = w.unitById(s.ownerId);
  if (!best) {
    if (owner && dist(m.x, m.z, owner.x, owner.z) > 3.5)
      moveToward(w, m, owner.x, owner.z, dt, 2.5);
    return;
  }
  const t: Unit = best;
  const d = dist(m.x, m.z, t.x, t.z);
  if (d - t.r > def.attack.range) moveToward(w, m, t.x, t.z, dt, def.attack.range * 0.8 + t.r);
  else {
    turnToward(m, headingOf(t.x - m.x, t.z - m.z), dt);
    if (s.attackCd <= 0) {
      s.attackCd = 1 / m.aps;
      w.summonHit(m, t, def);
    }
  }
}
