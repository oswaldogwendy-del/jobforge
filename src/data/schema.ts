import { z } from 'zod';
import balanceJson from './balance.json';
import modelMapJson from './modelMap.json';
import stringsJson from './strings.en.json';
import debugSkillsJson from './debugSkills.json';

// Runtime validation for every data file (PRD Section 16). A bad file throws and names the field.

const num = z.number().finite();

export const BalanceSchema = z.object({
  tickRate: num.positive(),
  maxFrameSec: num.positive(),
  hero: z.object({
    moveSpeed: num.positive(),
    turnRate: num.positive(),
    radius: num.positive(),
    atk: num.positive(),
    critChance: num.min(0).max(1),
    critMult: num.min(1),
    variance: num.min(0).max(0.5),
    weapon: z.object({
      aps: num.positive(),
      range: num.positive(),
      windupFraction: num.min(0).max(1),
    }),
  }),
  targeting: z.object({
    autoAttackRange: num.positive(),
    focusPickRadius: num.positive(),
    castTargetRange: num.positive(),
  }),
  dummies: z.object({
    count: z.number().int().positive(),
    hp: num.positive(),
    radius: num.positive(),
    height: num.positive(),
    respawnSec: num.positive(),
    flashSec: num.positive(),
    minSpacing: num.positive(),
    spawnClearRadius: num.nonnegative(),
    placeRadius: num.positive(),
    seed: z.number().int(),
  }),
  arena: z.object({ radius: num.positive() }),
  camera: z.object({
    fov: num.positive(),
    pitchDeg: num.positive().max(89),
    distance: num.positive(),
    lookAhead: num.nonnegative(),
    followRate: num.positive(),
    lookAheadRate: num.positive(),
    near: num.positive(),
    far: num.positive(),
  }),
  joystick: z.object({
    zoneFraction: num.min(0).max(1),
    deadZone: num.min(0).max(1),
    maxRadiusPx: num.positive(),
    fullSpeedAt: num.positive().max(1),
    tapMaxMs: num.positive(),
    tapMaxPx: num.positive(),
  }),
  skills: z.object({
    globalCooldown: num.nonnegative(),
    meleeStepMax: num.nonnegative(),
    dragStartPx: num.positive(),
  }),
  render: z.object({
    maxPixelRatio: num.positive(),
    damageNumberPool: z.number().int().positive(),
    damageNumberLife: num.positive(),
    fxPool: z.number().int().positive(),
    fxLife: num.positive(),
  }),
});
export type Balance = z.infer<typeof BalanceSchema>;

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

export const DebugSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  glyph: z.string(),
  color: z.string(),
  cooldown: num.positive(),
  effect: z.object({
    shape: z.enum(['circle', 'cone', 'line']),
    at: z.enum(['self', 'ground']),
    range: num.positive(),
    reach: num.positive().optional(),
    angleDeg: num.positive().optional(),
    width: num.positive().optional(),
    atkPct: num.positive(),
    hits: z.number().int().positive(),
  }),
});
export type DebugSkill = z.infer<typeof DebugSkillSchema>;

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

export const balance = parseOrThrow('balance.json', BalanceSchema, balanceJson);
export const modelMap = parseOrThrow('modelMap.json', ModelMapSchema, modelMapJson);
export const strings = parseOrThrow('strings.en.json', StringsSchema, stringsJson);
export const debugSkills = parseOrThrow(
  'debugSkills.json',
  z.array(DebugSkillSchema).length(6),
  debugSkillsJson,
);
