import { useState } from 'preact/hooks';
import { balance as b } from '../../data/schema';
import { STAT_IDS, type Stat } from '../../data/types';
import { canRaiseStat, nextStatCost, templateStats, type Template } from '../../sim/profile';
import type { StatBlockSave } from '../../save/types';
import type { GameApi } from '../api';
import { Tile } from '../kit';

const LOOKS = [
  { id: 'knight', name: 'Knight' },
  { id: 'mage', name: 'Mage' },
  { id: 'rogue', name: 'Rogue' },
  { id: 'rogue_hooded', name: 'Hooded' },
  { id: 'barbarian', name: 'Barbarian' },
];
const WEAPONS: { id: string; name: string; soon?: boolean }[] = [
  { id: 'sword', name: 'Sword' },
  { id: 'staff', name: 'Staff' },
  { id: 'bow', name: 'Bow', soon: true },
  { id: 'dagger', name: 'Dagger', soon: true },
  { id: 'mace', name: 'Mace', soon: true },
];
const TEMPLATES: { id: Template; name: string; hint: string }[] = [
  { id: 'warrior', name: 'Warrior', hint: 'STR and VIT' },
  { id: 'caster', name: 'Caster', hint: 'INT and DEX' },
  { id: 'rogue', name: 'Rogue', hint: 'AGI and LUK' },
  { id: 'custom', name: 'Custom', hint: 'You choose' },
];

export function Create({ api, slot }: { api: GameApi; slot: number }) {
  const [look, setLook] = useState('knight');
  const [name, setName] = useState('');
  const [weapon, setWeapon] = useState<'sword' | 'staff'>('sword');
  const [template, setTemplate] = useState<Template>('warrior');
  const [custom, setCustom] = useState<StatBlockSave>(
    templateStats(b, 'custom', b.stats.startPoints),
  );
  const [free, setFree] = useState(b.stats.startPoints);
  const stats = template === 'custom' ? custom : templateStats(b, template, b.stats.startPoints);
  const left =
    template === 'custom'
      ? free
      : b.stats.startPoints -
        STAT_IDS.reduce((s, k) => {
          let c = 0;
          for (let n = 1; n < stats[k]; n++)
            c += Math.floor((n - 1) / b.stats.costDiv) + b.stats.costBase;
          return s + c;
        }, 0);
  const preset = {
    stats: custom,
    statPointsFree: free,
    actives: [],
    passives: [],
    consumables: [],
    equipment: {},
  };

  return (
    <div class="create">
      <div class="create-card">
        <h2>New hero</h2>
        <div class="create-body scroll">
          <div class="cols">
            <div class="col">
              <h4>Look</h4>
              <div class="row left">
                {LOOKS.map((l) => (
                  <button
                    type="button"
                    class={`opt ${look === l.id ? 'on' : ''}`}
                    onClick={() => {
                      setLook(l.id);
                      api.previewHero(l.id, weapon);
                    }}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              <h4>Name</h4>
              <input
                class="name-input"
                maxLength={16}
                value={name}
                placeholder="Hero"
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
              />
              <h4>Starter weapon</h4>
              <div class="row left">
                {WEAPONS.map((w) => (
                  <button
                    type="button"
                    disabled={w.soon}
                    class={`opt ${weapon === w.id ? 'on' : ''}`}
                    title={w.soon ? 'Unlocks with its class in M3' : ''}
                    onClick={() => {
                      setWeapon(w.id as 'sword' | 'staff');
                      api.previewHero(look, w.id as 'sword' | 'staff');
                    }}
                  >
                    {w.name}
                    {w.soon ? ' (M3)' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div class="col">
              <h4>Stats · {left} points left</h4>
              <div class="row left">
                {TEMPLATES.map((t) => (
                  <button
                    type="button"
                    class={`opt ${template === t.id ? 'on' : ''}`}
                    title={t.hint}
                    onClick={() => {
                      setTemplate(t.id);
                      if (t.id !== 'custom') return;
                      setCustom(templateStats(b, 'custom', b.stats.startPoints));
                      setFree(b.stats.startPoints);
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <div class="stat-grid">
                {STAT_IDS.map((k: Stat) => (
                  <div class="stat-row">
                    <b>{k}</b>
                    <span class="sr-val">{stats[k]}</span>
                    {template === 'custom' && (
                      <>
                        <button
                          type="button"
                          class="plus"
                          disabled={!canRaiseStat(b, preset, k)}
                          onClick={() => {
                            const cost = nextStatCost(b, preset, k);
                            setCustom({ ...custom, [k]: custom[k] + 1 });
                            setFree(free - cost);
                          }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          class="plus"
                          disabled={custom[k] <= 1}
                          onClick={() => {
                            const back =
                              Math.floor((custom[k] - 2) / b.stats.costDiv) + b.stats.costBase;
                            setCustom({ ...custom, [k]: custom[k] - 1 });
                            setFree(free + back);
                          }}
                        >
                          −
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div class="dim small">
                You start with a Worn {weapon === 'staff' ? 'Staff' : 'Sword'}, light armor, 200
                gold and 5 potions.
              </div>
            </div>
          </div>
        </div>
        <div class="row">
          <button
            type="button"
            class="big primary"
            onClick={() =>
              void api.createHero(slot, {
                name: name || 'Hero',
                look,
                weapon,
                template,
                stats: template === 'custom' ? custom : undefined,
              })
            }
          >
            Start
          </button>
          <button type="button" class="big" onClick={() => api.toTitle()}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export const _tile = Tile;
