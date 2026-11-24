// Shared data types (PRD Section 16). Extensions beyond the PRD are marked EXT and logged in
// DECISIONS.md: atRank, bonusIfStatus, chain, scatter, dash.onPass, buff immunities.
import type { Ranked } from '../sim/ranked';

export type { Ranked };
export type Stat = 'STR' | 'AGI' | 'VIT' | 'INT' | 'DEX' | 'LUK';
export type Element =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'wind'
  | 'earth'
  | 'poison'
  | 'holy'
  | 'shadow'
  | 'ghost'
  | 'undead';
export type Race =
  'formless' | 'undead' | 'brute' | 'plant' | 'insect' | 'demon' | 'humanoid' | 'dragon';
export type WeaponType =
  'sword' | 'greataxe' | 'dagger' | 'mace' | 'knuckle' | 'staff' | 'bow' | 'gun';
export type StatusId =
  | 'stun'
  | 'freeze'
  | 'root'
  | 'slow'
  | 'burn'
  | 'poison'
  | 'bleed'
  | 'blind'
  | 'silence'
  | 'curse'
  | 'mark'
  | 'taunt';
export type Shape = 'circle' | 'cone' | 'line' | 'donut' | 'cross';

export const STAT_IDS: Stat[] = ['STR', 'AGI', 'VIT', 'INT', 'DEX', 'LUK'];

/**
 * A stat modifier. `stat` is one of: STR AGI VIT INT DEX LUK (add), or maxHpPct maxSpPct spRegen
 * def mdef hit flee aps castSpeed cdr damagePct critChance critDamage atkPct matkPct spCostPct
 * moveSpeed dropRate goldRate blockPct. `add` is flat, `pct` is a fraction (0.1 = +10%).
 */
export interface StatMod {
  stat: string;
  add?: Ranked;
  pct?: Ranked;
}

interface Base {
  /** EXT: the effect only applies at this rank or higher (Crushing Blow's stun at rank 5). */
  atRank?: number;
}

export type EffectDef = Base &
  (
    | {
        type: 'damage';
        school: 'physical' | 'magic';
        element?: Element | 'weapon';
        atk?: Ranked;
        matk?: Ranked;
        hits?: number;
        canCrit?: boolean;
        ignoreDefPct?: number;
        /** EXT: extra damage against targets that carry a status. */
        bonusIfStatus?: { status: StatusId; pct: number };
        /** EXT: after the first hit, jump to nearby enemies (Chain Lightning). */
        chain?: { jumps: Ranked; radius: number; falloff: number };
      }
    | {
        type: 'projectile';
        speed: number;
        radius: number;
        count?: Ranked;
        spreadDeg?: number;
        pierce?: number;
        homing?: boolean;
        bounce?: Ranked;
        onHit: EffectDef[];
      }
    | {
        type: 'area';
        shape: Shape;
        at: 'self' | 'target' | 'ground';
        radius?: number;
        angleDeg?: number;
        length?: number;
        width?: number;
        inner?: number;
        delay?: number;
        duration?: number;
        tick?: number;
        /** EXT: strike `count` random points inside the area over its duration (Cataclysm). */
        scatter?: { count: Ranked; hitRadius: number };
        onTick: EffectDef[];
      }
    | {
        type: 'heal';
        who: 'self' | 'summons' | 'selfAndSummons';
        matk?: Ranked;
        maxHpPct?: Ranked;
        radius?: number;
      }
    | { type: 'shield'; maxHpPct?: Ranked; matk?: Ranked; duration: Ranked }
    | {
        type: 'status';
        status: StatusId;
        duration: Ranked;
        chance?: Ranked;
        power?: Ranked;
      }
    | {
        type: 'buff' | 'debuff';
        mods: StatMod[];
        duration: Ranked;
        who?: 'self' | 'summons' | 'selfAndSummons' | 'targets';
        /** EXT: statuses and "knockback" the holder is immune to while this lasts. */
        immune?: (StatusId | 'knockback')[];
        /** EXT: shown in the HUD and used to find this buff again. */
        key?: string;
      }
    | {
        type: 'dash';
        distance: number;
        speed: number;
        to?: 'direction' | 'behindTarget' | 'point';
        iframes?: number;
        onArrive?: EffectDef[];
        /** EXT: applied once to every enemy the hero passes through. */
        onPass?: EffectDef[];
      }
    | { type: 'summon'; unitId: string; count: Ranked; duration: number; maxAlive: Ranked }
    | { type: 'displace'; kind: 'knockback' | 'pull'; distance: number }
    | { type: 'taunt'; radius: number; duration: Ranked }
    | { type: 'cleanse'; count: number }
    | { type: 'resource'; resource: 'orbs' | 'coins'; amount: number | 'all'; spend?: boolean }
    | { type: 'toggle'; mods: StatMod[]; spPerSec: number }
    | {
        type: 'trigger';
        on:
          | 'hit'
          | 'crit'
          | 'kill'
          | 'block'
          | 'damaged'
          | 'lowHp'
          | 'dodge'
          | 'lethal'
          | 'summonDeath';
        chance?: Ranked;
        icd?: Ranked;
        threshold?: number;
        effects: EffectDef[];
      }
    | { type: 'modifier'; mods: StatMod[]; tags?: string[] }
  );

export interface ClassDef {
  id: string;
  name: string;
  color: string;
  primary: Stat;
  secondary: Stat;
  affinity: WeaponType[];
  unlock: { type: 'start' } | { type: 'boss'; bossId: string };
  blurb: string;
  /** EXT: the class has no skills yet; the Guild Hall shows it greyed out until this milestone. */
  comingIn?: 'M3' | 'M4';
}

export interface SkillDef {
  id: string;
  classId: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  kind: 'active' | 'passive' | 'toggle';
  tags: string[];
  req: Partial<Record<Stat, number>>;
  gold: number;
  maxRank: 3 | 5;
  target?: 'self' | 'enemy' | 'direction' | 'ground';
  range?: number;
  cast?: number;
  cooldown?: Ranked;
  sp?: Ranked;
  goldPerUse?: { base: number; perLevel: number };
  hpCostPct?: number;
  affinity?: WeaponType[];
  effects: EffectDef[];
  anim?: string;
  vfx?: string;
  sfx?: string;
  ai?: {
    priority: number;
    when?: 'always' | 'enemiesInRange' | 'hpBelow' | 'boss';
    value?: number;
  };
  text: string;
}

export interface AttackDef {
  id: string;
  weight: number;
  cooldown: number;
  range: number;
  telegraph?: {
    shape: Shape;
    at: 'self' | 'target' | 'targetLocked';
    radius?: number;
    angleDeg?: number;
    length?: number;
    width?: number;
    inner?: number;
    warn: number;
  };
  projectile?: { speed: number; count?: number; spreadDeg?: number };
  damage?: {
    atkPct: number;
    element?: Element;
    status?: { id: StatusId; chance: number; duration: number };
  };
  displace?: { kind: 'knockback' | 'pull'; distance: number };
  summon?: { monsterId: string; count: number };
  script?: string;
}

export type Archetype =
  | 'dummy'
  | 'chaser'
  | 'kiter'
  | 'caster'
  | 'charger'
  | 'swarmer'
  | 'burrower'
  | 'exploder'
  | 'support'
  | 'splitter';

export interface MonsterDef {
  id: string;
  name: string;
  zoneId: string;
  race: Race;
  element: Element;
  archetype: Archetype;
  model: string;
  mult?: {
    hp?: number;
    atk?: number;
    def?: number;
    mdef?: number;
    hit?: number;
    flee?: number;
    speed?: number;
    aps?: number;
  };
  moveSpeed: number;
  aggroRange: number;
  packSize: [number, number];
  attacks: AttackDef[];
  cardId: string;
  radius?: number;
  elite?: boolean;
}

export interface BossDef extends MonsterDef {
  level: number;
  hpMult: number;
  arenaRadius: number;
  phases: { belowHpPct: number; attacks: string[]; onEnter?: string }[];
  enrage: { atSec: number; mods: StatMod[] };
  legendaryIds: [string, string];
  firstKill: {
    unlockClasses?: string[];
    unlockZone?: string;
    activeSlots?: number;
    passiveSlots?: number;
    presets?: number;
    feature?: 'tower' | 'refine10' | 'nightmare';
    guaranteedItemId?: string;
  };
}

export interface ZoneDef {
  id: string;
  name: string;
  levels: [number, number];
  element: Element;
  field: {
    size: [number, number];
    seed: number;
    fog: string;
    spawnPoints: { x: number; z: number; level: number }[];
    obstacles: { x: number; z: number; r?: number; w?: number; d?: number }[];
    props: { model: string; x: number; z: number; rot: number; scale: number }[];
  };
  monsters: { id: string; weight: number }[];
  eliteId: string;
  eliteEverySec: number;
  bossId: string;
  gauge: { full: number; normal: number; elite: number };
  maxAlive: number;
  respawnSec: number;
  materialId: string;
}

export interface SummonDef {
  id: string;
  model: string;
  hpPctOfOwner: number;
  archetype: 'chaser' | 'kiter';
  attack: {
    school: 'physical' | 'magic';
    element: Element;
    atk?: Ranked;
    matk?: Ranked;
    aps: number;
    range: number;
  };
  taunt?: { radius: number };
}

// --- Items, consumables and materials (PRD Section 12) --------------------------------------

export type EquipSlot =
  'weapon' | 'offhand' | 'head' | 'armor' | 'garment' | 'shoes' | 'acc1' | 'acc2';
export type ItemSlot = 'weapon' | 'offhand' | 'head' | 'armor' | 'garment' | 'shoes' | 'accessory';
export type Rarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary';

export interface ItemBase {
  atk?: number;
  matk?: number;
  def?: number;
  mdef?: number;
  maxHpPct?: number;
  maxSpPct?: number;
  flee?: number;
  moveSpeedPct?: number;
  stats?: Partial<Record<Stat, number>>;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: ItemSlot;
  /** Item type: sword, shield, helm, plate, ring and so on. */
  type: string;
  weaponType?: WeaponType;
  offhandType?: 'shield' | 'tome';
  twoHanded?: boolean;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  levelReq: number;
  base: ItemBase;
  aps?: number;
  range?: number;
  maxSlots: number;
  /** Key of modelMap.json weapons for items that show on the hero. */
  model?: string;
  sellPrice: number;
  /** EXT: the unique effect of a legendary (only the listed parts are implemented). */
  legendary?: { text: string; healOnKillPct?: number; spellEchoChance?: number };
}

export interface ItemInstance {
  uid: string;
  defId: string;
  rarity: Rarity;
  refine: number;
  bonus: Partial<Record<Stat, number>>;
  /** Socketed card ids (cards arrive in M3). */
  slots: (string | null)[];
  locked?: boolean;
}

/** Stackable goods: potions, materials and keys. */
export interface StackDef {
  id: string;
  name: string;
  kind: 'potion' | 'material' | 'key';
  /** Potions: what they restore, as a fraction of the maximum. */
  effect?: { type: 'hp' | 'sp' | 'cleanse' | 'revive' | 'statReset' | 'expBoost'; pct?: number };
  price: number;
  sellPrice: number;
  /** Hero level at which the shop starts selling it (0 = not sold). */
  shopLevel: number;
  text: string;
}
