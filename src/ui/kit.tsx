import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ItemDef, ItemInstance, Rarity } from '../data/types';
import { abbrOf, defOf, describe, fmtNum, itemTitle, RARITY_COLOR } from './itemText';
import { hudStore, useHud } from './store';

// Shared pieces for the town menus: a panel with a header, tabs, icon tiles and the item tooltip.

export function Panel(props: {
  title: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
  right?: ComponentChildren;
  cls?: string;
}) {
  return (
    <div class={`modal panel ${props.cls ?? ''}`}>
      <div class="panel-head">
        <b class="panel-title">{props.title}</b>
        <span class="panel-right">{props.right}</span>
        <button type="button" class="close-btn" onClick={props.onClose}>
          Done
        </button>
      </div>
      <div class="scroll panel-body">{props.children}</div>
    </div>
  );
}

export function Tabs<T extends string>(props: {
  tabs: { id: T; label: string; locked?: boolean; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div class="tabs scroll-x">
      {props.tabs.map((t) => (
        <button
          type="button"
          class={`tab ${t.id === props.value ? 'on' : ''} ${t.locked ? 'locked' : ''}`}
          onClick={() => props.onChange(t.id)}
          title={t.hint}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A drawn icon tile: the repo has no icon art, so this is a coloured square with a short label. */
export function Tile(props: {
  label: string;
  color?: string;
  border?: string;
  size?: number;
  badge?: string | number;
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const size = props.size ?? 46;
  return (
    <button
      type="button"
      class={`tile ${props.dim ? 'dim' : ''} ${props.selected ? 'sel' : ''}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: props.color ?? '#2a3558',
        borderColor: props.border ?? 'rgba(255,255,255,0.4)',
      }}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      {props.badge !== undefined && <i class="tile-badge">{props.badge}</i>}
    </button>
  );
}

export function ItemTile(props: {
  inst: ItemInstance;
  selected?: boolean;
  badge?: string | number;
  onClick?: () => void;
}) {
  const def = defOf(props.inst);
  if (!def) return null;
  return (
    <Tile
      label={abbrOf(def)}
      border={RARITY_COLOR[props.inst.rarity]}
      color="#27304f"
      selected={props.selected}
      badge={props.badge ?? (props.inst.refine > 0 ? `+${props.inst.refine}` : undefined)}
      onClick={props.onClick}
    />
  );
}

export function RarityName(props: { rarity: Rarity; children: ComponentChildren }) {
  return <span style={{ color: RARITY_COLOR[props.rarity] }}>{props.children}</span>;
}

/** Item details. When `equipped` is given the numbers show green and red differences. */
export function ItemCard(props: {
  inst: ItemInstance;
  equipped?: ItemInstance | null;
  level?: number;
  children?: ComponentChildren;
}) {
  const def = defOf(props.inst);
  if (!def) return null;
  const eqDef = props.equipped ? defOf(props.equipped) : undefined;
  const lines = describe(
    def,
    props.inst,
    eqDef && props.equipped ? { def: eqDef, inst: props.equipped } : undefined,
  );
  const tooLow = props.level !== undefined && props.level < def.levelReq;
  return (
    <div class="item-card" style={{ borderColor: RARITY_COLOR[props.inst.rarity] }}>
      <div class="ic-head">
        <RarityName rarity={props.inst.rarity}>{itemTitle(def, props.inst)}</RarityName>
        <span class="dim small">
          {props.inst.rarity} {def.type}
        </span>
      </div>
      <div class={`small ${tooLow ? 'bad' : 'dim'}`}>Requires level {def.levelReq}</div>
      {lines.map((l) => (
        <div class="ic-line">
          <span>{l.label}</span>
          <span>
            {fmtNum(l.value)}
            {l.diff !== undefined && l.diff !== 0 && (
              <i class={l.diff > 0 ? 'up' : 'down'}>
                {' '}
                ({l.diff > 0 ? '+' : ''}
                {fmtNum(l.diff)})
              </i>
            )}
          </span>
        </div>
      ))}
      {props.inst.slots.length > 0 && (
        <div class="small dim">Card slots: {props.inst.slots.length} (cards arrive in M3)</div>
      )}
      {def.legendary && <div class="small legend">{def.legendary.text}</div>}
      {props.children}
    </div>
  );
}

/** A confirmation dialog layered over a panel. */
export function Confirm(props: {
  title: string;
  body: ComponentChildren;
  yes: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div class="confirm">
      <div class="confirm-card">
        <h3>{props.title}</h3>
        <div>{props.body}</div>
        <div class="row">
          <button type="button" class="big primary" onClick={props.onYes}>
            {props.yes}
          </button>
          <button type="button" class="big" onClick={props.onNo}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function useMenu(): [
  string | null,
  (m: Parameters<typeof hudStore.set>[0]['menu']) => void,
] {
  const h = useHud();
  return [h.menu, (m) => hudStore.set({ menu: m })];
}

/** A value that follows another with a short delay, used for transient hints. */
export function useFlash(ms = 1800): [string | null, (t: string) => void] {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const id = setTimeout(() => setText(null), ms);
    return () => clearTimeout(id);
  }, [text, ms]);
  return [text, setText];
}

export type { ItemDef };
