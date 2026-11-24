import type { MonsterDef } from '../data/types';
import { dist } from './geometry';
import type { SimWorld } from './world';

// Field spawner (PRD Section 11): ten spawn points each keep a pack of 2 to 5 monsters that
// respawns 10 s after the pack dies, at most 30 alive, plus an elite about every 150 s.

export interface Pack {
  spawnIdx: number;
  members: number[];
  /** Sim time the pack was wiped out, or null while some member lives. */
  clearedAt: number | null;
}

function pickMonster(w: SimWorld): MonsterDef {
  const zone = w.zone!;
  const total = zone.monsters.reduce((s, m) => s + m.weight, 0);
  let r = w.rng.next() * total;
  for (const m of zone.monsters) {
    r -= m.weight;
    if (r <= 0) return w.content.monsters.get(m.id)!;
  }
  return w.content.monsters.get(zone.monsters[0].id)!;
}

/** Spawns one pack at its spawn point, as many members as fit under the alive cap. */
export function spawnPack(w: SimWorld, pack: Pack): number {
  const zone = w.zone!;
  const sp = zone.field.spawnPoints[pack.spawnIdx];
  const def = pickMonster(w);
  const [lo, hi] = def.packSize;
  const want = lo + Math.floor(w.rng.next() * (hi - lo + 1));
  const room = zone.maxAlive - w.aliveEnemies();
  const count = Math.min(want, room);
  pack.members = [];
  pack.clearedAt = null;
  for (let i = 0; i < count; i++) {
    const ang = i * 2.399963 + w.rng.next() * 0.5;
    const rad = count === 1 ? 0 : 1.2 + (i % 2) * 0.8;
    const p = { x: sp.x + Math.cos(ang) * rad, z: sp.z + Math.sin(ang) * rad };
    w.nav.collide(p, def.radius ?? 0.7);
    const u = w.spawnMonster(def, p.x, p.z, sp.level, { packId: pack.spawnIdx });
    if (u) pack.members.push(u.id);
  }
  return pack.members.length;
}

export function startFieldSpawns(w: SimWorld): void {
  const zone = w.zone!;
  w.packs = zone.field.spawnPoints.map((_, i) => ({ spawnIdx: i, members: [], clearedAt: null }));
  // Nearest packs first, so there is always something to fight near the entrance.
  const order = [...w.packs].sort((a, b) => {
    const pa = zone.field.spawnPoints[a.spawnIdx];
    const pb = zone.field.spawnPoints[b.spawnIdx];
    return dist(w.hero.x, w.hero.z, pa.x, pa.z) - dist(w.hero.x, w.hero.z, pb.x, pb.z);
  });
  for (const p of order) {
    if (w.aliveEnemies() >= zone.maxAlive) break;
    spawnPack(w, p);
  }
}

function spawnElite(w: SimWorld): void {
  const zone = w.zone!;
  const def = w.content.monsters.get(zone.eliteId)!;
  // At a far spawn point, so the player has to go and find it.
  let best = 0;
  let bestD = -1;
  zone.field.spawnPoints.forEach((sp, i) => {
    const d = dist(w.hero.x, w.hero.z, sp.x, sp.z);
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  });
  const sp = zone.field.spawnPoints[best];
  const p = { x: sp.x, z: sp.z };
  w.nav.collide(p, def.radius ?? 1);
  const u = w.spawnMonster(def, p.x, p.z, Math.min(zone.levels[1], sp.level + 1), { elite: true });
  if (u) w.emit({ t: 'text', x: p.x, z: p.z, text: `${def.name}!`, color: '#ffd23f' });
}

export function eliteAlive(w: SimWorld): boolean {
  return w.units.some((u) => u.id >= 0 && u.alive && u.elite);
}

export function spawnerUpdate(w: SimWorld, dt: number): void {
  if (w.mode !== 'field' || w.run.phase !== 'field' || !w.zone) return;
  const zone = w.zone;
  for (const pack of w.packs) {
    const anyAlive = pack.members.some((id) => w.unitById(id)?.alive);
    if (pack.members.length > 0 && !anyAlive && pack.clearedAt === null) pack.clearedAt = w.time;
    if (pack.clearedAt === null) continue;
    if (w.time - pack.clearedAt < zone.respawnSec) continue;
    const sp = zone.field.spawnPoints[pack.spawnIdx];
    // Not on top of the hero, and only if the alive cap leaves room for a real pack.
    if (dist(w.hero.x, w.hero.z, sp.x, sp.z) < 12) continue;
    if (zone.maxAlive - w.aliveEnemies() < 2) continue;
    spawnPack(w, pack);
  }
  w.run.eliteIn -= dt;
  if (w.run.eliteIn <= 0) {
    if (!eliteAlive(w)) spawnElite(w);
    w.run.eliteIn = zone.eliteEverySec;
  }
}
