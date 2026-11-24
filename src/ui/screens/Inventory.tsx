import { useState } from 'preact/hooks';
import { balance as b } from '../../data/schema';
import { itemMap, stackMap } from '../../data/content';
import type { EquipSlot, ItemInstance } from '../../data/types';
import { sellValue } from '../../sim/items';
import {
  bagItems,
  claimOverflow,
  equipFromBag,
  equippedUids,
  presetOf,
  sellItem,
  unequipToBag,
} from '../../sim/profile';
import type { GameApi } from '../api';
import { defOf, gold } from '../itemText';
import { ItemCard, ItemTile, Panel, Tile, useFlash } from '../kit';
import { hudStore, useHud } from '../store';

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  offhand: 'Off-hand',
  head: 'Head',
  armor: 'Armor',
  garment: 'Garment',
  shoes: 'Shoes',
  acc1: 'Ring 1',
  acc2: 'Ring 2',
};
const SLOTS = Object.keys(SLOT_LABEL) as EquipSlot[];
const ORDER = { legendary: 0, epic: 1, rare: 2, fine: 3, common: 4 };

type Sort = 'rarity' | 'tier' | 'slot';

/** Inventory: paper doll, bag grid, tooltips that compare, sort, filter, lock and multi-sell. */
export function Inventory({ api }: { api: GameApi }) {
  useHud();
  const save = api.getSave();
  const p = presetOf(save);
  const [sel, setSel] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('rarity');
  const [filter, setFilter] = useState<string>('all');
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, flash] = useFlash();
  const owned = new Map(save.hero.inventory.map((i) => [i.uid, i]));
  const equippedUid = equippedUids(save);
  let bag = bagItems(save);
  if (filter !== 'all') bag = bag.filter((i) => defOf(i)?.slot === filter);
  bag = [...bag].sort((a, c) => {
    const da = defOf(a)!;
    const dc = defOf(c)!;
    if (sort === 'tier') return dc.tier - da.tier || ORDER[a.rarity] - ORDER[c.rarity];
    if (sort === 'slot') return da.slot.localeCompare(dc.slot) || dc.tier - da.tier;
    return ORDER[a.rarity] - ORDER[c.rarity] || dc.tier - da.tier;
  });
  const selected = sel ? owned.get(sel) : undefined;
  const selDef = selected ? defOf(selected) : undefined;
  const slotOfSel = (): EquipSlot | undefined =>
    selDef ? (selDef.slot === 'accessory' ? 'acc1' : (selDef.slot as EquipSlot)) : undefined;
  const equippedInSlot = (): ItemInstance | null => {
    const sl = slotOfSel();
    const uid = sl ? p.equipment[sl] : undefined;
    return uid ? (owned.get(uid) ?? null) : null;
  };
  const isEquipped = !!selected && equippedUid.has(selected.uid);
  const overflowN = save.hero.overflow.length;

  const afterChange = (removedSkills: string[]) => {
    if (removedSkills.length)
      flash(`${removedSkills.length} skill(s) unequipped: requirement no longer met`);
  };

  const equip = (slot?: EquipSlot) => {
    if (!selected) return;
    let reason = '';
    let dormant: string[] = [];
    api.mutate((s) => {
      const before = [...presetOf(s).actives, ...presetOf(s).passives].filter(Boolean).length;
      const r = equipFromBag(s, selected.uid, undefined, slot);
      if (!r.ok)
        reason =
          r.reason === 'level'
            ? 'Level too low'
            : r.reason === 'twoHanded'
              ? 'Two-handed weapon equipped'
              : 'Cannot equip';
      const after = [...presetOf(s).actives, ...presetOf(s).passives].filter(Boolean).length;
      dormant = Array(Math.max(0, before - after)).fill('x');
    });
    if (reason) flash(reason);
    else afterChange(dormant);
    setSel(null);
  };

  const sellPicked = () => {
    let total = 0;
    api.mutate((s) => {
      for (const uid of picked) total += sellItem(s, uid);
    });
    flash(total > 0 ? `Sold for ${gold(total)} gold` : 'Nothing sold (locked items are kept)');
    setPicked(new Set());
  };
  const pickedValue = [...picked].reduce((sum, uid) => {
    const i = owned.get(uid);
    const d = i && defOf(i);
    return sum + (i && d && !i.locked ? sellValue(b, d, i) : 0);
  }, 0);

  const stacks = Object.entries(save.hero.stacks).filter(([, n]) => n > 0);

  return (
    <Panel
      title="Inventory"
      onClose={() => hudStore.set({ menu: null })}
      right={<span class="chip">{gold(save.hero.gold)} g</span>}
    >
      <div class="cols">
        <div class="col">
          <h4>Equipped</h4>
          <div class="doll">
            {SLOTS.map((sl) => {
              const uid = p.equipment[sl];
              const inst = uid ? owned.get(uid) : undefined;
              return (
                <div class="slot">
                  {inst ? (
                    <ItemTile
                      inst={inst}
                      selected={sel === inst.uid}
                      onClick={() => setSel(inst.uid)}
                    />
                  ) : (
                    <Tile label="·" color="#1c2440" dim />
                  )}
                  <div class="small dim">{SLOT_LABEL[sl]}</div>
                </div>
              );
            })}
          </div>
          <h4>Items</h4>
          <div class="small">
            {stacks.length === 0 && <span class="dim">No potions or materials.</span>}
            {stacks.map(([id, n]) => (
              <span class="chip">
                {stackMap.get(id)?.name ?? id} ×{n}
              </span>
            ))}
          </div>
        </div>
        <div class="col wide">
          <div class="row left">
            <span class="small dim">
              Bag {bagItems(save).length}/{save.hero.bagSize}
            </span>
            {(['rarity', 'tier', 'slot'] as Sort[]).map((s) => (
              <button type="button" class={s === sort ? 'on' : ''} onClick={() => setSort(s)}>
                {s}
              </button>
            ))}
            <select
              value={filter}
              onChange={(e) => setFilter((e.target as HTMLSelectElement).value)}
            >
              <option value="all">all slots</option>
              {['weapon', 'offhand', 'head', 'armor', 'garment', 'shoes', 'accessory'].map((s) => (
                <option value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              class={multi ? 'on' : ''}
              onClick={() => {
                setMulti(!multi);
                setPicked(new Set());
              }}
            >
              multi-sell
            </button>
          </div>
          {overflowN > 0 && (
            <div class="note">
              Overflow box: {overflowN} item(s).{' '}
              <button
                type="button"
                onClick={() => {
                  let n = 0;
                  api.mutate((s) => void (n = claimOverflow(s)));
                  flash(n ? `Claimed ${n}` : 'Bag is full');
                }}
              >
                Claim
              </button>
            </div>
          )}
          <div class="bag">
            {bag.map((i) => (
              <ItemTile
                inst={i}
                selected={multi ? picked.has(i.uid) : sel === i.uid}
                badge={i.locked ? '🔒' : undefined}
                onClick={() => {
                  if (multi) {
                    const n = new Set(picked);
                    if (n.has(i.uid)) n.delete(i.uid);
                    else n.add(i.uid);
                    setPicked(n);
                  } else setSel(i.uid);
                }}
              />
            ))}
            {bag.length === 0 && <div class="dim">Nothing here yet. Drops land in your bag.</div>}
          </div>
          {multi && (
            <div class="row left">
              <button
                type="button"
                class="big primary"
                disabled={picked.size === 0}
                onClick={sellPicked}
              >
                Sell {picked.size} · {gold(pickedValue)}g
              </button>
            </div>
          )}
        </div>
        <div class="col">
          {!multi && selected && selDef ? (
            <ItemCard
              inst={selected}
              equipped={isEquipped ? null : equippedInSlot()}
              level={save.hero.level}
            >
              <div class="row left">
                {isEquipped ? (
                  <button
                    type="button"
                    class="big"
                    onClick={() => {
                      const slot = SLOTS.find((s) => p.equipment[s] === selected.uid)!;
                      let ok = false;
                      api.mutate((s) => void (ok = unequipToBag(s, slot)));
                      flash(ok ? 'Unequipped' : 'Bag is full');
                      setSel(null);
                    }}
                  >
                    Unequip
                  </button>
                ) : (
                  <>
                    <button type="button" class="big primary" onClick={() => equip()}>
                      Equip
                    </button>
                    {selDef.slot === 'accessory' && (
                      <button type="button" class="big" onClick={() => equip('acc2')}>
                        Ring 2
                      </button>
                    )}
                    <button
                      type="button"
                      class="big"
                      onClick={() => {
                        api.mutate(() => void (selected.locked = !selected.locked));
                      }}
                    >
                      {selected.locked ? 'Unlock' : 'Lock'}
                    </button>
                    <button
                      type="button"
                      class="big warn"
                      disabled={selected.locked}
                      onClick={() => {
                        let g = 0;
                        api.mutate((s) => void (g = sellItem(s, selected.uid)));
                        flash(`Sold for ${gold(g)} gold`);
                        setSel(null);
                      }}
                    >
                      Sell · {gold(sellValue(b, itemMap.get(selected.defId)!, selected))}g
                    </button>
                  </>
                )}
              </div>
            </ItemCard>
          ) : (
            <div class="dim">
              {multi ? 'Tap items to select them for selling.' : 'Tap an item.'}
            </div>
          )}
        </div>
      </div>
      {msg && <div class="flash">{msg}</div>}
    </Panel>
  );
}
