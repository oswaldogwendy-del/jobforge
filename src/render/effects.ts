import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Color,
  Group,
  type Scene,
} from 'three';
import type { SimWorld } from '../sim/world';

/** Skill and monster projectiles as one instanced mesh (150 at most, PRD Section 4). */
export class ProjectileView {
  private readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly c = new Color();

  constructor(scene: Scene, max = 150) {
    this.mesh = new InstancedMesh(
      new SphereGeometry(0.3, 8, 6),
      new MeshBasicMaterial({
        color: 0xffffff,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.95,
      }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(w: SimWorld): void {
    let n = 0;
    for (const p of w.projectiles) {
      if (!p.active) continue;
      this.m.makeScale(p.radius * 2.4, p.radius * 2.4, p.radius * 2.4).setPosition(p.x, 1.0, p.z);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.c.set(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Focus ring, boss portal and the elite marker. */
export class Markers {
  private readonly focus: Mesh;
  private readonly portal = new Group();
  private readonly portalRing: Mesh;
  private readonly elite: Mesh;

  constructor(scene: Scene) {
    this.focus = new Mesh(
      new RingGeometry(0.95, 1.2, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.focus.position.y = 0.06;
    this.focus.visible = false;
    this.elite = new Mesh(
      new RingGeometry(1.5, 1.75, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: 0xff9d2e,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.elite.position.y = 0.06;
    this.elite.visible = false;
    this.portalRing = new Mesh(
      new TorusGeometry(1.2, 0.14, 8, 32),
      new MeshBasicMaterial({ color: 0xb06bff }),
    );
    this.portalRing.position.y = 1.4;
    const beam = new Mesh(
      new CylinderGeometry(1.0, 1.0, 6, 24, 1, true),
      new MeshBasicMaterial({
        color: 0xc08bff,
        transparent: true,
        opacity: 0.28,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    beam.position.y = 3;
    this.portal.add(this.portalRing, beam);
    this.portal.visible = false;
    scene.add(this.focus, this.portal, this.elite);
  }

  update(
    w: SimWorld,
    time: number,
    focus: { x: number; z: number; r: number } | null,
    elite: { x: number; z: number } | null,
  ): void {
    if (focus) {
      this.focus.visible = true;
      this.focus.position.set(focus.x, 0.06, focus.z);
      this.focus.scale.setScalar((focus.r / 0.7) * (1 + Math.sin(time * 6) * 0.06));
    } else this.focus.visible = false;
    const p = w.run.portal;
    if (p && w.run.phase === 'field') {
      this.portal.visible = true;
      this.portal.position.set(p.x, 0, p.z);
      this.portalRing.rotation.y = time * 1.5;
      this.portalRing.rotation.x = Math.sin(time * 2) * 0.3;
      this.portal.scale.setScalar(1 + Math.sin(time * 3) * 0.04);
    } else this.portal.visible = false;
    if (elite) {
      this.elite.visible = true;
      this.elite.position.set(elite.x, 0.06, elite.z);
    } else this.elite.visible = false;
  }
}

const RARITY_HEX: Record<string, number> = {
  common: 0xe8e8e8,
  fine: 0x5be05b,
  rare: 0x4a9bff,
  epic: 0xb85bff,
  legendary: 0xffa030,
};

/** Drops on the ground: a bobbing gem and a light beam coloured by rarity (PRD Section 5). */
export class LootView {
  private readonly gems: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly c = new Color();

  constructor(
    scene: Scene,
    private readonly max = 120,
  ) {
    this.gems = new InstancedMesh(
      new OctahedronGeometry(0.28, 0),
      new MeshBasicMaterial({ color: 0xffffff }),
      max,
    );
    this.beams = new InstancedMesh(
      new CylinderGeometry(0.1, 0.16, 4, 8, 1, true).translate(0, 2, 0),
      new MeshBasicMaterial({
        color: 0xffffff,
        blending: AdditiveBlending,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: DoubleSide,
      }),
      max,
    );
    for (const mesh of [this.gems, this.beams]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }

  update(w: SimWorld, clock: number): void {
    const list = w.pickups;
    const n = Math.min(list.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const hex = RARITY_HEX[p.rarity] ?? 0xffffff;
      this.c.setHex(hex);
      const rise = Math.min(1, p.t * 4);
      const y = 0.35 + 0.12 * Math.sin(clock * 4 + i) + (p.t > 0.5 ? 0.3 : 0);
      this.m.makeRotationY(clock * 2 + i).setPosition(p.x, y * rise, p.z);
      this.gems.setMatrixAt(i, this.m);
      this.gems.setColorAt(i, this.c);
      const tall = p.rarity === 'common' ? 0.45 : 1;
      this.m.makeScale(tall, tall * rise, tall).setPosition(p.x, 0, p.z);
      this.beams.setMatrixAt(i, this.m);
      this.beams.setColorAt(i, this.c);
    }
    this.gems.count = n;
    this.beams.count = n;
    this.gems.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.gems.instanceColor) this.gems.instanceColor.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }
}
