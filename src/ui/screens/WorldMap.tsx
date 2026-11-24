import { zones } from '../../data/content';
import type { GameApi } from '../api';
import { Panel } from '../kit';
import { hudStore, useHud } from '../store';

/** The six zones (PRD Section 11). Only Zone 1 has content in M2. */
const ZONES = [
  {
    id: 'meadowmere',
    name: 'Meadowmere Fields',
    levels: '1–12',
    boss: 'Queen Gelatina',
    bossId: 'queen_gelatina',
  },
  {
    id: 'hollowbone',
    name: 'Hollowbone Catacombs',
    levels: '12–25',
    boss: 'The Hollow Abbot',
    bossId: 'hollow_abbot',
    soon: 'M3',
  },
  {
    id: 'sunscar',
    name: 'Sunscar Dunes',
    levels: '25–40',
    boss: 'Gilded Scarab Rex',
    bossId: 'gilded_scarab_rex',
    soon: 'M3',
  },
  {
    id: 'frostfang',
    name: 'Frostfang Peaks',
    levels: '40–55',
    boss: 'Rimeclaw',
    bossId: 'rimeclaw',
    soon: 'M4',
  },
  {
    id: 'emberforge',
    name: 'Emberforge Caldera',
    levels: '55–70',
    boss: 'Ignar',
    bossId: 'ignar',
    soon: 'M4',
  },
  {
    id: 'abyssal',
    name: 'Abyssal Spire',
    levels: '70–85',
    boss: 'Malgrath',
    bossId: 'malgrath',
    soon: 'M4',
  },
];

export function WorldMap({ api }: { api: GameApi & { startBoss(): void } }) {
  useHud();
  const save = api.getSave();
  const sigils = save.hero.stacks.boss_sigil ?? 0;
  return (
    <Panel
      title="World Map"
      onClose={() => hudStore.set({ menu: null })}
      right={<span class="chip">Boss Sigils ×{sigils}</span>}
    >
      <div class="map">
        {ZONES.map((z, i) => {
          const live = zones.some((x) => x.id === z.id);
          const beaten = (save.progress.bossKills[z.bossId] ?? 0) > 0;
          return (
            <div class={`zone ${live ? '' : 'locked'}`}>
              <div class="zone-n">{i + 1}</div>
              <div class="zone-body">
                <b>{z.name}</b> <span class="dim small">Lv {z.levels}</span>
                {beaten && <span class="chip buff"> boss defeated</span>}
                <div class="small dim">Boss: {z.boss}</div>
                {live ? (
                  <div class="row left">
                    <button type="button" class="big primary" onClick={() => api.startAdventure()}>
                      Enter field
                    </button>
                    <button
                      type="button"
                      class="big"
                      disabled={sigils < 1}
                      onClick={() => api.startBoss()}
                    >
                      Fight boss (1 Sigil)
                    </button>
                  </div>
                ) : (
                  <div class="small dim">Coming in {z.soon}</div>
                )}
              </div>
            </div>
          );
        })}
        <div class="zone locked">
          <div class="zone-n">∞</div>
          <div class="zone-body">
            <b>Endless Tower</b>
            <div class="small dim">Unlocks after Boss 3 (coming in M3)</div>
          </div>
        </div>
        <div class="small dim">Normal difficulty. Nightmare unlocks after Boss 6.</div>
      </div>
    </Panel>
  );
}
