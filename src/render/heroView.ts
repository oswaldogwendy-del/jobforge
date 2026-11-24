import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Balance, ModelMap } from '../data/schema';
import { angleDiff } from '../sim/geometry';
import type { HeroBuild } from '../sim/loadout';
import type { HeroState, Unit } from '../sim/types';
import { findBone, loadClips, loadModel, toLambert } from './assets';
import { makeBlob } from './blob';

/** The hero: one KayKit look, one AnimationMixer, the shared clips and weapons on the hand bones. */
export class HeroView {
  readonly root = new Group();
  readonly boneNames: string[] = [];
  /** Interpolated position, read by the camera. */
  x = 0;
  z = 0;
  private mixer: AnimationMixer;
  private idle: AnimationAction;
  private run: AnimationAction;
  private attack: AnimationAction;
  private cast: AnimationAction;
  private death: AnimationAction;
  private current: AnimationAction;
  private lastSeq = 0;
  private attackTimeScale = 1;
  private dead = false;
  private readonly magic: boolean;

  private constructor(
    model: Object3D,
    clips: AnimationClip[],
    private readonly map: ModelMap,
    cfg: Balance,
    build: HeroBuild,
  ) {
    this.root.add(model);
    this.root.add(makeBlob(0.8));
    this.mixer = new AnimationMixer(model);
    const find = (name: string) => {
      const clip = AnimationClip.findByName(clips, name);
      if (!clip)
        throw new Error(`modelMap.json: animation "${name}" not found in ${map.animations.file}`);
      return clip;
    };
    this.idle = this.mixer.clipAction(find(map.animations.idle));
    this.run = this.mixer.clipAction(find(map.animations.run));
    const melee = find(map.animations.attack);
    this.attack = this.mixer.clipAction(melee);
    this.cast = this.mixer.clipAction(find(map.animations.cast));
    this.death = this.mixer.clipAction(find(map.animations.death));
    for (const a of [this.attack, this.cast, this.death]) {
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    this.idle.setLoop(LoopRepeat, Infinity);
    this.run.setLoop(LoopRepeat, Infinity);
    this.magic = build.weapon.type === 'staff';
    const aps = cfg.weapons[build.weapon.type].aps;
    this.attackTimeScale = MathUtils.clamp(melee.duration * aps, 0.8, 2.5);
    this.idle.play();
    this.current = this.idle;
    model.traverse((o) => {
      if ((o as { isBone?: boolean }).isBone)
        this.boneNames.push((o.userData?.name as string) ?? o.name);
    });
  }

  static async create(cfg: Balance, map: ModelMap, build: HeroBuild): Promise<HeroView> {
    const look = map.looks[build.look] ?? map.looks[map.hero.look];
    const [gltf, clips] = await Promise.all([loadModel(look.file), loadClips(map.animations.file)]);
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(look.scale);
    toLambert(model);
    const view = new HeroView(model, clips, map, cfg, build);
    await view.equip(model, build.weapon.type);
    if (build.offhand) await view.equip(model, build.offhand);
    return view;
  }

  private async equip(model: Object3D, weaponId: string): Promise<void> {
    const w = this.map.weapons[weaponId] ?? this.map.weapons.sword;
    const bone = findBone(model, w.slot);
    if (!bone)
      throw new Error(`modelMap.json: bone "${w.slot}" not found for weapon "${weaponId}"`);
    const gltf = await loadModel(w.file);
    const item = cloneSkinned(gltf.scene);
    toLambert(item);
    bone.add(item);
  }

  private play(next: AnimationAction, fade: number): void {
    if (next === this.current && next.isRunning()) return;
    next.reset().fadeIn(fade).play();
    if (this.current !== next) this.current.fadeOut(fade);
    this.current = next;
  }

  update(dt: number, hero: Unit, hs: HeroState, alpha: number): void {
    this.x = MathUtils.lerp(hero.px, hero.x, alpha);
    this.z = MathUtils.lerp(hero.pz, hero.z, alpha);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = hero.pheading + angleDiff(hero.pheading, hero.heading) * alpha;
    if (!hero.alive) {
      if (!this.dead) {
        this.dead = true;
        this.play(this.death, 0.1);
      }
      this.mixer.update(dt);
      return;
    }
    if (this.dead) {
      this.dead = false;
      this.play(this.idle, 0.1);
    }
    const moving = hs.moving || !!hs.dash;
    if (hs.swingSeq !== this.lastSeq) {
      this.lastSeq = hs.swingSeq;
      const clip = this.magic ? this.cast : this.attack;
      clip.setEffectiveTimeScale(this.magic ? 1.4 : this.attackTimeScale);
      this.play(clip, 0.06);
    } else if (this.current === this.attack || this.current === this.cast) {
      const done = this.current.time >= this.current.getClip().duration - 0.05;
      if (moving || done) this.play(moving ? this.run : this.idle, 0.12);
    } else {
      this.play(moving ? this.run : this.idle, 0.15);
    }
    this.mixer.update(dt);
  }
}
