import { z } from 'zod';
import balanceJson from './balance.json';
import modelMapJson from './modelMap.json';
import stringsJson from './strings.en.json';

// Runtime validation for every data file (PRD Section 16). A bad file throws and names the file
// and field. Balance is large and flat, so its types come from the JSON itself and the loader
// checks that every value is a finite number (plus a few range rules below).

const num = z.number().finite();

export type Balance = typeof balanceJson;

/** Every leaf must be a finite number (or a string/boolean); the error names the path. */
export function checkTree(name: string, node: unknown, path = ''): void {
  if (typeof node === 'number') {
    if (!Number.isFinite(node)) throw new Error(`${name}: ${path}: expected a finite number`);
    return;
  }
  if (typeof node === 'string' || typeof node === 'boolean') return;
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) checkTree(name, v, path ? `${path}.${k}` : k);
    return;
  }
  throw new Error(`${name}: ${path}: unexpected value ${String(node)}`);
}

const RANGE_RULES: [path: string, min: number, max: number][] = [
  ['tickRate', 1, 120],
  ['arena.radius', 1, 1000],
  ['camera.pitchDeg', 1, 89],
  ['joystick.deadZone', 0, 1],
  ['joystick.zoneFraction', 0, 1],
  ['combat.hitMinPct', 0, 100],
  ['combat.hitMaxPct', 0, 100],
  ['caps.cdrPct', 0, 100],
  ['caps.castMinFraction', 0, 1],
  ['caps.totalReductionPct', 0, 100],
  ['caps.defReductionPct', 0, 100],
  ['stats.maxBaseStat', 1, 999],
];

export function parseBalance(name: string, data: unknown): Balance {
  checkTree(name, data);
  const get = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], data);
  for (const [path, min, max] of RANGE_RULES) {
    const v = get(path);
    if (typeof v !== 'number' || v < min || v > max) {
      throw new Error(
        `${name}: ${path}: expected a number from ${min} to ${max}, got ${String(v)}`,
      );
    }
  }
  return data as Balance;
}

export const ModelMapSchema = z.object({
  animations: z.object({
    file: z.string(),
    idle: z.string(),
    run: z.string(),
    attack: z.string(),
  }),
  looks: z.record(z.string(), z.object({ file: z.string(), scale: num.positive() })),
  weapons: z.record(z.string(), z.object({ file: z.string(), slot: z.string() })),
  hero: z.object({ look: z.string(), weapon: z.string(), offhand: z.string().optional() }),
  monsters: z.record(
    z.string(),
    z.object({
      file: z.string(),
      scale: num.positive(),
      /** Multiplies the model's colors, so one model can stand in for several monsters. */
      tint: z.string().optional(),
      /** Metres above the ground for flying monsters. */
      hover: num.nonnegative().optional(),
      anim: z.object({
        idle: z.string(),
        move: z.string(),
        attack: z.string(),
        hit: z.string(),
        death: z.string(),
      }),
    }),
  ),
});
export type ModelMap = z.infer<typeof ModelMapSchema>;

export const StringsSchema = z.object({
  rotate: z.object({ title: z.string(), body: z.string() }),
  paused: z.string(),
  tapToResume: z.string(),
  loading: z.string(),
  loadFailed: z.string(),
  update: z.string(),
  offlineReady: z.string(),
  noTarget: z.string(),
  miss: z.string(),
  debug: z.record(z.string(), z.string()),
});
export type Strings = z.infer<typeof StringsSchema>;

export function parseOrThrow<T>(name: string, schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`${name}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return r.data;
}

export const balance = parseBalance('balance.json', balanceJson);
export const modelMap = parseOrThrow('modelMap.json', ModelMapSchema, modelMapJson);
export const strings = parseOrThrow('strings.en.json', StringsSchema, stringsJson);
