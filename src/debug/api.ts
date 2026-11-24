export interface DebugStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  pixelRatio: number;
}

/** What the debug panel can read and change. Implemented by Game. */
export interface DebugApi {
  stats(): DebugStats;
  getTimeScale(): number;
  setTimeScale(v: number): void;
  getGodMode(): boolean;
  setGodMode(v: boolean): void;
  boneNames: string[];
}
