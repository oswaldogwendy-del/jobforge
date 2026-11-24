import { useEffect, useState } from 'preact/hooks';
import type { RunResult } from '../sim/run';

export type Screen = 'title' | 'create' | 'town' | 'run' | 'chest' | 'results';

/** Town menus that open over the hub. */
export type Menu =
  | null
  | 'status'
  | 'guild'
  | 'loadout'
  | 'inventory'
  | 'shop'
  | 'oracle'
  | 'map'
  | 'settings'
  | 'credits';

export interface BuffChip {
  key: string;
  label: string;
  debuff: boolean;
  remaining: number;
}

export interface BossBar {
  name: string;
  hp: number;
  maxHp: number;
  /** 0..100 */
  stagger: number;
  staggered: boolean;
  /** HP percent thresholds where phases start (66, 33). */
  ticks: number[];
}

export interface HudState {
  screen: Screen;
  paused: boolean;
  mode: 'yard' | 'field' | 'boss';
  name: string;
  title: string;
  level: number;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  buffs: BuffChip[];
  gauge: number;
  gaugeFull: number;
  portalOpen: boolean;
  boss: BossBar | null;
  timer: number;
  banner: string | null;
  introName: string | null;
  result: RunResult | null;
  /** Shown when the run ended by death rather than victory. */
  died: boolean;
  focusName: string | null;
  /** The open town menu, or null for the hub. */
  menu: Menu;
  /** Slot a new hero will be saved into. */
  createSlot: number;
  /** Base EXP progress (0 to 1) and gold, for the HUD and menus. */
  exp: number;
  gold: number;
  /** Consumable slots: id, name, count and cooldown fraction left (0 to 1). */
  potions: { id: string; name: string; count: number; cd: number; slot: number }[];
  /** Bumped whenever the saved hero changes, so menus re-read it. */
  rev: number;
  /** Red badges on the town hub. */
  badges: { status: boolean; guild: boolean; inventory: boolean; overflow: boolean };
  storageWarning: boolean;
  /** Damage numbers setting, mirrored for the overlay. */
  fpsCounter: boolean;
}

export const initialHud: HudState = {
  screen: 'title',
  paused: false,
  mode: 'yard',
  name: '',
  title: '',
  level: 1,
  hp: 1,
  maxHp: 1,
  sp: 0,
  maxSp: 1,
  buffs: [],
  gauge: 0,
  gaugeFull: 100,
  portalOpen: false,
  boss: null,
  timer: 0,
  banner: null,
  introName: null,
  result: null,
  died: false,
  focusName: null,
  menu: null,
  createSlot: 0,
  exp: 0,
  gold: 0,
  potions: [],
  rev: 0,
  badges: { status: false, guild: false, inventory: false, overflow: false },
  storageWarning: false,
  fpsCounter: false,
};

type Listener = () => void;

/** A tiny observable store: the game pushes state about ten times a second, components subscribe. */
class Store<T extends object> {
  private listeners = new Set<Listener>();
  constructor(private state: T) {}
  get(): T {
    return this.state;
  }
  set(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const hudStore = new Store<HudState>(initialHud);

export function useHud(): HudState {
  const [s, setS] = useState(hudStore.get());
  useEffect(() => {
    // The store may have changed between the first render and this effect running.
    setS(hudStore.get());
    return hudStore.subscribe(() => setS(hudStore.get()));
  }, []);
  return s;
}
