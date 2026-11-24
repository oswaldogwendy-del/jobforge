import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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
