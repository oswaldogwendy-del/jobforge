import {
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Rng } from '../core/rng';
import type { Balance } from '../data/schema';

const SKY = 0x9fd0f0;

/** Test arena: ground, lights, fog and a ring of rocks and trees. Three draw calls of scenery. */
export function buildStage(cfg: Balance): Scene {
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 38, 88);

  scene.add(new HemisphereLight(0xdff0ff, 0x6c7a45, 1.35));
  const sun = new DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(-10, 16, 8);
  scene.add(sun);
  scene.add(new AmbientLight(0xffffff, 0.15));

  const R = cfg.arena.radius;
  const tex = checkerTexture();
  tex.repeat.set(R / 2, R / 2);
  const ground = new Mesh(
    new CircleGeometry(R + 10, 72),
    new MeshLambertMaterial({ map: tex, color: 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const scenery = new Group();
  const rng = new Rng(77);
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();

  const rockCount = 70;
  const rocks = new InstancedMesh(
    new DodecahedronGeometry(1, 0),
    new MeshLambertMaterial({ color: 0x8b8f99 }),
    rockCount,
  );
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + rng.signed() * 0.05;
    const r = R + 1 + rng.next() * 3;
    const size = 0.8 + rng.next() * 1.4;
    p.set(Math.cos(a) * r, size * 0.35, Math.sin(a) * r);
    q.setFromAxisAngle(new Vector3(0, 1, 0), rng.next() * 6.28);
    s.set(size * 1.2, size * 0.8, size);
    rocks.setMatrixAt(i, m.compose(p, q, s));
  }
  scenery.add(rocks);

  const treeCount = 34;
  const trunk = new CylinderGeometry(0.18, 0.28, 1.4, 6).translate(0, 0.7, 0);
  const crown = new ConeGeometry(1.2, 3.2, 7).translate(0, 2.9, 0);
  const crownMesh = new InstancedMesh(
    crown,
    new MeshLambertMaterial({ color: 0x3f8f4a }),
    treeCount,
  );
  const trunkMesh = new InstancedMesh(
    trunk,
    new MeshLambertMaterial({ color: 0x7a5230 }),
    treeCount,
  );
  for (let i = 0; i < treeCount; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = R + 5 + rng.next() * 9;
    const k = 0.9 + rng.next() * 0.9;
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    q.identity();
    s.set(k, k, k);
    m.compose(p, q, s);
    crownMesh.setMatrixAt(i, m);
    trunkMesh.setMatrixAt(i, m);
  }
  scenery.add(crownMesh, trunkMesh);
  scene.add(scenery);
  return scene;
}

function checkerTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6fae52';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#66a54b';
  g.fillRect(0, 0, 64, 64);
  g.fillRect(64, 64, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 128, (i * 59) % 128, 2, 2);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}
