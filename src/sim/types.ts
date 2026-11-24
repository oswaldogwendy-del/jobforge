import type { ItemInstance } from '../data/types';
import type {
  Archetype,
  AttackDef,
  EffectDef,
  Element,
  Race,
  SkillDef,
  StatusId,
} from '../data/types';
import type { ShapeSpec } from './geometry';

export interface StatusInst {
  id: StatusId;
  remaining: number;
  /** DoT statuses: damage per second (computed from the caster). Others: strength (e.g. slow %). */
  power: number;
  stacks: number;
  src: number;
  tick: number;
}

/** A resolved modifier (ranks already applied). */
export interface ModEntry {
  stat: string;
  add: number;
  pct: number;
  /** Only counts for skills that carry one of these tags (or basic attacks tagged 'basic'). */
  tags?: string[];
}

export interface BuffInst {
  key: string;
  src: number;
  remaining: number;
  mods: ModEntry[];
  immune: string[];
  debuff: boolean;
}

export type UnitKind = 'hero' | 'monster' | 'summon';

export interface Unit {
  id: number;
  kind: UnitKind;
  team: 'player' | 'enemy';
  defId: string;
  name: string;
  x: number;
  z: number;
  px: number;
  pz: number;
  heading: number;
  pheading: number;
  r: number;
  level: number;
  element: Element;
  race: Race | null;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  alive: boolean;
  /** Seconds since death, for corpses and respawn. */
  deadFor: number;
  // Combat numbers (effective, recomputed when buffs change).
  atk: number;
  matkMin: number;
  matkMax: number;
  hit: number;
  flee: number;
  def: number;
  mdef: number;
  critPct: number;
  critMult: number;
  aps: number;
  moveSpeed: number;
  perfectDodgePct: number;
  /** Un-buffed numbers; buffs and debuffs are applied on top of these in refreshUnit. */
  base: {
    atk: number;
    matkMin: number;
    matkMax: number;
    def: number;
    mdef: number;
    hit: number;
    flee: number;
    moveSpeed: number;
    aps: number;
  };
  /** Fraction of melee damage reflected to the attacker (Thornling card-style trait). */
  reflectMelee: number;
  /** Fraction of damage removed by effects other than DEF (auras, buffs). */
  damageReduction: number;
  /** Chance (percent) to resist each status. */
  resist: Partial<Record<StatusId, number>>;
  statuses: StatusInst[];
  /** Sim time of the last stun, freeze or root, for the repeat-halving rule. */
  ccLast: Partial<Record<StatusId, number>>;
  buffs: BuffInst[];
  shield: number;
  shieldT: number;
  invuln: number;
  lastDamagedAt: number;
  isBoss: boolean;
  elite: boolean;
  stagger: number;
  staggerT: number;
  /** Knockback slide: total displacement, seconds elapsed and total duration. */
  kbX: number;
  kbZ: number;
  kbT: number;
  kbDur: number;
  /** Seconds during which a new knockback is ignored. */
  kbImmuneT: number;
  /** Hit-stun after a knockback: a normal monster cannot act and loses its windup. */
  hitStunT: number;
  /** Set by taunt: the unit this one must target. */
  tauntTarget: number;
  tauntT: number;
  ai: AiState | null;
  summon: { ownerId: number; expires: number; attackCd: number } | null;
}

export interface AiState {
  archetype: Archetype;
  state:
    'idle' | 'chase' | 'attack' | 'windup' | 'recover' | 'return' | 'hidden' | 'erupt' | 'dash';
  /** Seconds in the current state. */
  t: number;
  spawnX: number;
  spawnZ: number;
  packId: number;
  /** Cooldown left per attack id. */
  cooldowns: Record<string, number>;
  /** The attack being wound up. */
  attackId: string | null;
  /** Locked telegraph position and heading. */
  lockX: number;
  lockZ: number;
  lockHeading: number;
  telegraphId: number;
  /** Where the monster was last sure the hero was. */
  hasAggro: boolean;
  /** Path waypoints when the straight line is blocked. */
  path: { x: number; z: number }[] | null;
  pathT: number;
  /** Extra free-form state for boss scripts. */
  script: Record<string, number>;
  /** Remaining dash distance (charger). */
  dashLeft: number;
  /** Seconds until the next attack decision. */
  think: number;
  /** Unique id helps tests and renders. */
  strafeDir: number;
}

export interface Telegraph {
  id: number;
  shape: 'circle' | 'cone' | 'line' | 'donut' | 'cross';
  x: number;
  z: number;
  heading: number;
  radius: number;
  angleDeg: number;
  length: number;
  width: number;
  inner: number;
  /** Seconds elapsed and total warning. */
  t: number;
  warn: number;
  kind: 'damage' | 'debuff' | 'freeze';
  ownerId: number;
  active: boolean;
}

export type SimEvent =
  | {
      t: 'dmg';
      targetId: number;
      x: number;
      z: number;
      amount: number;
      crit: boolean;
      toHero: boolean;
      heal?: boolean;
      miss?: boolean;
      dot?: boolean;
      shielded?: boolean;
    }
  | { t: 'kill'; targetId: number; defId: string; elite: boolean; boss: boolean }
  | {
      t: 'fx';
      shape: 'circle' | 'cone' | 'line';
      x: number;
      z: number;
      heading: number;
      size: number;
      angleDeg: number;
      width: number;
      color: string;
    }
  | { t: 'proj'; id: number; spawn: boolean; x: number; z: number; color: string }
  | { t: 'text'; x: number; z: number; text: string; color: string }
  | { t: 'banner'; text: string }
  | { t: 'portal'; x: number; z: number }
  | { t: 'bossIntro'; name: string }
  | { t: 'phase'; phase: number }
  | { t: 'died'; targetId: number }
  | { t: 'cast'; slot: number; ok: boolean; reason?: string }
  /** EXP and gold a kill is worth, for the game to add to the saved hero. */
  | { t: 'reward'; exp: number; gold: number; level: number; boss: boolean }
  /** A drop reached the hero. The game puts it in the bag. */
  | { t: 'pickup'; pickup: PickupPayload; x: number; z: number }
  /** A potion was used from a consumable slot. */
  | { t: 'potion'; id: string }
  | { t: 'levelUp'; level: number };

export type PickupPayload =
  { kind: 'item'; item: ItemInstance } | { kind: 'stack'; id: string; n: number };

/** A drop lying on the ground until it flies to the hero. */
export interface Pickup {
  payload: PickupPayload;
  x: number;
  z: number;
  /** Seconds since it dropped. */
  t: number;
  /** Rarity colour key for the beam: item rarity, or 'common' for stacks. */
  rarity: string;
  /** Short label such as the item name. */
  label: string;
}

/** What a running skill effect knows about who cast it and how. */
export interface FxCtx {
  caster: Unit;
  skill: SkillDef | null;
  rank: number;
  maxRank: number;
  /** Skill tags plus the element, used to match modifiers. */
  tags: string[];
  heading: number;
  aimX: number;
  aimZ: number;
  target: Unit | null;
  affinity: boolean;
  /** Effects started by a trigger cannot start more triggers. */
  fromProc: boolean;
  /** Orbs or coins spent by a resource effect earlier in the same cast. */
  spent: number;
}

export interface Projectile {
  id: number;
  active: boolean;
  x: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  radius: number;
  range: number;
  pierceLeft: number;
  bounceLeft: number;
  homing: boolean;
  targetId: number;
  team: 'player' | 'enemy';
  color: string;
  hitSet: number[];
  // Skill projectiles run effects on hit; monster projectiles apply an attack's damage.
  onHit: EffectDef[] | null;
  ctx: FxCtx | null;
  attack: AttackDef | null;
  attackerId: number;
}

export interface AreaInst {
  id: number;
  active: boolean;
  spec: ShapeSpec;
  delay: number;
  duration: number;
  tick: number;
  elapsed: number;
  nextTick: number;
  effects: EffectDef[];
  ctx: FxCtx;
  team: 'player' | 'enemy';
  scatter: { count: number; hitRadius: number; fired: number } | null;
  /** Units already hit by a single-shot area, so a zero-duration area hits each once. */
  once: boolean;
}

export interface SlotSkill {
  def: SkillDef;
  rank: number;
}

export interface CastingState {
  slot: number;
  t: number;
  total: number;
  aimX: number | null;
  aimZ: number | null;
  targetId: number;
  /** True on the tick the cast began, so held joystick input from before it does not cancel it. */
  fresh: boolean;
}

export interface DashState {
  dx: number;
  dz: number;
  left: number;
  speed: number;
  hit: number[];
  onPass: EffectDef[];
  onArrive: EffectDef[];
  ctx: FxCtx;
}

export interface HeroState {
  slots: (SlotSkill | null)[];
  passives: SlotSkill[];
  cooldown: number[];
  cooldownMax: number[];
  gcd: number;
  casting: CastingState | null;
  dash: DashState | null;
  toggles: number[];
  resources: { orbs: number; coins: number };
  swinging: boolean;
  swingT: number;
  swingPending: boolean;
  /** Increments whenever an attack or cast animation should start. */
  swingSeq: number;
  focusId: number;
  /** Time (sim seconds) each trigger is next allowed to fire, keyed by skill id and index. */
  icd: Record<string, number>;
  moving: boolean;
  passiveMods: ModEntry[];
  toggleMods: ModEntry[];
  /** True while a passive trigger is running its effects, so procs cannot start procs. */
  inProc: boolean;
  /** Cast time multiplier and cooldown reduction from the hero's current stats. */
  castMult: number;
  cdrPct: number;
  /** One-shot flag used by lowHp triggers so they fire on the way down, not every hit. */
  lowHpArmed: boolean;
  /** Loot and gold bonuses from LUK and gear, and heal-on-kill from a legendary. */
  dropBonus: number;
  goldBonus: number;
  healOnKillPct: number;
  /** Seconds until each potion group can be used again. */
  potionCd: { hp: number; sp: number };
}
