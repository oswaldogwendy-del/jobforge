import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Dummy } from '../sim/world';
import { blobMaterial } from './blob';
import { PlaneGeometry } from 'three';

function tint(g: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g.index ? g.toNonIndexed() : g;
}

function dummyGeometry(): BufferGeometry {
  const parts = [
    tint(new CylinderGeometry(0.55, 0.65, 0.18, 12).translate(0, 0.09, 0), 0x6b4a2b),
    tint(new CylinderGeometry(0.14, 0.14, 1.7, 8).translate(0, 1.0, 0), 0x8a5f35),
    tint(new CylinderGeometry(0.46, 0.5, 0.9, 10).translate(0, 1.15, 0), 0xe0c06a),
    tint(new BoxGeometry(1.5, 0.16, 0.16).translate(0, 1.4, 0), 0x8a5f35),
    tint(new SphereGeometry(0.34, 10, 8).translate(0, 1.85, 0), 0xe0c06a),
    tint(
      new CylinderGeometry(0.2, 0.2, 0.06, 10).rotateX(Math.PI / 2).translate(0, 1.2, 0.46),
      0xc0392b,
    ),
  ];
  return mergeGeometries(parts, false)!;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const FLASH = new Color(2.4, 0.9, 0.7);
const WHITE = new Color(1, 1, 1);

/** All training dummies in one InstancedMesh (one draw call) plus one instanced blob shadow. */
export class DummiesView {
  private readonly body: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly ring: Mesh;
  private readonly wasAlive: boolean[];
  private readonly wasFlashing: boolean[];
  private readonly m = new Matrix4();

  constructor(
    scene: Scene,
    private readonly dummies: Dummy[],
  ) {
    const n = dummies.length;
    this.body = new InstancedMesh(
      dummyGeometry(),
      new MeshLambertMaterial({ vertexColors: true }),
      n,
    );
    this.body.instanceMatrix.setUsage(35048); // DynamicDrawUsage
    this.body.frustumCulled = false;
    this.shadows = new InstancedMesh(
      new PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
      blobMaterial(),
      n,
    );
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.wasAlive = dummies.map(() => true);
    this.wasFlashing = dummies.map(() => false);
    dummies.forEach((d, i) => {
      this.m.makeTranslation(d.x, 0, d.z);
      this.body.setMatrixAt(i, this.m);
      this.body.setColorAt(i, WHITE);
      this.m.makeTranslation(d.x, 0.03, d.z);
      this.shadows.setMatrixAt(i, this.m);
    });
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;

    this.ring = new Mesh(
      new RingGeometry(0.95, 1.2, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.ring.position.y = 0.05;
    this.ring.visible = false;
    scene.add(this.body, this.shadows, this.ring);
  }

  update(focusId: number, time: number): void {
    let matrixDirty = false;
    let colorDirty = false;
    for (let i = 0; i < this.dummies.length; i++) {
      const d = this.dummies[i];
      if (d.alive !== this.wasAlive[i]) {
        this.wasAlive[i] = d.alive;
        if (d.alive) {
          this.m.makeTranslation(d.x, 0, d.z);
          this.body.setMatrixAt(i, this.m);
          this.m.makeTranslation(d.x, 0.03, d.z);
          this.shadows.setMatrixAt(i, this.m);
        } else {
          this.body.setMatrixAt(i, HIDDEN);
          this.shadows.setMatrixAt(i, HIDDEN);
        }
        matrixDirty = true;
      }
      const flashing = d.alive && d.flash > 0;
      if (flashing || this.wasFlashing[i]) {
        this.body.setColorAt(i, flashing ? FLASH : WHITE);
        this.wasFlashing[i] = flashing;
        colorDirty = true;
      }
    }
    if (matrixDirty) {
      this.body.instanceMatrix.needsUpdate = true;
      this.shadows.instanceMatrix.needsUpdate = true;
    }
    if (colorDirty && this.body.instanceColor) this.body.instanceColor.needsUpdate = true;

    const f = focusId >= 0 ? this.dummies[focusId] : undefined;
    if (f && f.alive) {
      this.ring.visible = true;
      this.ring.position.set(f.x, 0.05, f.z);
      this.ring.scale.setScalar(1 + Math.sin(time * 6) * 0.06);
    } else {
      this.ring.visible = false;
    }
  }

  /** World position used for HP bars and damage numbers. */
  static anchor(d: Dummy, height: number, out: Vector3): Vector3 {
    return out.set(d.x, height, d.z);
  }
}
