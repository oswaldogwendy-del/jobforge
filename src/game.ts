import { Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { unlockAudio } from './audio/unlock';
import { FixedStepper } from './core/stepper';
import { balance, debugSkills, modelMap } from './data/schema';
import type { DebugApi, DebugStats } from './debug/api';
import { Controls } from './input/controls';
import { CameraRig } from './render/cameraRig';
import { CastFx } from './render/castFx';
import { DummiesView } from './render/dummiesView';
import { HeroView } from './render/heroView';
import { buildStage } from './render/stage';
import { SimWorld, type CastRequest } from './sim/world';
import { mountHud } from './ui/Hud';
import { Overlay, type AimArrow } from './ui/overlay';
import { SkillButtons } from './ui/skillButtons';

type PauseReason = 'manual' | 'hidden' | 'portrait';

export interface JobforgeDebugHandle {
  sim: SimWorld;
  stats(): DebugStats;
  paused(): boolean;
  /** World ground point to CSS pixels, for automated checks. */
  project(x: number, z: number): { x: number; y: number };
  /** Screen pixels to a world ground point, for automated checks. */
  unproject(cx: number, cy: number): { x: number; z: number } | null;
}

declare global {
  interface Window {
    __jobforge?: JobforgeDebugHandle;
  }
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`index.html is missing #${id}`);
  return e as T;
}

/** Wires the simulation, renderer, input and UI together and runs the frame loop. */
export class Game implements DebugApi {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly rig: CameraRig;
  private readonly sim: SimWorld;
  private readonly stepper = new FixedStepper(balance.tickRate, balance.maxFrameSec);
  private readonly hero: HeroView;
  private readonly dummies: DummiesView;
  private readonly fx: CastFx;
  private readonly overlay: Overlay;
  private readonly controls: Controls;
  private readonly buttons: SkillButtons;
  private readonly pauseEl = el('pause');

  private readonly casts: CastRequest[] = [];
  private readonly reasons = new Set<PauseReason>();
  private aim: { slot: number; x: number; z: number } | null = null;
  private raf = 0;
  private last = 0;
  private running = false;
  private timeScale = 1;
  private fpsEma = 60;
  private frameMsEma = 16.7;
  private pixelRatio = 1;
  private info = { calls: 0, triangles: 0 };

  private readonly ray = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();

  boneNames: string[];

  private constructor(hero: HeroView) {
    this.hero = hero;
    this.boneNames = hero.boneNames;
    const canvas = el<HTMLCanvasElement>('game');
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.scene = buildStage(balance);
    this.sim = new SimWorld(balance, debugSkills, balance.dummies.seed);
    this.rig = new CameraRig(balance, window.innerWidth / window.innerHeight);
    this.scene.add(hero.root);
    this.dummies = new DummiesView(this.scene, this.sim.dummies);
    this.fx = new CastFx(this.scene, balance);
    this.overlay = new Overlay(el<HTMLCanvasElement>('overlay'), balance);

    this.controls = new Controls(el('touch-layer'), balance, {
      onTap: (x, y) => this.tapAt(x, y),
      onCastKey: (slot, mouse) => {
        const aim = mouse ? this.screenToGround(mouse.x, mouse.y) : null;
        this.casts.push({ slot, aim });
      },
      onCycleFocus: () => this.sim.cycleFocus(),
      onTogglePause: () => this.setPause('manual', !this.reasons.has('manual')),
      onFirstGesture: unlockAudio,
    });
    this.buttons = new SkillButtons(el('skills'), debugSkills, balance, {
      onCast: (slot, dir) => this.casts.push({ slot, aim: dir ? this.aimPoint(slot, dir) : null }),
      onAim: (slot, dir) => {
        this.aim = slot >= 0 && dir ? { slot, ...dir } : null;
      },
    });

    this.pauseEl.addEventListener('pointerdown', () => this.setPause('manual', false));
    document.addEventListener('visibilitychange', () => this.setPause('hidden', document.hidden));
    const portrait = window.matchMedia('(orientation: portrait)');
    portrait.addEventListener('change', (e) => this.setPause('portrait', e.matches));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));

    this.resize();
    mountHud(el('hud-root'), this);
    window.__jobforge = {
      sim: this.sim,
      stats: () => this.stats(),
      paused: () => !this.running,
      unproject: (cx, cy) => this.screenToGround(cx, cy),
      project: (x, z) => {
        const v = new Vector3(x, 0.5, z).project(this.rig.camera);
        return {
          x: (v.x * 0.5 + 0.5) * window.innerWidth,
          y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        };
      },
    };
    if (portrait.matches) this.reasons.add('portrait');
    if (document.hidden) this.reasons.add('hidden');
  }

  static async create(): Promise<Game> {
    await Promise.race([
      document.fonts.load('700 22px Fredoka'),
      new Promise((r) => setTimeout(r, 1500)),
    ]).catch(() => undefined);
    const hero = await HeroView.create(balance, modelMap);
    return new Game(hero);
  }

  start(): void {
    this.syncRunning();
  }

  // --- DebugApi ---------------------------------------------------------------------------

  stats(): DebugStats {
    return {
      fps: this.fpsEma,
      frameMs: this.frameMsEma,
      drawCalls: this.info.calls,
      triangles: this.info.triangles,
      pixelRatio: this.pixelRatio,
    };
  }
  getTimeScale(): number {
    return this.timeScale;
  }
  setTimeScale(v: number): void {
    this.timeScale = v;
  }
  getGodMode(): boolean {
    return this.sim.godMode;
  }
  setGodMode(v: boolean): void {
    this.sim.godMode = v;
  }

  // --- pause and sizing -------------------------------------------------------------------

  private setPause(reason: PauseReason, on: boolean): void {
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    this.syncRunning();
  }

  private syncRunning(): void {
    const shouldRun = this.reasons.size === 0;
    this.pauseEl.hidden = !this.reasons.has('manual');
    if (shouldRun && !this.running) {
      this.running = true;
      this.last = performance.now();
      this.stepper.reset();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!shouldRun && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.controls.releaseAll();
      this.aim = null;
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, balance.render.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / Math.max(h, 1));
    this.overlay.resize(w, h, this.pixelRatio);
    this.buttons.layout();
  }

  // --- input helpers ----------------------------------------------------------------------

  private screenToGround(cx: number, cy: number): { x: number; z: number } | null {
    this.ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.rig.camera);
    if (!this.ray.ray.intersectPlane(this.ground, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  private tapAt(cx: number, cy: number): void {
    const p = this.screenToGround(cx, cy);
    if (!p) return;
    const d = this.sim.pickAt(p.x, p.z);
    // Tap an enemy to focus it; tap it again or tap empty ground to clear (PRD Section 5).
    this.sim.setFocus(d && d.id !== this.sim.focusId ? d.id : -1);
  }

  private aimPoint(slot: number, dir: { x: number; z: number }): { x: number; z: number } {
    const fx = debugSkills[slot].effect;
    const dist = fx.at === 'ground' ? (fx.reach ?? fx.range) : fx.range;
    return { x: this.sim.hero.x + dir.x * dist, z: this.sim.hero.z + dir.z * dist };
  }

  // --- frame ------------------------------------------------------------------------------

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const rawMs = now - this.last;
    this.last = now;
    const dt = Math.min(rawMs / 1000, balance.maxFrameSec);
    if (rawMs > 0) {
      this.fpsEma += (1000 / rawMs - this.fpsEma) * 0.05;
      this.frameMsEma += (rawMs - this.frameMsEma) * 0.05;
    }

    const scaled = dt * this.timeScale;
    const ticks = this.stepper.advance(scaled);
    for (let i = 0; i < ticks; i++) this.tick();

    const alpha = this.stepper.alpha;
    this.hero.update(scaled, this.sim.hero, alpha);
    const h = this.sim.hero;
    const dirX = h.moving ? Math.sin(h.heading) : 0;
    const dirZ = h.moving ? Math.cos(h.heading) : 0;
    this.rig.update(dt, this.hero.x, this.hero.z, dirX, dirZ);
    this.dummies.update(this.sim.focusId, this.sim.time);
    this.fx.update(scaled);
    this.buttons.update(this.sim.cooldown, this.sim.cooldownMax, this.sim.gcd);
    this.renderer.render(this.scene, this.rig.camera);
    this.info.calls = this.renderer.info.render.calls;
    this.info.triangles = this.renderer.info.render.triangles;

    let arrow: AimArrow | null = null;
    if (this.aim) {
      const fx = debugSkills[this.aim.slot].effect;
      arrow = {
        x: this.hero.x,
        z: this.hero.z,
        dirX: this.aim.x,
        dirZ: this.aim.z,
        length: fx.at === 'ground' ? (fx.reach ?? fx.range) : fx.range,
      };
    }
    this.overlay.draw(scaled, this.rig.camera, this.sim.dummies, arrow);
  };

  private tick(): void {
    const m = this.controls.getMove();
    const casts = this.casts.splice(0, this.casts.length);
    this.sim.tick(this.stepper.step, { moveX: m.x, moveZ: m.z, casts });
    for (const e of this.sim.drainEvents()) {
      if (e.t === 'dmg') {
        this.overlay.spawn(
          e.x,
          balance.dummies.height + 0.2,
          e.z,
          String(e.amount),
          e.crit ? '#ffd23f' : '#ffffff',
          e.crit,
        );
      } else if (e.t === 'fx') {
        this.fx.spawn(e);
      }
    }
  }
}
