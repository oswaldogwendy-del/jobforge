import { Raycaster, Plane, Scene, Vector2, Vector3, WebGLRenderer, Color, Fog } from 'three';
import { unlockAudio } from './audio/unlock';
import { FixedStepper } from './core/stepper';
import { balance, modelMap } from './data/schema';
import { buildFromPreset, itemMap, stackMap } from './data/content';
import type { DebugStats } from './debug/api';
import { Controls } from './input/controls';
import { CameraRig } from './render/cameraRig';
import { CastFx } from './render/castFx';
import { LootView, Markers, ProjectileView } from './render/effects';
import { HeroView } from './render/heroView';
import { MonsterViews } from './render/monsterViews';
import { buildScenery, createScene, type Scenery, type SceneryKind } from './render/stage';
import { Telegraphs } from './render/telegraphs';
import { killUnit } from './sim/combat';
import { refreshHero, skillStatus } from './sim/engine';
import type { HeroBuild } from './sim/loadout';
import type { CastRequest } from './sim/world';
import { SimWorld, type Mode } from './sim/world';
import type { Unit } from './sim/types';
import type { GameApi } from './ui/api';
import { mountHud } from './ui/Hud';
import { Overlay, type AimArrow } from './ui/overlay';
import { SkillButtons } from './ui/skillButtons';
import { hudStore, type BuffChip } from './ui/store';
import { exportCode as makeCode, importCode as readCode } from './save/code';
import { SaveError } from './save/schema';
import {
  deleteSlot as removeSlot,
  listSlots,
  loadSlot as readSlot,
  requestPersistence,
  saveSlot as writeSlot,
  storageDegraded,
} from './save/storage';
import { defaultSettings, type SaveData, type SettingsData } from './save/types';
import { expToNext } from './sim/stats';
import {
  addItem,
  addStack,
  buildOf,
  canRaiseStat,
  expFraction,
  gainExp,
  learnCheck,
  newSave,
  presetOf,
  recordBossKill,
  takeStack,
  type NewHeroOptions,
} from './sim/profile';
import { skills as allSkillDefs } from './data/content';
import { STAT_IDS } from './data/types';
import { buildTitle } from './ui/buildTitle';
import type { Menu } from './ui/store';
import type { DropRoll } from './sim/loot';

type PauseReason = 'manual' | 'hidden' | 'portrait';

export interface JobforgeDebugHandle {
  world(): SimWorld;
  stats(): DebugStats;
  paused(): boolean;
  /** World ground point to CSS pixels, for automated checks. */
  project(x: number, z: number): { x: number; y: number };
  /** Screen pixels to a world ground point, for automated checks. */
  unproject(cx: number, cy: number): { x: number; z: number } | null;
  game: Game;
}

declare global {
  interface Window {
    __jobforge?: JobforgeDebugHandle;
  }
}

const HUD_INTERVAL = 0.1;
const BASE_FOG = '#9fd0f0';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`index.html is missing #${id}`);
  return e as T;
}

const SETTINGS_KEY = 'jobforge.settings.v1';
const AUTOSAVE_DELAY_MS = 700;

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<SettingsData>) };
  } catch {
    // Storage can be blocked; fall back to defaults.
  }
  return defaultSettings();
}

/** Compact number for damage numbers: 1234 becomes 1.2k. */
const compact = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export { buildTitle };

const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Wires the simulation, renderer, input and UI together and runs the frame loop. */
export class Game implements GameApi {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly rig: CameraRig;
  private readonly stepper = new FixedStepper(balance.tickRate, balance.maxFrameSec);
  private hero: HeroView;
  private readonly monsters: MonsterViews;
  private readonly telegraphs: Telegraphs;
  private readonly projectiles: ProjectileView;
  private readonly markers: Markers;
  private readonly loot: LootView;
  private readonly fx: CastFx;
  private readonly overlay: Overlay;
  private readonly controls: Controls;
  private readonly buttons: SkillButtons;
  private readonly pauseEl = el('pause');
  private readonly skillsEl = el('skills');
  private readonly touchEl = el('touch-layer');

  private w!: SimWorld;
  private build: HeroBuild;
  private save: SaveData | null = null;
  private slotIndex = 0;
  private settings: SettingsData = loadSettings();
  private saveTimer = 0;
  private townSaveT = 0;
  private chestApplied = false;
  private wantHero: HeroBuild | null = null;
  private scenery: Scenery | null = null;
  private sceneryKey = '';
  private lastMode: Mode = 'town';
  private screen: 'title' | 'create' | 'town' | 'run' | 'chest' | 'results' = 'title';
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
  private hudT = 0;
  private bannerUntil = 0;
  private clock = 0;
  private swapping = false;

  private readonly ray = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();

  boneNames: string[];
  cheat = {
    fillGauge: () => {
      if (this.w.mode !== 'field') return;
      this.w.run.gauge = this.w.run.gaugeFull - 1;
      const u = this.w.units.find((x) => x.id >= 0 && x.alive && x.team === 'enemy' && !x.elite);
      if (u) killUnit(this.w, u, this.w.hero);
    },
    spawnCharger: () => {
      const def = this.w.content.monsters.get('training_charger');
      if (!def) return;
      const h = this.w.hero;
      this.w.spawnMonster(def, h.x + Math.sin(h.heading) * 9, h.z + Math.cos(h.heading) * 9, 5, {});
    },
    killAll: () => this.w.killAllEnemies(),
    heal: () => {
      this.w.hero.hp = this.w.hero.maxHp;
      this.w.hero.sp = this.w.hero.maxSp;
    },
    levelUp: () => {
      if (!this.save) return;
      this.grantExp(expToNext(balance, this.save.hero.level) + 1, 0);
    },
    gold: () => {
      this.mutate((s) => void (s.hero.gold += 10000));
    },
  };

  private constructor(hero: HeroView, build: HeroBuild) {
    this.hero = hero;
    this.build = build;
    this.boneNames = hero.boneNames;
    const canvas = el<HTMLCanvasElement>('game');
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    this.scene = createScene();
    this.rig = new CameraRig(balance, window.innerWidth / window.innerHeight);
    this.scene.add(hero.root);
    this.monsters = new MonsterViews(this.scene);
    this.telegraphs = new Telegraphs(this.scene);
    this.projectiles = new ProjectileView(this.scene);
    this.markers = new Markers(this.scene);
    this.loot = new LootView(this.scene);
    this.fx = new CastFx(this.scene, balance);
    this.overlay = new Overlay(el<HTMLCanvasElement>('overlay'), balance);

    this.controls = new Controls(this.touchEl, balance, {
      onTap: (x, y) => this.tapAt(x, y),
      onCastKey: (slot, mouse) => {
        if (this.screen !== 'run') return;
        this.casts.push({ slot, aim: mouse ? this.screenToGround(mouse.x, mouse.y) : null });
      },
      onCycleFocus: () => this.w.cycleFocus(),
      onTogglePause: () => this.togglePause(),
      onFirstGesture: unlockAudio,
    });
    this.buttons = new SkillButtons(this.skillsEl, balance, {
      onCast: (slot, dir) => {
        if (this.screen !== 'run') return;
        this.casts.push({ slot, aim: dir ? this.aimPoint(slot, dir) : null });
      },
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
    this.enterTown(); // creates the world the HUD's stats read from
    mountHud(el('hud-root'), this);
    window.__jobforge = {
      world: () => this.w,
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
      game: this,
    };
    this.toTitle();
    void requestPersistence();
    if (portrait.matches) this.reasons.add('portrait');
    if (document.hidden) this.reasons.add('hidden');
  }

  static async create(): Promise<Game> {
    await Promise.race([
      document.fonts.load('700 22px Fredoka'),
      new Promise((r) => setTimeout(r, 1500)),
    ]).catch(() => undefined);
    const build = buildFromPreset('warrior');
    const [hero] = await Promise.all([
      HeroView.create(balance, modelMap, build),
      MonsterViews.preload(),
    ]);
    return new Game(hero, build);
  }

  start(): void {
    this.syncRunning();
  }

  // --- GameApi: screens -------------------------------------------------------------------------

  private newWorld(mode: Mode): void {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.w = new SimWorld({ build: this.build, seed, mode, zoneId: 'meadowmere' });
    this.w.run.bossFirstKill = !this.save || !(this.save.progress.bossKills.queen_gelatina > 0);
    this.lastMode = mode;
    this.casts.length = 0;
    this.aim = null;
    this.monsters.dispose();
    this.overlay.clear();
    this.setScenery(mode);
    this.buttons.setSkills(this.w.hs.slots);
    this.stepper.reset();
    this.rig.snap();
    hudStore.set({
      buffs: [],
      boss: null,
      banner: null,
      introName: null,
      result: null,
      died: false,
      paused: false,
    });
  }

  private setScenery(mode: Mode): void {
    const kind: SceneryKind = mode === 'field' ? 'field' : mode === 'boss' ? 'boss' : 'circle';
    const radius = mode === 'boss' ? (this.w.bossDef?.arenaRadius ?? 15) : undefined;
    const key = `${kind}:${radius ?? ''}:${this.w.zone?.id ?? ''}`;
    if (key === this.sceneryKey) return;
    this.sceneryKey = key;
    if (this.scenery) {
      this.scene.remove(this.scenery.group);
      this.scenery.dispose();
    }
    this.scenery = buildScenery(kind, balance, { zone: this.w.zone, radius });
    this.scene.add(this.scenery.group);
    const fog = kind === 'field' ? (this.w.zone?.field.fog ?? BASE_FOG) : BASE_FOG;
    this.scene.background = new Color(fog);
    this.scene.fog = new Fog(fog, 38, 88);
    this.rig.setDistance(
      kind === 'boss'
        ? balance.boss.arenaCameraDistance
        : kind === 'circle' && this.w.mode === 'town'
          ? 11
          : balance.camera.distance,
    );
  }

  private enterTown(): void {
    this.newWorld('town');
    this.screen = 'town';
    this.skillsEl.hidden = true;
    this.touchEl.hidden = true;
    this.rig.setDistance(11);
    this.pushHud(true);
    hudStore.set({ screen: 'town', mode: 'yard', menu: null });
  }

  private enterRun(mode: 'field' | 'yard'): void {
    this.newWorld(mode);
    this.screen = 'run';
    this.chestApplied = false;
    this.skillsEl.hidden = false;
    this.touchEl.hidden = false;
    this.buttons.setLocked(true); // the skill bar locks once you enter a zone (PRD Section 2)
    this.pushHud(true);
    hudStore.set({ screen: 'run', mode, menu: null });
  }

  startAdventure(): void {
    this.enterRun('field');
  }
  startYard(): void {
    this.enterRun('yard');
  }
  /** Opens a boss directly from the World Map by spending one Boss Sigil. */
  startBoss(): void {
    if (!this.save || (this.save.hero.stacks.boss_sigil ?? 0) < 1) return;
    this.mutate((s) => void takeStack(s, 'boss_sigil', 1));
    this.enterRun('field');
    this.w.enterBoss();
  }
  returnToTown(): void {
    this.setPause('manual', false);
    this.flushSave();
    this.enterTown();
  }
  grindAgain(): void {
    this.w.grindAgain();
    this.afterModeChange();
    this.screen = 'run';
    this.chestApplied = false;
    this.skillsEl.hidden = false;
    hudStore.set({ screen: 'run', mode: 'field', result: null });
  }
  finishChest(): void {
    this.w.finishRun();
    this.showResults();
  }
  skipIntro(): void {
    this.w.skipIntro();
  }
  leaveRun(): void {
    this.setPause('manual', false);
    this.w.leaveRun();
    this.showResults();
  }

  private showResults(): void {
    this.screen = 'results';
    this.skillsEl.hidden = true;
    this.touchEl.hidden = true;
    const r = this.w.run.result;
    if (r?.outcome === 'death' && this.save) this.save.lifetime.deaths += 1;
    this.flushSave();
    hudStore.set({ screen: 'results', result: r, died: r?.outcome === 'death', paused: false });
  }

  private afterModeChange(): void {
    this.lastMode = this.w.mode;
    this.monsters.dispose();
    this.overlay.clear();
    this.setScenery(this.w.mode);
    this.rig.snap();
    this.casts.length = 0;
  }

  togglePause(): void {
    if (this.screen !== 'run') return;
    this.setPause('manual', !this.reasons.has('manual'));
  }

  usePotion(slot: number): void {
    if (this.screen === 'run') this.w.usePotion(slot);
  }

  // --- GameApi: saves and the hero ----------------------------------------------------------------

  getSave(): SaveData {
    if (!this.save) throw new Error('No hero is loaded');
    return this.save;
  }
  currentSlot(): number {
    return this.slotIndex;
  }
  openMenu(menu: Menu): void {
    hudStore.set({ menu });
  }
  listSlots() {
    return listSlots();
  }

  toTitle(): void {
    this.flushSave();
    this.save = null;
    this.build = buildFromPreset('warrior');
    void this.swapHero(this.build);
    this.newWorld('town');
    this.screen = 'title';
    this.skillsEl.hidden = true;
    this.touchEl.hidden = true;
    this.rig.setDistance(11);
    hudStore.set({ screen: 'title', menu: null, storageWarning: storageDegraded() });
  }

  toCreate(slot: number): void {
    this.screen = 'create';
    hudStore.set({ screen: 'create', createSlot: slot });
    this.previewHero('knight', 'sword');
  }

  previewHero(look: string, weapon: 'sword' | 'staff'): void {
    const b = buildFromPreset(weapon === 'staff' ? 'caster' : 'warrior');
    b.look = look;
    b.weapon = { type: weapon, tier: 1 };
    b.offhand = null;
    void this.swapHero(b);
  }

  async loadSlot(slot: number): Promise<void> {
    try {
      const s = await readSlot(slot);
      if (s) await this.activate(s, slot);
    } catch (e) {
      console.error(e);
    }
    hudStore.set({ storageWarning: storageDegraded() });
  }

  async createHero(slot: number, opts: NewHeroOptions): Promise<void> {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const s = newSave(opts, undefined, seed);
    s.settings = { ...this.settings };
    await writeSlot(slot, s);
    await this.activate(s, slot);
  }

  async deleteSlot(slot: number): Promise<void> {
    await removeSlot(slot);
  }

  private async activate(s: SaveData, slot: number): Promise<void> {
    this.save = s;
    this.slotIndex = slot;
    this.build = buildOf(s);
    await this.swapHero(this.build);
    this.enterTown();
    this.refreshHeroState();
  }

  exportCode(): string {
    const s = this.getSave();
    s.settings = { ...this.settings };
    return makeCode(s);
  }

  async importCode(code: string, slot: number): Promise<string | null> {
    try {
      const s = readCode(code);
      await writeSlot(slot, s);
      hudStore.set({ rev: hudStore.get().rev + 1 });
      return null;
    } catch (e) {
      return e instanceof SaveError ? e.message : 'The code could not be imported.';
    }
  }

  getSettings(): SettingsData {
    return this.settings;
  }
  setSettings(patch: Partial<SettingsData>): void {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Not persisted; applies for this session.
    }
    if (this.save) {
      this.save.settings = { ...this.settings };
      this.markDirty();
    }
    hudStore.set({ fpsCounter: this.settings.fpsCounter, rev: hudStore.get().rev + 1 });
  }

  /** Changes the saved hero, then rebuilds the sim hero and refreshes every menu. */
  mutate(fn: (s: SaveData) => void): void {
    if (!this.save) return;
    fn(this.save);
    this.refreshHeroState();
    this.markDirty();
  }

  /** Rebuilds the sim build from the save and updates the town world, the hero model and the HUD. */
  private refreshHeroState(): void {
    if (!this.save) return;
    const old = this.build;
    this.build = buildOf(this.save);
    if (this.screen === 'town') {
      this.w.loadBuild(this.build);
      this.buttons.setSkills(this.w.hs.slots);
    }
    if (
      old.look !== this.build.look ||
      old.offhand !== this.build.offhand ||
      old.weapon.type !== this.build.weapon.type
    )
      void this.swapHero(this.build);
    this.computeBadges();
    this.pushHud(true);
    hudStore.set({ rev: hudStore.get().rev + 1 });
  }

  private computeBadges(): void {
    const s = this.save;
    if (!s) return;
    const p = presetOf(s);
    const learnable = allSkillDefs.some(
      (d) => d.tier <= 5 && !s.hero.learned[d.id] && learnCheck(s, d).ok,
    );
    const rankable =
      s.hero.skillPointsFree > 0 &&
      Object.entries(s.hero.learned).some(
        ([id, r]) => r < (allSkillDefs.find((d) => d.id === id)?.maxRank ?? 0),
      );
    const equipped = new Set(Object.values(p.equipment));
    const score = (i: { defId: string; rarity: string }): number => {
      const d = itemMap.get(i.defId);
      return d
        ? d.tier * 10 + ['common', 'fine', 'rare', 'epic', 'legendary'].indexOf(i.rarity)
        : 0;
    };
    const better = s.hero.inventory.some((i) => {
      if (equipped.has(i.uid)) return false;
      const d = itemMap.get(i.defId);
      if (!d || d.levelReq > s.hero.level) return false;
      const slots = d.slot === 'accessory' ? ['acc1', 'acc2'] : [d.slot];
      return slots.some((sl) => {
        const uid = (p.equipment as Record<string, string | undefined>)[sl];
        const cur = uid ? s.hero.inventory.find((x) => x.uid === uid) : undefined;
        return !cur || score(i) > score(cur);
      });
    });
    hudStore.set({
      badges: {
        status: STAT_IDS.some((k) => canRaiseStat(balance, p, k)),
        guild: learnable || rankable,
        inventory: better,
        overflow: s.hero.overflow.length > 0,
      },
    });
  }

  // --- saving -----------------------------------------------------------------------------------

  private markDirty(): void {
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => this.flushSave(), AUTOSAVE_DELAY_MS);
  }

  /** Writes the hero to its slot now. Called on zone exit, level-up, boss kill and every minute in town. */
  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = 0;
    }
    const s = this.save;
    if (!s) return;
    s.settings = { ...this.settings };
    void writeSlot(this.slotIndex, s).then(() => {
      if (storageDegraded() !== hudStore.get().storageWarning)
        hudStore.set({ storageWarning: storageDegraded() });
    });
  }

  // --- rewards from the sim -----------------------------------------------------------------------

  /** Adds EXP and gold to the saved hero and applies a level-up to the running sim. */
  private grantExp(exp: number, goldAmount: number): void {
    const s = this.save;
    if (!s) return;
    s.hero.gold += goldAmount;
    s.lifetime.kills += 1;
    const up = gainExp(balance, s, exp);
    if (up) {
      const w = this.w;
      this.build.level = up.to;
      w.hero.level = up.to;
      refreshHero(w);
      w.hero.hp = w.hero.maxHp;
      w.hero.sp = w.hero.maxSp;
      this.overlay.spawn(w.hero.x, 2.6, w.hero.z, `LEVEL UP! Lv ${up.to}`, '#ffd23f', true);
      hudStore.set({
        banner: `Level ${up.to}! +${up.statPoints} stat points, +${up.skillPoints} skill point`,
      });
      this.bannerUntil = this.clock + 3.5;
      this.computeBadges();
      this.flushSave();
    }
    hudStore.set({ exp: expFraction(balance, s), gold: s.hero.gold, level: s.hero.level });
  }

  private applyDrops(d: DropRoll): void {
    const s = this.save;
    if (!s) return;
    for (const item of d.items) addItem(s, item);
    for (const st of d.stacks) addStack(s, st.id, st.n);
    this.computeBadges();
    this.markDirty();
  }

  private async swapHero(b: HeroBuild): Promise<void> {
    if (this.swapping) {
      this.wantHero = b;
      return;
    }
    this.swapping = true;
    try {
      const view = await HeroView.create(balance, modelMap, b);
      this.scene.remove(this.hero.root);
      this.hero = view;
      this.boneNames = view.boneNames;
      this.scene.add(view.root);
    } finally {
      this.swapping = false;
    }
    const next = this.wantHero;
    this.wantHero = null;
    if (next) await this.swapHero(next);
  }

  // --- DebugApi ---------------------------------------------------------------------------------

  stats(): DebugStats {
    return {
      fps: this.fpsEma,
      frameMs: this.frameMsEma,
      drawCalls: this.info.calls,
      triangles: this.info.triangles,
      pixelRatio: this.pixelRatio,
      skinned: this.monsters.skinnedCount,
      monsters: this.w.aliveEnemies(),
      projectiles: this.w.projectiles.filter((p) => p.active).length,
    };
  }
  getTimeScale(): number {
    return this.timeScale;
  }
  setTimeScale(v: number): void {
    this.timeScale = v;
  }
  getGodMode(): boolean {
    return this.w.godMode;
  }
  setGodMode(v: boolean): void {
    this.w.godMode = v;
  }

  // --- pause and sizing -------------------------------------------------------------------------

  private setPause(reason: PauseReason, on: boolean): void {
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    hudStore.set({ paused: this.reasons.has('manual') });
    this.syncRunning();
  }

  private syncRunning(): void {
    const shouldRun = this.reasons.size === 0;
    this.pauseEl.hidden = true; // the pause menu is a Preact screen
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

  // --- input helpers ----------------------------------------------------------------------------

  private screenToGround(cx: number, cy: number): { x: number; z: number } | null {
    this.ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.rig.camera);
    if (!this.ray.ray.intersectPlane(this.ground, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  private tapAt(cx: number, cy: number): void {
    if (this.screen !== 'run') return;
    const p = this.screenToGround(cx, cy);
    if (!p) return;
    const u = this.w.pickAt(p.x, p.z);
    // Tap an enemy to focus it; tap it again or tap empty ground to clear (PRD Section 5).
    this.w.setFocus(u && u.id !== this.w.hs.focusId ? u.id : -1);
  }

  private aimLength(slot: number): number {
    return this.w.hs.slots[slot]?.def.range ?? 8;
  }

  private aimPoint(slot: number, dir: { x: number; z: number }): { x: number; z: number } {
    const len = this.aimLength(slot);
    return { x: this.w.hero.x + dir.x * len, z: this.w.hero.z + dir.z * len };
  }

  // --- frame ------------------------------------------------------------------------------------

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const rawMs = now - this.last;
    this.last = now;
    const dt = Math.min(rawMs / 1000, balance.maxFrameSec);
    if (rawMs > 0) {
      this.fpsEma += (1000 / rawMs - this.fpsEma) * 0.05;
      this.frameMsEma += (rawMs - this.frameMsEma) * 0.05;
    }
    this.clock += dt;
    const w = this.w;
    const scaled = dt * this.timeScale;
    const ticks = this.stepper.advance(scaled);
    for (let i = 0; i < ticks; i++) this.tick();
    if (w.mode !== this.lastMode) this.afterModeChange();
    this.watchRun();

    if (this.screen === 'create') {
      w.hero.pheading = w.hero.heading;
      w.hero.heading += dt * 0.9;
    }
    if (this.screen === 'town') {
      this.townSaveT += dt;
      if (this.townSaveT >= balance.progress.autosaveTownSec) {
        this.townSaveT = 0;
        this.flushSave();
      }
    }
    const alpha = this.stepper.alpha;
    const h = w.hero;
    this.hero.update(scaled, h, w.hs, alpha);
    const dirX = w.hs.moving ? Math.sin(h.heading) : 0;
    const dirZ = w.hs.moving ? Math.cos(h.heading) : 0;
    this.rig.update(dt, this.hero.x, this.hero.z, dirX, dirZ);
    const cam = this.rig.camera.position;
    const bars = this.monsters.sync(w, alpha, scaled, cam.x, cam.z);
    this.telegraphs.update(w, this.clock);
    this.projectiles.update(w);
    this.loot.update(w, this.clock);
    this.fx.update(scaled);
    const focus = w.unitById(w.hs.focusId);
    const elite = w.units.find((u) => u.id >= 0 && u.alive && u.elite) ?? null;
    this.markers.update(w, this.clock, focus && focus.alive ? focus : null, elite);
    if (this.screen === 'run') this.updateButtons();

    this.renderer.render(this.scene, this.rig.camera);
    this.info.calls = this.renderer.info.render.calls;
    this.info.triangles = this.renderer.info.render.triangles;

    let arrow: AimArrow | null = null;
    if (this.aim)
      arrow = {
        x: h.x,
        z: h.z,
        dirX: this.aim.x,
        dirZ: this.aim.z,
        length: this.aimLength(this.aim.slot),
      };
    this.overlay.draw(scaled, this.rig.camera, bars, arrow, elite);

    this.hudT += dt;
    if (this.hudT >= HUD_INTERVAL) {
      this.hudT = 0;
      this.pushHud(false);
    }
    if (this.bannerUntil && this.clock > this.bannerUntil) {
      this.bannerUntil = 0;
      hudStore.set({ banner: null });
    }
  };

  private updateButtons(): void {
    const w = this.w;
    const statuses = w.hs.slots.map((_, i) => skillStatus(w, i));
    this.buttons.update(w.hs.cooldown, w.hs.cooldownMax, w.hs.gcd, statuses);
  }

  private tick(): void {
    const w = this.w;
    const m = this.screen === 'run' ? this.controls.getMove() : { x: 0, z: 0 };
    const casts = this.casts.splice(0, this.casts.length);
    w.tick(this.stepper.step, { moveX: m.x, moveZ: m.z, casts });
    for (const e of w.drainEvents()) this.handle(e);
  }

  private handle(e: ReturnType<SimWorld['drainEvents']>[number]): void {
    const w = this.w;
    switch (e.t) {
      case 'dmg': {
        const u = w.unitById(e.targetId);
        const y = e.toHero ? 2.2 : this.monsters.heightOf(e.targetId) + 0.2;
        const color = e.heal
          ? '#6be07a'
          : e.shielded
            ? '#9fd3ff'
            : e.toHero
              ? '#ff5a5a'
              : e.dot
                ? '#ffae5a'
                : e.crit
                  ? '#ffd23f'
                  : '#ffffff';
        if (this.settings.damageNumbers === 'off' && !e.toHero) break;
        this.overlay.spawn(
          u?.x ?? e.x,
          y,
          u?.z ?? e.z,
          this.settings.damageNumbers === 'compact' ? compact(e.amount) : String(e.amount),
          color,
          e.crit,
        );
        break;
      }
      case 'text':
        this.overlay.spawn(e.x, 2.2, e.z, e.text, e.color, false);
        break;
      case 'fx':
        this.fx.spawn(e);
        break;
      case 'banner':
        hudStore.set({ banner: e.text });
        this.bannerUntil = this.clock + 3.5;
        break;
      case 'bossIntro':
        hudStore.set({ introName: e.name });
        break;
      case 'reward':
        this.grantExp(e.exp, e.gold);
        if (e.boss && this.save && w.bossDef) {
          const first = recordBossKill(this.save, w.bossDef.id);
          if (first) hudStore.set({ banner: 'First kill! +2 skill points and new loadout slots' });
          if (first) this.bannerUntil = this.clock + 4;
          this.computeBadges();
          this.flushSave();
        }
        break;
      case 'pickup': {
        const s = this.save;
        if (!s) break;
        if (e.pickup.kind === 'item') {
          const def = itemMap.get(e.pickup.item.defId);
          const r = addItem(s, e.pickup.item);
          const color = {
            common: '#ffffff',
            fine: '#7be07b',
            rare: '#6aa8ff',
            epic: '#c07bff',
            legendary: '#ffa43a',
          }[e.pickup.item.rarity];
          this.overlay.spawn(
            w.hero.x,
            2.9,
            w.hero.z,
            def?.name ?? 'Item',
            color,
            e.pickup.item.rarity !== 'common',
          );
          if (r === 'overflow' || r === 'lost')
            hudStore.set({
              banner:
                r === 'lost'
                  ? 'Bag and overflow are full!'
                  : 'Bag full: item sent to the overflow box',
            });
          if (r !== 'bag') this.bannerUntil = this.clock + 3;
        } else {
          addStack(s, e.pickup.id, e.pickup.n);
          this.overlay.spawn(
            w.hero.x,
            2.7,
            w.hero.z,
            `${stackMap.get(e.pickup.id)?.name ?? e.pickup.id} ×${e.pickup.n}`,
            '#ffe9a8',
            false,
          );
        }
        this.markDirty();
        break;
      }
      case 'potion':
        if (this.save) takeStack(this.save, e.id, 1);
        this.markDirty();
        break;
      case 'cast':
        if (!e.ok && e.reason === 'noSp')
          this.overlay.spawn(w.hero.x, 2.4, w.hero.z, 'Not enough SP', '#6fa8ff', false);
        break;
      default:
        break;
    }
  }

  /** Moves between screens when the run ends or the Queen falls. */
  private watchRun(): void {
    if (this.screen !== 'run') return;
    const r = this.w.run;
    if (r.phase === 'chest') {
      if (!this.chestApplied && r.chest) {
        this.chestApplied = true;
        this.applyDrops(r.chest);
        this.flushSave();
      }
      this.screen = 'chest';
      this.skillsEl.hidden = true;
      hudStore.set({ screen: 'chest', result: r.result });
    } else if (r.phase === 'ended') {
      this.showResults();
    }
    if (hudStore.get().introName && r.phase !== 'intro') hudStore.set({ introName: null });
  }

  private pushHud(force: boolean): void {
    const w = this.w;
    const h = w.hero;
    const buffs: BuffChip[] = [];
    for (const b of h.buffs)
      buffs.push({ key: b.key, label: humanize(b.key), debuff: b.debuff, remaining: b.remaining });
    for (const s of h.statuses)
      buffs.push({ key: s.id, label: humanize(s.id), debuff: true, remaining: s.remaining });
    const boss = w.boss && w.boss.alive && this.screen === 'run' ? w.boss : null;
    const def = w.bossDef;
    const focus: Unit | null = w.unitById(w.hs.focusId);
    const patch = {
      mode: (w.mode === 'boss' ? 'boss' : w.mode === 'field' ? 'field' : 'yard') as
        'yard' | 'field' | 'boss',
      name: this.build.name,
      title: buildTitle(this.build),
      level: this.build.level,
      hp: h.hp,
      maxHp: h.maxHp,
      sp: h.sp,
      maxSp: h.maxSp,
      buffs,
      gauge: w.run.gauge,
      gaugeFull: w.run.gaugeFull,
      portalOpen: !!w.run.portal,
      timer: w.run.elapsed,
      focusName: focus && focus.alive ? focus.name : null,
      exp: this.save ? expFraction(balance, this.save) : 0,
      gold: this.save?.hero.gold ?? 0,
      fpsCounter: this.settings.fpsCounter,
      potions: (this.build.consumables ?? []).flatMap((id, i) => {
        const d = id ? stackMap.get(id) : undefined;
        if (!id || !d) return [];
        const cdMax = balance.items.potion.cooldown;
        const group = d.effect?.type === 'sp' ? 'sp' : 'hp';
        return [
          {
            id,
            name: d.name,
            count: this.build.stacks?.[id] ?? 0,
            cd: Math.min(1, w.hs.potionCd[group] / cdMax),
            slot: i,
          },
        ];
      }),
      boss:
        boss && def
          ? {
              name: def.name,
              hp: boss.hp,
              maxHp: boss.maxHp,
              stagger: boss.stagger,
              staggered: boss.staggerT > 0,
              ticks: def.phases.slice(1).map((p) => p.belowHpPct),
            }
          : null,
    };
    if (force || this.screen === 'run' || this.screen === 'town') hudStore.set(patch);
  }
}
