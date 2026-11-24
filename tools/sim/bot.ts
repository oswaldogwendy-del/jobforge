import { skillStatus } from '../../src/sim/engine';
import { inShape, type ShapeSpec } from '../../src/sim/geometry';
import type { CastRequest, SimWorld, TickInput } from '../../src/sim/world';
import { dist } from '../../src/sim/geometry';

/**
 * A simple player for the headless simulator. It casts skills by their `ai` priority (PRD
 * Section 16: ai.priority and ai.when), stands still to auto-attack, and sidesteps telegraphs
 * it is standing in. It is deliberately not clever: it measures what a plain build can do.
 */
export function botInput(w: SimWorld): TickInput {
  const h = w.hero;
  let moveX = 0;
  let moveZ = 0;

  // Dodge: leave any telegraph the hero is standing in while there is still time.
  for (const t of w.telegraphs) {
    if (!t.active || t.warn - t.t < 0) continue;
    const spec: ShapeSpec = {
      shape: t.shape,
      x: t.x,
      z: t.z,
      heading: t.heading,
      radius: t.radius,
      angleDeg: t.angleDeg,
      length: t.length,
      width: t.width,
      inner: t.inner,
    };
    // Stay a couple of metres clear until it resolves: auto-attack would otherwise walk back in.
    if (!inShape(spec, h.x, h.z, h.r + 2.2)) continue;
    // (Dodging toward the arena centre was tried and was worse: the centre is where the boss is.)
    const cx = -h.x;
    const cz = -h.z;
    const cd = Math.hypot(cx, cz) || 1;
    if (t.shape === 'line' || t.shape === 'cone') {
      // Sidestep: perpendicular to the line, on the side that points more toward the centre.
      const nx = Math.cos(t.heading);
      const nz = -Math.sin(t.heading);
      const towardCentre = (cx * nx + cz * nz) / cd;
      const onSide = (h.x - t.x) * nx + (h.z - t.z) * nz;
      const side = onSide >= 0 ? 1 : -1;
      void towardCentre;
      moveX = nx * side;
      moveZ = nz * side;
    } else {
      // Circles lock onto where the hero stood, so "away from the centre" can be zero length;
      // fall back to away from whoever cast it, then blend in a pull toward the arena centre.
      let dx = h.x - t.x;
      let dz = h.z - t.z;
      if (Math.hypot(dx, dz) < 0.4) {
        const owner = w.unitById(t.ownerId);
        dx = owner ? h.x - owner.x : 1;
        dz = owner ? h.z - owner.z : 0;
        if (Math.hypot(dx, dz) < 0.01) dx = 1;
      }
      const d = Math.hypot(dx, dz) || 1;
      let mx = dx / d;
      let mz = dz / d;
      const md = Math.hypot(mx, mz) || 1;
      mx /= md;
      mz /= md;
      moveX = mx;
      moveZ = mz;
    }
    break;
  }

  // Sidestep enemy projectiles that are heading for the hero.
  if (moveX === 0 && moveZ === 0) {
    for (const p of w.projectiles) {
      if (!p.active || p.team !== 'enemy') continue;
      const rx = h.x - p.x;
      const rz = h.z - p.z;
      const along = rx * p.dx + rz * p.dz;
      const cross = rx * p.dz - rz * p.dx;
      if (along > 0 && along < 7 && Math.abs(cross) < p.radius + h.r + 1.0) {
        const side = cross >= 0 ? 1 : -1;
        moveX = p.dz * side;
        moveZ = -p.dx * side;
        break;
      }
    }
  }

  // Hunt: with nothing in auto-attack range, walk toward the nearest enemy.
  if (moveX === 0 && moveZ === 0) {
    let nearest: { x: number; z: number } | null = null;
    let best = Infinity;
    let inRange = false;
    for (const u of w.units) {
      if (u.id < 0 || !u.alive || u.team !== 'enemy' || u.ai?.state === 'hidden') continue;
      const d = dist(h.x, h.z, u.x, u.z) - u.r;
      if (d <= w.b.targeting.autoAttackRange) inRange = true;
      if (d < best) {
        best = d;
        nearest = u;
      }
    }
    if (!inRange && nearest) {
      const d = dist(h.x, h.z, nearest.x, nearest.z) || 1;
      moveX = (nearest.x - h.x) / d;
      moveZ = (nearest.z - h.z) / d;
    }
  }

  const casts: CastRequest[] = [];
  const hs = w.hs;
  if (moveX === 0 && moveZ === 0 && !hs.casting && !hs.dash && hs.gcd <= 0) {
    const order = hs.slots
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s && x.s.def.kind === 'active')
      .sort((a, b) => (b.s!.def.ai?.priority ?? 0) - (a.s!.def.ai?.priority ?? 0));
    for (const { s, i } of order) {
      if (hs.cooldown[i] > 0) continue;
      const st = skillStatus(w, i);
      if (!st || st.noSp || !st.hasTarget) continue;
      const when = s!.def.ai?.when ?? 'always';
      if (when === 'boss' && !(w.boss && w.boss.alive)) continue;
      if (when === 'enemiesInRange') {
        const range = Math.max(s!.def.range ?? 6, 4);
        let near = false;
        for (const u of w.units)
          if (u.id >= 0 && u.alive && u.team === 'enemy' && dist(h.x, h.z, u.x, u.z) - u.r <= range)
            near = true;
        if (!near) continue;
      }
      casts.push({ slot: i, aim: null });
      break;
    }
  }
  return { moveX, moveZ, casts };
}
