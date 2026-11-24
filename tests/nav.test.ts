import { describe, expect, it } from 'vitest';
import { Nav, circleArena, clampToArena, pushOut, rectArena } from '../src/sim/nav';
import { SpatialHash } from '../src/sim/spatial';
import { makeUnit } from '../src/sim/unit';

describe('SpatialHash', () => {
  it('returns only units within the radius, across cell borders', () => {
    const h = new SpatialHash(4);
    const a = makeUnit({ id: 1, x: 3.9, z: 0 });
    const b = makeUnit({ id: 2, x: 4.1, z: 0 });
    const c = makeUnit({ id: 3, x: 30, z: 30 });
    [a, b, c].forEach((u) => h.insert(u));
    const found: number[] = [];
    h.query(4, 0, 1, (u) => found.push(u.id));
    expect(found.sort()).toEqual([1, 2]);
    const none: number[] = [];
    h.query(4, 0, 0.05, (u) => none.push(u.id));
    expect(none).toEqual([]);
  });
  it('clear() empties it and it can be refilled', () => {
    const h = new SpatialHash(4);
    h.insert(makeUnit({ id: 1, x: 1, z: 1 }));
    h.clear();
    const found: number[] = [];
    h.query(1, 1, 5, (u) => found.push(u.id));
    expect(found).toEqual([]);
    h.insert(makeUnit({ id: 2, x: -50, z: -50 }));
    h.query(-50, -50, 1, (u) => found.push(u.id));
    expect(found).toEqual([2]);
  });
  it('handles negative coordinates', () => {
    const h = new SpatialHash(4);
    h.insert(makeUnit({ id: 1, x: -0.5, z: -0.5 }));
    const found: number[] = [];
    h.query(0.4, 0.4, 1.5, (u) => found.push(u.id));
    expect(found).toEqual([1]);
  });
});

describe('collision', () => {
  it('pushes a circle out of a circle obstacle and a box obstacle', () => {
    const p = { x: 0.5, z: 0 };
    expect(pushOut({ x: 0, z: 0, r: 1 }, p, 0.5)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.5, 6);
    const q = { x: 0.2, z: 0.1 };
    expect(pushOut({ x: 0, z: 0, w: 4, d: 2 }, q, 0.5)).toBe(true);
    expect(Math.abs(q.z) >= 1.5 - 1e-6 || Math.abs(q.x) >= 2.5 - 1e-6).toBe(true);
    expect(pushOut({ x: 0, z: 0, r: 1 }, { x: 5, z: 5 }, 0.5)).toBe(false);
  });
  it('clamps to circle and rect arenas', () => {
    const out = { x: 0, z: 0 };
    clampToArena(circleArena(10), 20, 0, 0.5, out);
    expect(out.x).toBeCloseTo(9.5, 6);
    clampToArena(rectArena(80, 60), 100, -100, 0.5, out);
    expect(out).toEqual({ x: 39.5, z: -29.5 });
  });
});

describe('A* navigation', () => {
  const arena = rectArena(40, 40);
  it('line of sight is clear in open ground and blocked by an obstacle', () => {
    const nav = new Nav(arena, [{ x: 0, z: 0, r: 2 }]);
    expect(nav.lineClear(-10, 5, 10, 5)).toBe(true);
    expect(nav.lineClear(-10, 0, 10, 0)).toBe(false);
  });
  it('finds a path around a wall when the straight line is blocked', () => {
    const wall = { x: 0, z: 0, w: 2, d: 20 };
    const nav = new Nav(arena, [wall]);
    expect(nav.lineClear(-8, 0, 8, 0)).toBe(false);
    const path = nav.findPath(-8, 0, 8, 0)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 8, z: 0 });
    // Every leg of the path must be clear of the wall.
    let prev = { x: -8, z: 0 };
    for (const p of path) {
      expect(nav.lineClear(prev.x, prev.z, p.x, p.z)).toBe(true);
      prev = p;
    }
    // It goes around the end of the wall (|z| > 10).
    expect(path.some((p) => Math.abs(p.z) > 10)).toBe(true);
  });
  it('a straight line needs no extra waypoints', () => {
    const nav = new Nav(arena, [{ x: 0, z: 15, r: 2 }]);
    const path = nav.findPath(-8, 0, 8, 0)!;
    expect(path).toHaveLength(1);
  });
  it('returns null when the goal is walled in', () => {
    const ring = [
      { x: 0, z: -3, w: 8, d: 1 },
      { x: 0, z: 3, w: 8, d: 1 },
      { x: -4, z: 0, w: 1, d: 8 },
      { x: 4, z: 0, w: 1, d: 8 },
    ];
    const nav = new Nav(arena, ring);
    expect(nav.findPath(-15, -15, 0, 0)).toBeNull();
  });
});
