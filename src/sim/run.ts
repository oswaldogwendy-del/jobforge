// Run state: what a trip into a zone has collected and where it is in the loop
// field -> boss intro -> boss -> chest -> results -> town (PRD Section 3).

export type RunPhase = 'field' | 'intro' | 'boss' | 'chest' | 'ended';

export interface RunResult {
  outcome: 'victory' | 'death' | 'left';
  timeSec: number;
  kills: number;
  elites: number;
  exp: number;
  /** EXP as a fraction of the level the hero was on. */
  expPct: number;
  gold: number;
  bossDefeated: boolean;
  /** Loot lines for the chest and results screens (items arrive in M2). */
  loot: { kind: 'gold' | 'note'; text: string }[];
  seed: number;
}

export interface RunState {
  phase: RunPhase;
  zoneId: string;
  gauge: number;
  gaugeFull: number;
  portal: { x: number; z: number } | null;
  kills: number;
  elites: number;
  gold: number;
  exp: number;
  elapsed: number;
  introT: number;
  bossFirstKill: boolean;
  result: RunResult | null;
  /** Time until the next elite appears, in seconds. */
  eliteIn: number;
}

export function newRun(zoneId: string, gaugeFull: number, eliteEvery: number): RunState {
  return {
    phase: 'field',
    zoneId,
    gauge: 0,
    gaugeFull,
    portal: null,
    kills: 0,
    elites: 0,
    gold: 0,
    exp: 0,
    elapsed: 0,
    introT: 0,
    bossFirstKill: true,
    result: null,
    eliteIn: eliteEvery,
  };
}
