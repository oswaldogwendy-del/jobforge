import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type Scene,
} from 'three';
import type { Balance } from '../data/schema';
import type { SimEvent } from '../sim/world';

type FxEvent = Extract<SimEvent, { t: 'fx' }>;

interface Slot {
  group: Group;
  mesh: Mesh;
  mat: MeshBasicMaterial;
  age: number;
  life: number;
  active: boolean;
}

/** Pooled ground flashes that show where a skill landed: circle, cone or line. */
export class CastFx {
  private readonly slots: Slot[] = [];
  private readonly circle = new CircleGeometry(1, 48);
  private readonly line = new PlaneGeometry(1, 1).translate(0, -0.5, 0);
  private readonly cones = new Map<number, BufferGeometry>();
  private next = 0;

  constructor(
    scene: Scene,
    private readonly cfg: Balance,
  ) {
    for (let i = 0; i < cfg.render.fxPool; i++) {
      const mat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      const mesh = new Mesh(this.circle, mat);
      mesh.rotation.x = -Math.PI / 2;
      const group = new Group();
      group.add(mesh);
      group.visible = false;
      group.position.y = 0.06;
      scene.add(group);
      this.slots.push({ group, mesh, mat, age: 0, life: cfg.render.fxLife, active: false });
    }
  }

  private coneGeometry(angleDeg: number): BufferGeometry {
    let g = this.cones.get(angleDeg);
    if (!g) {
      const theta = (angleDeg * Math.PI) / 180;
      // Centered on local -y, which becomes world +z after the -90 degree X rotation.
      g = new CircleGeometry(1, 40, -Math.PI / 2 - theta / 2, theta);
      this.cones.set(angleDeg, g);
    }
    return g;
  }

  spawn(e: FxEvent): void {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;
    s.active = true;
    s.age = 0;
    s.life = this.cfg.render.fxLife;
    s.mat.color = new Color(e.color);
    s.group.visible = true;
    s.group.position.set(e.x, 0.06, e.z);
    s.group.rotation.y = e.heading;
    if (e.shape === 'circle') {
      s.mesh.geometry = this.circle;
      s.mesh.scale.set(e.size, e.size, 1);
    } else if (e.shape === 'cone') {
      s.mesh.geometry = this.coneGeometry(e.angleDeg);
      s.mesh.scale.set(e.size, e.size, 1);
    } else {
      s.mesh.geometry = this.line;
      s.mesh.scale.set(e.width, e.size, 1);
    }
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) {
        s.active = false;
        s.group.visible = false;
        continue;
      }
      s.mat.opacity = 0.6 * (1 - k);
    }
  }
}
