import { useState } from 'preact/hooks';
import { balance as b } from '../../data/schema';
import { classMap, skillMap, stackMap } from '../../data/content';
import { unmetReq, reqStats } from '../../sim/loadout';
import {
  bossOrderOf,
  buildOf,
  dormantOf,
  presetOf,
  setSkillSlot,
  slotCounts,
} from '../../sim/profile';
import { buildTitle } from '../buildTitle';
import type { GameApi } from '../api';
import { Panel, Tabs, Tile } from '../kit';
import { hudStore, useHud } from '../store';

type Filter = 'all' | 'active' | 'passive';

const POTIONS = [
  'minor_health',
  'greater_health',
  'grand_health',
  'minor_mana',
  'greater_mana',
  'grand_mana',
  'panacea',
];

/** Loadout: 6 active, 4 passive and 2 consumable slots, with dormant skills greyed and explained. */
export function Loadout({ api }: { api: GameApi }) {
  useHud();
  const save = api.getSave();
  const p = presetOf(save);
  const counts = slotCounts(b, save.progress, bossOrderOf());
  const dormant = new Set(dormantOf(save));
  const build = buildOf(save);
  const stats = reqStats(build);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [cls, setCls] = useState('all');
  const learned = Object.keys(save.hero.learned)
    .map((id) => skillMap.get(id)!)
    .filter(Boolean)
    .filter((s) =>
      filter === 'all' ? true : filter === 'passive' ? s.kind === 'passive' : s.kind !== 'passive',
    )
    .filter((s) => cls === 'all' || s.classId === cls);
  const classIds = [
    ...new Set(Object.keys(save.hero.learned).map((id) => skillMap.get(id)?.classId)),
  ].filter((x): x is string => !!x);
  const selDef = sel ? skillMap.get(sel) : undefined;

  const slotTile = (kind: 'active' | 'passive', i: number, id: string | null, limit: number) => {
    const def = id ? skillMap.get(id) : undefined;
    const locked = i >= limit;
    return (
      <div class="slot">
        <Tile
          label={locked ? '🔒' : def ? def.name.slice(0, 2).toUpperCase() : '+'}
          color={def ? classMap.get(def.classId)?.color : '#1c2440'}
          dim={locked || !def}
          selected={
            !!selDef && !locked && (kind === 'passive') === (selDef.kind === 'passive') && !def
          }
          onClick={() => {
            if (locked) return;
            if (selDef && (selDef.kind === 'passive') === (kind === 'passive')) {
              api.mutate((s) => void setSkillSlot(s, kind, i, selDef.id));
              setSel(null);
            } else if (def) api.mutate((s) => void setSkillSlot(s, kind, i, null));
          }}
        />
        <div class="small dim">{locked ? 'locked' : def ? def.name : 'empty'}</div>
      </div>
    );
  };

  const potionOptions = POTIONS.filter(
    (id) => (save.hero.stacks[id] ?? 0) > 0 || p.consumables.includes(id),
  );

  return (
    <Panel
      title={`Loadout · ${buildTitle(build)}`}
      onClose={() => hudStore.set({ menu: null })}
      right={<span class="dim small">Locked inside zones</span>}
    >
      <Tabs
        tabs={[
          { id: 'p1', label: 'Preset 1' },
          { id: 'p2', label: 'Preset 2 🔒', locked: true, hint: 'Unlocks after Boss 5' },
          { id: 'p3', label: 'Preset 3 🔒', locked: true, hint: 'Unlocks after Boss 6' },
        ]}
        value="p1"
        onChange={() => undefined}
      />
      <div class="cols">
        <div class="col">
          <h4>
            Active ({counts.active} of {b.loadout.actives})
          </h4>
          <div class="slots">
            {p.actives.map((id, i) => slotTile('active', i, id, counts.active))}
          </div>
          <h4>
            Passive ({counts.passive} of {b.loadout.passives})
          </h4>
          <div class="slots">
            {p.passives.map((id, i) => slotTile('passive', i, id, counts.passive))}
          </div>
          <h4>Consumables</h4>
          <div class="slots">
            {Array.from({ length: counts.consumable }, (_, i) => (
              <div class="slot">
                <select
                  value={p.consumables[i] ?? ''}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value || null;
                    api.mutate((s) => {
                      presetOf(s).consumables[i] = v;
                    });
                  }}
                >
                  <option value="">(empty)</option>
                  {potionOptions.map((id) => (
                    <option value={id}>
                      {stackMap.get(id)?.name} ×{save.hero.stacks[id] ?? 0}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div class="col wide">
          <div class="row left">
            {(['all', 'active', 'passive'] as Filter[]).map((f) => (
              <button type="button" class={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
            {classIds.length > 1 &&
              ['all', ...classIds].map((c) => (
                <button type="button" class={c === cls ? 'on' : ''} onClick={() => setCls(c)}>
                  {c === 'all' ? 'all classes' : (classMap.get(c)?.name ?? c)}
                </button>
              ))}
          </div>
          {learned.length === 0 && (
            <div class="dim">No skills yet. Learn some in the Guild Hall.</div>
          )}
          {learned.map((s) => {
            const isDormant = dormant.has(s.id);
            const placed = [...p.actives, ...p.passives].includes(s.id);
            return (
              <div
                class={`lo-row ${isDormant ? 'dormant' : ''} ${sel === s.id ? 'sel' : ''}`}
                onClick={() => !isDormant && setSel(sel === s.id ? null : s.id)}
              >
                <Tile
                  label={s.name.slice(0, 2).toUpperCase()}
                  color={classMap.get(s.classId)?.color}
                  dim={isDormant}
                  selected={sel === s.id}
                  badge={`r${save.hero.learned[s.id]}`}
                />
                <div class="lo-name">
                  <b>{s.name}</b> <span class="dim small">{s.kind}</span>
                  {placed && <span class="chip buff"> equipped</span>}
                  {isDormant && (
                    <div class="small bad">
                      Dormant: needs{' '}
                      {unmetReq(s.req, stats)
                        .map((m) => `${m.stat} ${m.need} (you have ${m.have})`)
                        .join(', ')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {selDef && (
            <div class="note">
              Tap a {selDef.kind === 'passive' ? 'passive' : 'active'} slot to place {selDef.name}.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
