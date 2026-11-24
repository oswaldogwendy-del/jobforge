import {
  AmbientLight,
  BoxGeometry,
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
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { Rng } from '../core/rng';
import type { Balance } from '../data/schema';
import type { ZoneDef } from '../data/types';

const SKY = 0x9fd0f0;

/** The scene with its lights and fog. Scenery is swapped in and out per mode. */
export function createScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 38, 88);
  scene.add(new HemisphereLight(0xdff0ff, 0x6c7a45, 1.35));
  const sun = new DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(-10, 16, 8);
  scene.add(sun);
  scene.add(new AmbientLight(0xffffff, 0.15));
  return scene;
}

export interface Scenery {
  group: Group;
  dispose(): void;
}

export type SceneryKind = 'circle' | 'field' | 'boss';

function checker(a: string, b: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = b;
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

/** Ground, borders and props for the town/yard, a zone's field, or a boss arena. */
export function buildScenery(
  kind: SceneryKind,
  cfg: Balance,
  opts: { zone?: ZoneDef | null; radius?: number } = {},
): Scenery {
  const group = new Group();
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texs: Texture[] = [];
  const mat = <T extends Material>(m: T): T => (mats.push(m), m);
  const geo = <T extends BufferGeometry>(g: T): T => (geos.push(g), g);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);

  const boss = kind === 'boss';
  const tex = boss ? checker('#8b7f9a', '#80748f') : checker('#6fae52', '#66a54b');
  texs.push(tex);
  let ground: Mesh;
  if (kind === 'field') {
    const [w, d] = opts.zone!.field.size;
    tex.repeat.set((w + 24) / 2, (d + 24) / 2);
    ground = new Mesh(
      geo(new PlaneGeometry(w + 24, d + 24).rotateX(-Math.PI / 2)),
      mat(new MeshLambertMaterial({ map: tex })),
    );
  } else {
    const R = (opts.radius ?? cfg.arena.radius) + (boss ? 6 : 10);
    tex.repeat.set(R / 2, R / 2);
    ground = new Mesh(
      geo(new CircleGeometry(R, 72).rotateX(-Math.PI / 2)),
      mat(new MeshLambertMaterial({ map: tex })),
    );
  }
  group.add(ground);

  const addInstanced = (
    g: BufferGeometry,
    color: number,
    n: number,
    place: (
      i: number,
      set: (
        px: number,
        py: number,
        pz: number,
        ry: number,
        sx: number,
        sy: number,
        sz: number,
      ) => void,
    ) => void,
  ): InstancedMesh => {
    const im = new InstancedMesh(geo(g), mat(new MeshLambertMaterial({ color })), n);
    const set = (
      px: number,
      py: number,
      pz: number,
      ry: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      q.setFromAxisAngle(up, ry);
      m4.compose(p.set(px, py, pz), q, s.set(sx, sy, sz));
      im.setMatrixAt(idx, m4);
    };
    let idx = 0;
    for (idx = 0; idx < n; idx++) place(idx, set);
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
    return im;
  };

  const rng = new Rng(77);
  if (kind === 'circle') {
    const R = cfg.arena.radius;
    addInstanced(new DodecahedronGeometry(1, 0), 0x8b8f99, 70, (i, set) => {
      const a = (i / 70) * Math.PI * 2 + rng.signed() * 0.05;
      const r = R + 1 + rng.next() * 3;
      const size = 0.8 + rng.next() * 1.4;
      set(
        Math.cos(a) * r,
        size * 0.35,
        Math.sin(a) * r,
        rng.next() * 6.28,
        size * 1.2,
        size * 0.8,
        size,
      );
    });
    const trunk = new CylinderGeometry(0.18, 0.28, 1.4, 6).translate(0, 0.7, 0);
    const crown = new ConeGeometry(1.2, 3.2, 7).translate(0, 2.9, 0);
    const trees: [number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = R + 5 + rng.next() * 9;
      trees.push([Math.cos(a) * r, Math.sin(a) * r, 0.9 + rng.next() * 0.9]);
    }
    addInstanced(crown, 0x3f8f4a, 34, (i, set) =>
      set(trees[i][0], 0, trees[i][1], 0, trees[i][2], trees[i][2], trees[i][2]),
    );
    addInstanced(trunk, 0x7a5230, 34, (i, set) =>
      set(trees[i][0], 0, trees[i][1], 0, trees[i][2], trees[i][2], trees[i][2]),
    );
  } else if (kind === 'boss') {
    // A ring of stone pillars marks the edge of the arena.
    const R = opts.radius ?? 15;
    const n = 20;
    addInstanced(new BoxGeometry(1.4, 3.2, 1.4).translate(0, 1.6, 0), 0x9a92a8, n, (i, set) => {
      const a = (i / n) * Math.PI * 2;
      set(Math.cos(a) * (R + 0.9), 0, Math.sin(a) * (R + 0.9), -a, 1, 1 + (i % 3) * 0.25, 1);
    });
    addInstanced(new DodecahedronGeometry(1, 0), 0x7d7589, 26, (i, set) => {
      const a = (i / 26) * Math.PI * 2 + 0.1;
      const r = R + 4 + rng.next() * 4;
      const size = 1 + rng.next() * 1.6;
      set(Math.cos(a) * r, size * 0.35, Math.sin(a) * r, rng.next() * 6.28, size, size * 0.8, size);
    });
  } else {
    const zone = opts.zone!;
    const [W, D] = zone.field.size;
    const props = zone.field.props;
    const of = (model: string) => props.filter((x) => x.model === model);
    const rocks = of('rock');
    const trees = of('tree');
    const bushes = of('bush');
    const walls = of('wall');
    addInstanced(new DodecahedronGeometry(1, 0), 0x8b8f99, rocks.length, (i, set) =>
      set(
        rocks[i].x,
        rocks[i].scale * 0.35,
        rocks[i].z,
        rocks[i].rot,
        rocks[i].scale * 1.2,
        rocks[i].scale * 0.9,
        rocks[i].scale,
      ),
    );
    const trunk = new CylinderGeometry(0.18, 0.28, 1.4, 6).translate(0, 0.7, 0);
    const crown = new ConeGeometry(1.2, 3.2, 7).translate(0, 2.9, 0);
    addInstanced(crown, 0x3f8f4a, trees.length, (i, set) =>
      set(trees[i].x, 0, trees[i].z, trees[i].rot, trees[i].scale, trees[i].scale, trees[i].scale),
    );
    addInstanced(trunk, 0x7a5230, trees.length, (i, set) =>
      set(trees[i].x, 0, trees[i].z, trees[i].rot, trees[i].scale, trees[i].scale, trees[i].scale),
    );
    addInstanced(new SphereGeometry(1, 7, 5).scale(1, 0.7, 1), 0x58a04a, bushes.length, (i, set) =>
      set(
        bushes[i].x,
        0.25,
        bushes[i].z,
        bushes[i].rot,
        bushes[i].scale,
        bushes[i].scale,
        bushes[i].scale,
      ),
    );
    // Walls take their size from the obstacle at the same spot, so what you see is what blocks you.
    addInstanced(
      new BoxGeometry(1, 1.4, 1).translate(0, 0.7, 0),
      0x9b8f7a,
      walls.length,
      (i, set) => {
        const o = zone.field.obstacles.find(
          (ob) => Math.abs(ob.x - walls[i].x) < 0.01 && Math.abs(ob.z - walls[i].z) < 0.01,
        );
        set(walls[i].x, 0, walls[i].z, 0, o?.w ?? 3, 1, o?.d ?? 1.2);
      },
    );
    // A low fence around the edge of the field.
    addInstanced(new BoxGeometry(1, 1.1, 1).translate(0, 0.55, 0), 0x8a6a45, 4, (i, set) => {
      const horizontal = i < 2;
      const sign = i % 2 === 0 ? 1 : -1;
      if (horizontal) set(0, 0, sign * (D / 2 + 0.3), 0, W + 1, 1, 0.5);
      else set(sign * (W / 2 + 0.3), 0, 0, 0, 0.5, 1, D + 1);
    });
    if (zone.field.fog) group.userData.fog = zone.field.fog;
  }
  return {
    group,
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
    },
  };
}
