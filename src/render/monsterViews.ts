import {
  AnimationAction,
  AnimationMixer,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  RingGeometry,
  SphereGeometry,
  type Scene,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { modelMap } from '../data/schema';
import type { Unit } from '../sim/types';
import type { SimWorld } from '../sim/world';
import { angleDiff } from '../sim/geometry';
import { loadModel, toLambert } from './assets';
import { blobMaterial } from './blob';
import { PlaneGeometry } from 'three';

type Slot = 'idle' | 'move' | 'attack' | 'hit' | 'death';

interface View {
  id: number;
  model: string;
  root: Group;
  mixer: AnimationMixer | null;
  actions: Partial<Record<Slot, AnimationAction>>;
  current: AnimationAction | null;
  materials: MeshLambertMaterial[];
  baseColors: Color[];
  lastHp: number;
  lastX: number;
  lastZ: number;
  height: number;
  ground: number;
  hitT: number;
  /** Last frame's hit-stun, to play the flinch when a push starts. */
  wasStunned: boolean;
  inAttack: boolean;
  dead: boolean;
  accum: number;
  skinned: boolean;
}

const FREEZE = new Color(0.45, 0.7, 1);
const DEAD_LINGER = 1.4;

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

/** The M0 wooden training dummy, built in code. */
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

/** Simple stand-in for summons whose model is not in the repo yet (a bone-white capsule). */
function summonGeometry(): BufferGeometry {
  return mergeGeometries(
    [
      tint(new CylinderGeometry(0.28, 0.34, 0.9, 8).translate(0, 0.6, 0), 0xe8e4d4),
      tint(new SphereGeometry(0.3, 8, 6).translate(0, 1.2, 0), 0xf2eee0),
    ],
    false,
  )!;
}

/** A gold crown for Queen Gelatina, attached above her model. */
function crown(): Group {
  const g = new Group();
  const mat = new MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a4a00 });
  g.add(new Mesh(new CylinderGeometry(0.62, 0.7, 0.3, 14, 1, true), mat));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new Mesh(new ConeGeometry(0.14, 0.4, 6), mat);
    spike.position.set(Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6);
    g.add(spike);
  }
  return g;
}

/**
 * Pooled monster views: each skinned monster is a SkeletonUtils clone with its own mixer, reused
 * from a pool when a monster goes away (PRD Section 4). Distant ones animate at about 15 Hz.
 */
export class MonsterViews {
  private readonly views = new Map<number, View>();
  private readonly pool = new Map<string, View[]>();
  private readonly dummyGeo = dummyGeometry();
  private readonly summonGeo = summonGeometry();
  private readonly shadowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly shadowMat = blobMaterial();
  private frame = 0;
  skinnedCount = 0;

  constructor(private readonly scene: Scene) {}

  /** Loads every monster model the data lists, so views can be created synchronously. */
  static async preload(): Promise<void> {
    const files = new Set(Object.values(modelMap.monsters).map((m) => m.file));
    await Promise.all([...files].map(async (f) => cachedModels.set(f, await loadModel(f))));
  }

  private modelKey(w: SimWorld, u: Unit): string {
    if (u.kind === 'summon') return 'summon';
    const def = w.content.monsters.get(u.defId) ?? w.content.bosses.get(u.defId);
    return def?.model ?? 'dummy';
  }

  private create(w: SimWorld, u: Unit): View {
    const model = this.modelKey(w, u);
    const pooled = this.pool.get(model)?.pop();
    if (pooled) {
      pooled.id = u.id;
      this.reset(pooled, u);
      pooled.root.visible = true;
      this.scene.add(pooled.root);
      return pooled;
    }
    const root = new Group();
    const materials: MeshLambertMaterial[] = [];
    let mixer: AnimationMixer | null = null;
    const actions: View['actions'] = {};
    let height: number;
    let ground = 0;
    let skinned = false;
    const entry = modelMap.monsters[model];
    if (model === 'dummy' || model === 'summon' || !entry) {
      const m = new MeshLambertMaterial({ vertexColors: true });
      const mesh = new Mesh(model === 'summon' ? this.summonGeo : this.dummyGeo, m);
      root.add(mesh);
      materials.push(m);
      height = model === 'summon' ? 1.5 : 2.2;
    } else {
      const gltf = (cachedModels.get(entry.file) ?? null)!;
      const clone = cloneSkinned(gltf.scene);
      toLambert(clone);
      if (entry.tint) {
        const t = new Color(entry.tint);
        clone.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.isMesh) (mesh.material as MeshLambertMaterial).color.multiply(t);
        });
      }
      clone.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) materials.push(mesh.material as MeshLambertMaterial);
      });
      clone.scale.setScalar(entry.scale);
      const box = new Box3().setFromObject(clone);
      ground = -box.min.y;
      height = box.max.y - box.min.y;
      root.add(clone);
      mixer = new AnimationMixer(clone);
      for (const slot of ['idle', 'move', 'attack', 'hit', 'death'] as Slot[]) {
        const clip = gltf.animations.find((c) => c.name === entry.anim[slot]);
        if (clip) actions[slot] = mixer.clipAction(clip);
      }
      for (const s of ['attack', 'hit', 'death'] as Slot[]) {
        const a = actions[s];
        if (a) {
          a.setLoop(LoopOnce, 1);
          a.clampWhenFinished = true;
        }
      }
      for (const s of ['idle', 'move'] as Slot[]) actions[s]?.setLoop(LoopRepeat, Infinity);
      skinned = true;
      if (entry.hover) ground += entry.hover;
    }
    const shadow = new Mesh(this.shadowGeo, this.shadowMat);
    shadow.scale.setScalar(Math.max(1.4, u.r * 2.6));
    shadow.position.y = 0.03;
    shadow.renderOrder = 1;
    root.add(shadow);
    if (u.defId === 'queen_gelatina') {
      const c = crown();
      c.position.y = height + 0.1 - ground * 0;
      root.add(c);
    }
    if (u.elite) {
      const ring = new Mesh(
        new RingGeometry(u.r * 1.2, u.r * 1.45, 32).rotateX(-Math.PI / 2),
        new MeshLambertMaterial({ color: 0xffb02e, emissive: 0x805000 }),
      );
      ring.position.y = 0.05;
      root.add(ring);
    }
    root.frustumCulled = false;
    this.scene.add(root);
    const v: View = {
      id: u.id,
      model,
      root,
      mixer,
      actions,
      current: null,
      materials,
      baseColors: materials.map((m) => m.color.clone()),
      lastHp: u.hp,
      lastX: u.x,
      lastZ: u.z,
      height,
      ground,
      hitT: 0,
      wasStunned: false,
      inAttack: false,
      dead: false,
      accum: 0,
      skinned,
    };
    this.reset(v, u);
    return v;
  }

  private reset(v: View, u: Unit): void {
    v.lastHp = u.hp;
    v.lastX = u.x;
    v.lastZ = u.z;
    v.hitT = 0;
    v.wasStunned = false;
    v.inAttack = false;
    v.dead = false;
    v.accum = 0;
    v.mixer?.stopAllAction();
    v.current = null;
    v.materials.forEach((m, i) => {
      m.color.copy(v.baseColors[i]);
      m.emissive.setRGB(0, 0, 0);
    });
    this.play(v, 'idle', 0);
  }

  private play(v: View, slot: Slot, fade = 0.15): void {
    const next = v.actions[slot];
    if (!next || v.current === next) return;
    next.reset().fadeIn(fade).play();
    v.current?.fadeOut(fade);
    v.current = next;
  }

  /** Syncs views with the simulation. Returns HP bar anchors for the overlay. */
  sync(
    w: SimWorld,
    alpha: number,
    dt: number,
    camX: number,
    camZ: number,
  ): { x: number; y: number; z: number; frac: number; elite: boolean }[] {
    this.frame++;
    const bars: { x: number; y: number; z: number; frac: number; elite: boolean }[] = [];
    const seen = new Set<number>();
    let skinned = 0;
    for (const u of w.units) {
      if (u.id < 0 || (!u.alive && u.deadFor > DEAD_LINGER)) continue;
      let v = this.views.get(u.id);
      if (!v) {
        v = this.create(w, u);
        this.views.set(u.id, v);
      }
      seen.add(u.id);
      if (v.skinned) skinned++;
      this.update(v, u, alpha, dt, camX, camZ);
      if (u.alive && !u.isBoss && u.hp < u.maxHp && u.kind === 'monster' && v.root.visible) {
        bars.push({
          x: v.root.position.x,
          y: v.height + 0.3,
          z: v.root.position.z,
          frac: u.hp / u.maxHp,
          elite: u.elite,
        });
      }
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.views.delete(id);
      this.scene.remove(v.root);
      const list = this.pool.get(v.model) ?? [];
      list.push(v);
      this.pool.set(v.model, list);
    }
    this.skinnedCount = skinned;
    return bars;
  }

  private update(v: View, u: Unit, alpha: number, dt: number, camX: number, camZ: number): void {
    const x = MathUtils.lerp(u.px, u.x, alpha);
    const z = MathUtils.lerp(u.pz, u.z, alpha);
    v.root.position.set(x, v.ground, z);
    v.root.rotation.y = u.pheading + angleDiff(u.pheading, u.heading) * alpha;
    const hidden = !!u.ai && (u.ai.state === 'hidden' || u.ai.state === 'erupt') && u.alive;
    v.root.visible = !hidden;
    if (hidden) return;

    // Hit flash and freeze tint.
    if (u.hp < v.lastHp - 0.01) v.hitT = 0.14;
    v.hitT = Math.max(0, v.hitT - dt);
    const frozen = u.statuses.some((s) => s.id === 'freeze');
    v.materials.forEach((m, i) => {
      m.color.copy(v.baseColors[i]);
      if (frozen) m.color.lerp(FREEZE, 0.6);
      const f = v.hitT > 0 ? 0.6 : 0;
      m.emissive.setRGB(f, f * 0.4, f * 0.4);
    });
    v.wasStunned = u.hitStunT > 0;
    // A staggered boss wobbles.
    v.root.rotation.z = u.staggerT > 0 ? Math.sin(performance.now() * 0.03) * 0.12 : 0;

    if (v.mixer) {
      const speed = Math.hypot(u.x - v.lastX, u.z - v.lastZ) / Math.max(dt, 1e-3);
      if (!u.alive) {
        if (!v.dead) {
          v.dead = true;
          v.actions.death?.reset().play();
          v.current?.fadeOut(0.1);
          v.current = v.actions.death ?? null;
        }
      } else {
        const windup = !!u.ai && (u.ai.state === 'windup' || u.ai.state === 'dash');
        if (windup && !v.inAttack) {
          v.inAttack = true;
          this.play(v, 'attack', 0.08);
        } else if (!windup) {
          v.inAttack = false;
          const flinch = u.hitStunT > 0 && !v.wasStunned;
          if ((u.hp < v.lastHp - 0.01 || flinch) && v.actions.hit && !frozen)
            this.play(v, 'hit', 0.05);
          else if (
            v.current === v.actions.hit &&
            v.current.time < v.current.getClip().duration - 0.05
          ) {
            // let the hit reaction finish
          } else if (
            v.current === v.actions.attack &&
            v.current.time < v.current.getClip().duration - 0.05
          ) {
            // let the attack finish
          } else this.play(v, speed > 0.4 ? 'move' : 'idle');
        }
        if (frozen) v.mixer.timeScale = 0;
        else v.mixer.timeScale = 1;
      }
      // Far monsters animate at about 15 Hz (PRD Section 4).
      v.accum += dt;
      const far = Math.hypot(x - camX, z - camZ) > 26;
      if (!far || this.frame % 4 === 0) {
        v.mixer.update(v.accum);
        v.accum = 0;
      }
    }
    v.lastHp = u.hp;
    v.lastX = u.x;
    v.lastZ = u.z;
  }

  /** Height of a monster's view, for floating numbers. */
  heightOf(id: number): number {
    return this.views.get(id)?.height ?? 2;
  }

  dispose(): void {
    for (const v of this.views.values()) this.scene.remove(v.root);
    this.views.clear();
  }
}

import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
/** Models loaded by preload(); a Map so views are created synchronously. */
export const cachedModels = new Map<string, GLTF>();
