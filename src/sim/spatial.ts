import type { Unit } from './types';

/**
 * Spatial hash with 4 m cells (PRD Section 4). Rebuilt once per tick from the living units, then
 * answers range queries without scanning every unit. Reuses its arrays, so it does not allocate
 * in the steady state.
 */
export class SpatialHash {
  private cells = new Map<number, Unit[]>();
  private pool: Unit[][] = [];
  constructor(readonly cell = 4) {}

  private key(cx: number, cz: number): number {
    return (cx + 512) * 1024 + (cz + 512);
  }

  clear(): void {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(u: Unit): void {
    const k = this.key(Math.floor(u.x / this.cell), Math.floor(u.z / this.cell));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = this.pool.pop() ?? [];
      this.cells.set(k, arr);
    }
    arr.push(u);
  }

  /** Calls fn for every unit whose centre is within r of (x, z). */
  query(x: number, z: number, r: number, fn: (u: Unit) => void): void {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    const r2 = r * r;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const u = arr[i];
          const dx = u.x - x;
          const dz = u.z - z;
          if (dx * dx + dz * dz <= r2) fn(u);
        }
      }
    }
  }
}
