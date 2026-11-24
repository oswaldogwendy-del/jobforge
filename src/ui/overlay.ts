import { Vector3, type PerspectiveCamera } from 'three';
import type { Balance } from '../data/schema';
import type { Dummy } from '../sim/world';

interface Num {
  active: boolean;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  crit: boolean;
  age: number;
  drift: number;
}

export interface AimArrow {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  length: number;
}

/**
 * 2D canvas above the 3D scene: pooled damage numbers, HP bars of damaged enemies and the aim
 * arrow (PRD Section 5 and Section 15).
 */
export class Overlay {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pool: Num[] = [];
  private next = 0;
  private w = 1;
  private h = 1;
  private readonly v = new Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cfg: Balance,
  ) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < cfg.render.damageNumberPool; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        text: '',
        color: '#fff',
        crit: false,
        age: 0,
        drift: 0,
      });
    }
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  spawn(x: number, y: number, z: number, text: string, color: string, crit: boolean): void {
    const n = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    n.active = true;
    n.x = x;
    n.y = y;
    n.z = z;
    n.text = text;
    n.color = color;
    n.crit = crit;
    n.age = 0;
    n.drift = (Math.random() - 0.5) * 24;
  }

  /** Projects a world point to CSS pixels. Returns false when it is behind the camera. */
  private project(
    cam: PerspectiveCamera,
    x: number,
    y: number,
    z: number,
    out: { x: number; y: number },
  ): boolean {
    this.v.set(x, y, z).project(cam);
    if (this.v.z > 1) return false;
    out.x = (this.v.x * 0.5 + 0.5) * this.w;
    out.y = (-this.v.y * 0.5 + 0.5) * this.h;
    return true;
  }

  private readonly p = { x: 0, y: 0 };

  draw(dt: number, cam: PerspectiveCamera, dummies: Dummy[], aim: AimArrow | null): void {
    const g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    const life = this.cfg.render.damageNumberLife;
    const p = this.p;

    // HP bars appear only once an enemy is damaged (PRD Section 5, HUD layout).
    for (const d of dummies) {
      if (!d.alive || d.hp >= d.maxHp) continue;
      if (!this.project(cam, d.x, this.cfg.dummies.height + 0.4, d.z, p)) continue;
      const bw = 46;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 8);
      g.fillStyle = '#e44';
      g.fillRect(p.x - bw / 2, p.y, bw * (d.hp / d.maxHp), 6);
    }

    if (aim && this.project(cam, aim.x, 0.1, aim.z, p)) {
      const sx = p.x;
      const sy = p.y;
      if (
        this.project(cam, aim.x + aim.dirX * aim.length, 0.1, aim.z + aim.dirZ * aim.length, this.p)
      ) {
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 4;
        g.setLineDash([10, 8]);
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(p.x, p.y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath();
        g.arc(p.x, p.y, 7, 0, Math.PI * 2);
        g.fill();
      }
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const n of this.pool) {
      if (!n.active) continue;
      n.age += dt;
      const k = n.age / life;
      if (k >= 1) {
        n.active = false;
        continue;
      }
      if (!this.project(cam, n.x, n.y, n.z, p)) continue;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      const size = (n.crit ? 30 : 22) * pop;
      const shake = n.crit && k < 0.3 ? Math.sin(n.age * 90) * 2 : 0;
      const x = p.x + n.drift * k + shake;
      const y = p.y - 70 * Math.sqrt(k);
      g.globalAlpha = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      g.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(20,20,30,0.9)';
      g.strokeText(n.text, x, y);
      g.fillStyle = n.color;
      g.fillText(n.text, x, y);
    }
    g.globalAlpha = 1;
  }
}
