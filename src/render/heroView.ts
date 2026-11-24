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
import type { HeroState } from '../sim/world';
import { findBone, loadClips, loadModel, toLambert } from './assets';
import { makeBlob } from './blob';

/** The hero: one KayKit look, one AnimationMixer, the shared clips and a weapon on the hand bone. */
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
  private current: AnimationAction;
  private lastSeq = 0;
  private attackTimeScale = 1;

  private constructor(
    model: Object3D,
    clips: AnimationClip[],
    private readonly cfg: Balance,
    private readonly map: ModelMap,
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
    const attackClip = find(map.animations.attack);
    this.attack = this.mixer.clipAction(attackClip);
    this.attack.setLoop(LoopOnce, 1);
    this.attack.clampWhenFinished = true;
    this.idle.setLoop(LoopRepeat, Infinity);
    this.run.setLoop(LoopRepeat, Infinity);
    this.attackTimeScale = MathUtils.clamp(attackClip.duration * cfg.hero.weapon.aps, 0.8, 2.5);
    this.idle.play();
    this.current = this.idle;

    model.traverse((o) => {
      if ((o as { isBone?: boolean }).isBone)
        this.boneNames.push((o.userData?.name as string) ?? o.name);
    });
  }

  static async create(cfg: Balance, map: ModelMap): Promise<HeroView> {
    const look = map.looks[map.hero.look];
    const [gltf, clips] = await Promise.all([loadModel(look.file), loadClips(map.animations.file)]);
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(look.scale);
    toLambert(model);
    const view = new HeroView(model, clips, cfg, map);
    await view.equip(model, map.hero.weapon);
    if (map.hero.offhand) await view.equip(model, map.hero.offhand);
    return view;
  }

  private async equip(model: Object3D, weaponId: string): Promise<void> {
    const w = this.map.weapons[weaponId];
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

  update(dt: number, hero: HeroState, alpha: number): void {
    this.x = MathUtils.lerp(hero.px, hero.x, alpha);
    this.z = MathUtils.lerp(hero.pz, hero.z, alpha);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = hero.pheading + angleDiff(hero.pheading, hero.heading) * alpha;

    if (hero.swingSeq !== this.lastSeq) {
      this.lastSeq = hero.swingSeq;
      this.attack.setEffectiveTimeScale(this.attackTimeScale);
      this.play(this.attack, 0.06);
    } else if (this.current === this.attack) {
      const done = this.attack.time >= this.attack.getClip().duration - 0.05;
      if (hero.moving || done) this.play(hero.moving ? this.run : this.idle, 0.12);
    } else {
      this.play(hero.moving ? this.run : this.idle, 0.15);
    }
    this.mixer.update(dt);
  }

  get speedHint(): number {
    return this.cfg.hero.moveSpeed;
  }
}
