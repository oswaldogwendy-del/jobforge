import { useEffect, useState } from 'preact/hooks';
import type { RunResult } from '../sim/run';

export type Screen = 'town' | 'run' | 'chest' | 'results';

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
}

export const initialHud: HudState = {
  screen: 'town',
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
  useEffect(() => hudStore.subscribe(() => setS(hudStore.get())), []);
  return s;
}
