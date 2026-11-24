import { balance } from '../data/schema';
import { itemMap } from '../data/content';
import type { ItemDef, ItemInstance, Rarity, Stat } from '../data/types';
import { STAT_IDS } from '../data/types';
import { itemBase, itemStats } from '../sim/items';

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#e8e8e8',
  fine: '#7be07b',
  rare: '#6aa8ff',
  epic: '#c07bff',
  legendary: '#ffa43a',
};

const ABBR: Record<string, string> = {
  sword: 'SW',
  greataxe: 'AX',
  dagger: 'DG',
  mace: 'MC',
  knuckle: 'KN',
  staff: 'ST',
  bow: 'BW',
  gun: 'GN',
  shield: 'SH',
  tome: 'TM',
  helm: 'HM',
  hat: 'HT',
  plate: 'PL',
  leather: 'LT',
  robe: 'RB',
  cloak: 'CK',
  boots: 'BT',
  ring: 'RG',
};
export const abbrOf = (def: ItemDef): string => ABBR[def.type] ?? '??';

export const itemTitle = (def: ItemDef, inst: ItemInstance): string =>
  `${def.name}${inst.refine > 0 ? ` +${inst.refine}` : ''}`;

export const defOf = (inst: ItemInstance): ItemDef | undefined => itemMap.get(inst.defId);

/** Every number an item gives, keyed by label, for tooltips and comparison. */
export function statMap(def: ItemDef, inst: ItemInstance): Record<string, number> {
  const base = itemBase(balance, def, inst);
  const out: Record<string, number> = {};
  const put = (k: string, v: number | undefined) => {
    if (v) out[k] = v;
  };
  put('ATK', base.atk && Math.round(base.atk * 10) / 10);
  put('MATK', base.matk && Math.round(base.matk * 10) / 10);
  put('DEF', base.def && Math.round(base.def * 10) / 10);
  put('MDEF', base.mdef && Math.round(base.mdef * 10) / 10);
  put('FLEE', base.flee);
  put('Max HP %', base.maxHpPct && Math.round(base.maxHpPct * 100));
  put('Max SP %', base.maxSpPct && Math.round(base.maxSpPct * 100));
  put('Move speed %', base.moveSpeedPct && Math.round(base.moveSpeedPct * 100));
  const st = itemStats(def, inst);
  for (const k of STAT_IDS) put(k, st[k as Stat]);
  return out;
}

export interface Line {
  label: string;
  value: number;
  /** Difference against the equipped item, when comparing. */
  diff?: number;
}

/** Lines for a tooltip, with the difference against what is equipped in that slot. */
export function describe(
  def: ItemDef,
  inst: ItemInstance,
  equipped?: { def: ItemDef; inst: ItemInstance },
): Line[] {
  const mine = statMap(def, inst);
  const theirs = equipped ? statMap(equipped.def, equipped.inst) : {};
  const labels = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  return [...labels].map((label) => ({
    label,
    value: mine[label] ?? 0,
    diff: equipped ? (mine[label] ?? 0) - (theirs[label] ?? 0) : undefined,
  }));
}

export const fmtNum = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString();

export const gold = (n: number): string => n.toLocaleString('en-US');
