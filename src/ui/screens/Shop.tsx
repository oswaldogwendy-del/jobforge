import { useState } from 'preact/hooks';
import { balance as b } from '../../data/schema';
import { stacks as allStacks } from '../../data/content';
import { sellValue } from '../../sim/items';
import {
  bagExpansionCost,
  bagItems,
  buyStack,
  expandBag,
  oracleCost,
  oracleReset,
  sellItem,
  sellStack,
} from '../../sim/profile';
import type { GameApi } from '../api';
import { defOf, gold, itemTitle } from '../itemText';
import { Confirm, ItemTile, Panel, Tabs, useFlash } from '../kit';
import { hudStore, useHud } from '../store';

type Tab = 'buy' | 'sell';

export function Shop({ api }: { api: GameApi }) {
  useHud();
  const save = api.getSave();
  const [tab, setTab] = useState<Tab>('buy');
  const [msg, flash] = useFlash();
  const sold = bagItems(save).filter((i) => !i.locked);
  const stackRows = allStacks.filter((s) => s.shopLevel > 0 && save.hero.level >= s.shopLevel);
  const lockedRows = allStacks.filter((s) => s.shopLevel > 0 && save.hero.level < s.shopLevel);
  const expCost = bagExpansionCost(b, save.hero.bagSize);

  return (
    <Panel
      title="Shop"
      onClose={() => hudStore.set({ menu: null })}
      right={<span class="chip">{gold(save.hero.gold)} g</span>}
    >
      <Tabs
        tabs={[
          { id: 'buy' as Tab, label: 'Buy' },
          { id: 'sell' as Tab, label: 'Sell' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'buy' ? (
        <div class="list">
          {stackRows.map((s) => (
            <div class="shop-row">
              <div>
                <b>{s.name}</b> <span class="dim small">have {save.hero.stacks[s.id] ?? 0}</span>
                <div class="small dim">{s.text}</div>
              </div>
              <div class="row">
                {[1, 5].map((n) => (
                  <button
                    type="button"
                    class="buy"
                    disabled={save.hero.gold < s.price * n}
                    onClick={() => {
                      api.mutate((x) => void buyStack(x, s.id, n));
                    }}
                  >
                    ×{n} · {gold(s.price * n)}g
                  </button>
                ))}
              </div>
            </div>
          ))}
          {lockedRows.map((s) => (
            <div class="shop-row dim">
              <div>
                <b>{s.name}</b>
                <div class="small">Sold from level {s.shopLevel}</div>
              </div>
            </div>
          ))}
          <div class="shop-row">
            <div>
              <b>Bag expansion</b>{' '}
              <span class="dim small">
                +{b.items.bag.step} slots ({save.hero.bagSize} now)
              </span>
            </div>
            {expCost === null ? (
              <span class="dim">Maximum</span>
            ) : (
              <button
                type="button"
                class="buy"
                disabled={save.hero.gold < expCost}
                onClick={() => {
                  api.mutate((x) => void expandBag(x));
                  flash('Bag expanded');
                }}
              >
                {gold(expCost)}g
              </button>
            )}
          </div>
        </div>
      ) : (
        <div class="list">
          {Object.entries(save.hero.stacks)
            .filter(([id, n]) => n > 0 && (allStacks.find((s) => s.id === id)?.sellPrice ?? 0) > 0)
            .map(([id, n]) => {
              const d = allStacks.find((s) => s.id === id)!;
              return (
                <div class="shop-row">
                  <div>
                    <b>{d.name}</b> <span class="dim small">×{n}</span>
                  </div>
                  <div class="row">
                    <button
                      type="button"
                      class="buy"
                      onClick={() => api.mutate((x) => void sellStack(x, id, 1))}
                    >
                      Sell 1 · {d.sellPrice}g
                    </button>
                    <button
                      type="button"
                      class="buy"
                      onClick={() => api.mutate((x) => void sellStack(x, id, n))}
                    >
                      All · {gold(d.sellPrice * n)}g
                    </button>
                  </div>
                </div>
              );
            })}
          {sold.map((i) => (
            <div class="shop-row">
              <div class="row left">
                <ItemTile inst={i} />
                <span>{itemTitle(defOf(i)!, i)}</span>
              </div>
              <button
                type="button"
                class="buy"
                onClick={() => {
                  api.mutate((x) => void sellItem(x, i.uid));
                }}
              >
                Sell · {gold(sellValue(b, defOf(i)!, i))}g
              </button>
            </div>
          ))}
          {sold.length === 0 && (
            <div class="dim">No items to sell (locked and equipped items are kept).</div>
          )}
        </div>
      )}
      {msg && <div class="flash">{msg}</div>}
    </Panel>
  );
}

export function Oracle({ api }: { api: GameApi }) {
  useHud();
  const save = api.getSave();
  const cost = oracleCost(b, save.hero.level);
  const draughts = save.hero.stacks.oblivion_draught ?? 0;
  const [confirm, setConfirm] = useState<'gold' | 'draught' | null>(null);
  const [msg, flash] = useFlash(3500);
  const run = (draught: boolean) => {
    let removed: string[] = [];
    api.mutate((s) => {
      const r = oracleReset(s, undefined, draught);
      if (r.ok) removed = r.unequipped;
    });
    setConfirm(null);
    flash(
      removed.length
        ? `Stats reset. ${removed.length} skill(s) unequipped: requirement no longer met.`
        : 'Stats reset. All points are free to spend in Status.',
    );
  };
  return (
    <Panel
      title="Oracle"
      onClose={() => hudStore.set({ menu: null })}
      right={<span class="chip">{gold(save.hero.gold)} g</span>}
    >
      <div class="locked-class">
        <p>
          The Oracle refunds every stat point so you can spend them again. Skills whose requirement
          fails afterwards are unequipped, but you keep them.
        </p>
        <p>
          Cost: <b>{cost === 0 ? 'free (up to level 20)' : `${gold(cost)} gold`}</b>
        </p>
        <div class="row">
          <button
            type="button"
            class="big primary"
            disabled={save.hero.gold < cost}
            onClick={() => setConfirm('gold')}
          >
            Reset stats
          </button>
          <button
            type="button"
            class="big"
            disabled={draughts < 1}
            onClick={() => setConfirm('draught')}
          >
            Use Oblivion Draught (×{draughts})
          </button>
        </div>
      </div>
      {msg && <div class="flash">{msg}</div>}
      {confirm && (
        <Confirm
          title="Reset all stat points?"
          yes="Reset"
          body={
            confirm === 'draught'
              ? 'One Oblivion Draught is used. No gold is spent.'
              : cost === 0
                ? 'This is free.'
                : `This costs ${gold(cost)} gold.`
          }
          onNo={() => setConfirm(null)}
          onYes={() => run(confirm === 'draught')}
        />
      )}
    </Panel>
  );
}
