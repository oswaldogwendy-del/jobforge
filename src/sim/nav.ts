// Obstacles, collision and grid A* (PRD Section 4): the world is 2D on the ground plane (x, z),
// obstacles are circles or boxes, and A* on 1 m cells runs only when the straight line to a target
// is blocked.

export interface Obstacle {
  x: number;
  z: number;
  /** Circle radius. */
  r?: number;
  /** Box width (x) and depth (z). */
  w?: number;
  d?: number;
}

export interface Arena {
  /** 'circle' uses radius; 'rect' uses width and depth, centred on the origin. */
  shape: 'circle' | 'rect';
  radius: number;
  width: number;
  depth: number;
}

export function circleArena(radius: number): Arena {
  return { shape: 'circle', radius, width: radius * 2, depth: radius * 2 };
}
export function rectArena(width: number, depth: number): Arena {
  return { shape: 'rect', radius: Math.max(width, depth) / 2, width, depth };
}

/** Pushes a circle (x, z, r) inside the arena. Returns the corrected position. */
export function clampToArena(
  a: Arena,
  x: number,
  z: number,
  r: number,
  out: { x: number; z: number },
): void {
  if (a.shape === 'circle') {
    const lim = a.radius - r;
    const d = Math.hypot(x, z);
    if (d > lim && d > 1e-9) {
      x *= lim / d;
      z *= lim / d;
    }
  } else {
    x = Math.min(a.width / 2 - r, Math.max(-a.width / 2 + r, x));
    z = Math.min(a.depth / 2 - r, Math.max(-a.depth / 2 + r, z));
  }
  out.x = x;
  out.z = z;
}

/** Pushes a circle out of one obstacle. Returns true if it moved. */
export function pushOut(o: Obstacle, p: { x: number; z: number }, r: number): boolean {
  if (o.r !== undefined) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + r;
    if (d >= min) return false;
    if (d < 1e-6) {
      p.x = o.x + min;
      return true;
    }
    p.x = o.x + (dx / d) * min;
    p.z = o.z + (dz / d) * min;
    return true;
  }
  const hw = (o.w ?? 0) / 2;
  const hd = (o.d ?? 0) / 2;
  const cx = Math.min(o.x + hw, Math.max(o.x - hw, p.x));
  const cz = Math.min(o.z + hd, Math.max(o.z - hd, p.z));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return false;
  if (d < 1e-6) {
    // Centre is inside the box: push out through the nearest face.
    const px = hw - Math.abs(p.x - o.x);
    const pz = hd - Math.abs(p.z - o.z);
    if (px < pz) p.x = o.x + Math.sign(p.x - o.x || 1) * (hw + r);
    else p.z = o.z + Math.sign(p.z - o.z || 1) * (hd + r);
    return true;
  }
  p.x = cx + (dx / d) * r;
  p.z = cz + (dz / d) * r;
  return true;
}

/** Does a circle of radius r at (x, z) overlap an obstacle? */
export function overlaps(o: Obstacle, x: number, z: number, r: number): boolean {
  const p = { x, z };
  return pushOut(o, p, r);
}

export class Nav {
  readonly obstacles: Obstacle[];
  readonly arena: Arena;
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly ox: number;
  private readonly oz: number;
  /** Clearance used when building the grid, so paths keep a body's width from walls. */
  readonly clearance: number;

  constructor(arena: Arena, obstacles: Obstacle[], clearance = 0.6) {
    this.arena = arena;
    this.obstacles = obstacles;
    this.clearance = clearance;
    this.cols = Math.ceil(arena.width);
    this.rows = Math.ceil(arena.depth);
    this.ox = -this.cols / 2;
    this.oz = -this.rows / 2;
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const x = this.ox + i + 0.5;
        const z = this.oz + j + 0.5;
        const outside = arena.shape === 'circle' && Math.hypot(x, z) > arena.radius - clearance;
        this.blocked[j * this.cols + i] =
          outside || obstacles.some((o) => overlaps(o, x, z, clearance)) ? 1 : 0;
      }
    }
  }

  /** Moves a circle out of every obstacle and back inside the arena. */
  collide(p: { x: number; z: number }, r: number): void {
    for (let pass = 0; pass < 2; pass++) {
      for (const o of this.obstacles) pushOut(o, p, r);
      clampToArena(this.arena, p.x, p.z, r, p);
    }
  }

  /** Is the straight segment free of obstacles for a body of radius r? */
  lineClear(ax: number, az: number, bx: number, bz: number, r = this.clearance): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      for (const o of this.obstacles) if (overlaps(o, x, z, r)) return false;
    }
    return true;
  }

  private cellOf(x: number, z: number): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor(x - this.ox))),
      Math.min(this.rows - 1, Math.max(0, Math.floor(z - this.oz))),
    ];
  }
  private isBlocked(i: number, j: number): boolean {
    return (
      i < 0 || j < 0 || i >= this.cols || j >= this.rows || this.blocked[j * this.cols + i] === 1
    );
  }

  /** The nearest free cell to a position, searching outward. */
  private nearestFree(i: number, j: number): [number, number] | null {
    if (!this.isBlocked(i, j)) return [i, j];
    for (let r = 1; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!this.isBlocked(i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return null;
  }

  /**
   * A* over 1 m cells (8 neighbours, no corner cutting). Returns waypoints from the start to the
   * goal, string-pulled so straight stretches stay straight, or null when there is no path.
   */
  findPath(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
    const s0 = this.cellOf(ax, az);
    const g0 = this.cellOf(bx, bz);
    const s = this.nearestFree(s0[0], s0[1]);
    const g = this.nearestFree(g0[0], g0[1]);
    if (!s || !g) return null;
    const cols = this.cols;
    const idx = (i: number, j: number) => j * cols + i;
    const total = cols * this.rows;
    const gScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const heap = new MinHeap();
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - g[0]);
      const dz = Math.abs(j - g[1]);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    gScore[idx(s[0], s[1])] = 0;
    heap.push(idx(s[0], s[1]), h(s[0], s[1]));
    const goal = idx(g[0], g[1]);
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) {
        found = true;
        break;
      }
      const ci = cur % cols;
      const cj = (cur - ci) / cols;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (this.isBlocked(ni, nj)) continue;
          if (di !== 0 && dj !== 0 && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj)))
            continue;
          const n = idx(ni, nj);
          if (closed[n]) continue;
          const cost = gScore[cur] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
          if (cost < gScore[n]) {
            gScore[n] = cost;
            came[n] = cur;
            heap.push(n, cost + h(ni, nj));
          }
        }
      }
    }
    if (!found) return null;
    const cells: { x: number; z: number }[] = [];
    for (let c = goal; c !== -1; c = came[c]) {
      const i = c % cols;
      const j = (c - i) / cols;
      cells.push({ x: this.ox + i + 0.5, z: this.oz + j + 0.5 });
    }
    cells.reverse();
    cells[cells.length - 1] = { x: bx, z: bz };
    return this.pull([{ x: ax, z: az }, ...cells.slice(1)]);
  }

  /** String-pulling: drop waypoints the line of sight already covers. */
  private pull(pts: { x: number; z: number }[]): { x: number; z: number }[] {
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.lineClear(pts[anchor].x, pts[anchor].z, pts[i].x, pts[i].z)) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out.slice(1);
  }
}

/** Binary min-heap of (item, priority) pairs. */
class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
