// Ranked values: a skill lists "r1 -> r5" (or r1 -> r3 for ultimates) and ranks in between
// interpolate linearly (PRD Section 7).
export type Ranked = number | [number, number];

export function rv(r: Ranked | undefined, rank: number, maxRank: number, fallback = 0): number {
  if (r === undefined) return fallback;
  if (typeof r === 'number') return r;
  const t = maxRank <= 1 ? 0 : Math.min(1, Math.max(0, (rank - 1) / (maxRank - 1)));
  return r[0] + (r[1] - r[0]) * t;
}

const PERCENT_KEYS = new Set(['atk', 'matk', 'chance', 'maxHpPct', 'pct']);

/** Walks an effect tree and returns the first value found for each key, for skill text. */
export function collectTextVars(effects: unknown[]): Record<string, Ranked> {
  const out: Record<string, Ranked> = {};
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length === 2 && typeof node[0] === 'number' && typeof node[1] === 'number') return;
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const isRanked =
        typeof v === 'number' ||
        (Array.isArray(v) &&
          v.length === 2 &&
          typeof v[0] === 'number' &&
          typeof v[1] === 'number');
      if (isRanked && !(k in out)) out[k] = v as Ranked;
      else if (!isRanked) visit(v);
    }
  };
  effects.forEach(visit);
  return out;
}

/** Fills "{matk}"-style placeholders from the skill's effect values at a rank. */
export function formatSkillText(
  text: string,
  effects: unknown[],
  rank: number,
  maxRank: number,
): string {
  const vars = collectTextVars(effects);
  return text.replace(/\{(\w+)\}/g, (m, key: string) => {
    if (!(key in vars)) return m;
    const v = rv(vars[key], rank, maxRank);
    if (PERCENT_KEYS.has(key)) return `${Math.round(v * 100)}%`;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  });
}
