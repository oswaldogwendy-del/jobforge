import { useState } from 'preact/hooks';
import { balance as b } from '../../data/schema';
import { skills as allSkills } from '../../data/content';
import { STAT_IDS, type Stat } from '../../data/types';
import { reqMet, unmetReq } from '../../sim/loadout';
import { previewStats } from '../../sim/preview';
import { buildOf, canRaiseStat, nextStatCost, presetOf, raiseStat } from '../../sim/profile';
import type { PresetData } from '../../save/types';
import type { GameApi } from '../api';
import { fmtNum } from '../itemText';
import { Panel } from '../kit';
import { hudStore, useHud } from '../store';

const STAT_NAMES: Record<Stat, string> = {
  STR: 'Strength',
  AGI: 'Agility',
  VIT: 'Vitality',
  INT: 'Intellect',
  DEX: 'Dexterity',
  LUK: 'Luck',
};
const STAT_HINT: Record<Stat, string> = {
  STR: 'ATK, carry',
  AGI: 'Attack speed, FLEE',
  VIT: 'Max HP, DEF, regen',
  INT: 'MATK, Max SP, MDEF',
  DEX: 'HIT, cast speed, MATK',
  LUK: 'Crit, dodge, loot',
};

/** The Status window: spend stat points with a pending preview, then Confirm or Undo. */
export function Status({ api }: { api: GameApi }) {
  useHud();
  const save = api.getSave();
  const live = presetOf(save);
  const [draft, setDraft] = useState<PresetData>(() => structuredClone(live));
  const dirty = STAT_IDS.some((k) => draft.stats[k] !== live.stats[k]);
  const baseBuild = buildOf(save);
  const draftBuild = { ...baseBuild, stats: { ...draft.stats } };
  const before = previewStats(b, baseBuild);
  const after = previewStats(b, draftBuild);

  const rows: { label: string; a: number; v: number; unit?: string; dec?: boolean }[] = [
    { label: 'Max HP', a: before.maxHp, v: after.maxHp },
    { label: 'Max SP', a: before.maxSp, v: after.maxSp },
    { label: 'ATK', a: before.atk, v: after.atk },
    {
      label: 'MATK',
      a: (before.matkMin + before.matkMax) / 2,
      v: (after.matkMin + after.matkMax) / 2,
    },
    { label: 'DEF', a: before.def, v: after.def },
    { label: 'MDEF', a: before.mdef, v: after.mdef },
    { label: 'HIT', a: before.hit, v: after.hit },
    { label: 'FLEE', a: before.flee, v: after.flee },
    { label: 'Crit %', a: before.critPct, v: after.critPct },
    { label: 'Attacks/s', a: before.aps, v: after.aps, dec: true },
    { label: 'Cast time ×', a: before.castMult, v: after.castMult, dec: true },
  ];

  // Unlocks: skills whose requirement the pending points newly satisfy, then the nearest ones.
  const nowStats = { ...baseBuild.stats };
  for (const k of STAT_IDS) nowStats[k] += baseBuild.gear?.stats[k] ?? 0;
  const draftStats = { ...draft.stats };
  for (const k of STAT_IDS) draftStats[k] += baseBuild.gear?.stats[k] ?? 0;
  const unlocks = allSkills
    .filter((s) => !save.hero.learned[s.id])
    .map((s) => ({
      s,
      was: reqMet(s.req, nowStats),
      now: reqMet(s.req, draftStats),
      miss: unmetReq(s.req, draftStats),
    }))
    .filter((u) => u.now || u.miss.every((m) => m.need - m.have <= 10))
    .sort((a, c) => Number(c.now) - Number(a.now) || a.s.tier - c.s.tier)
    .slice(0, 8);

  const confirm = () => {
    api.mutate((s) => {
      const p = presetOf(s);
      p.stats = { ...draft.stats };
      p.statPointsFree = draft.statPointsFree;
    });
  };

  return (
    <Panel
      title={`Status · ${save.hero.name} Lv ${save.hero.level}`}
      onClose={() => hudStore.set({ menu: null })}
      right={
        <>
          <span class="chip buff">
            {draft.statPointsFree} point{draft.statPointsFree === 1 ? '' : 's'}
          </span>
          <button type="button" class="on" disabled={!dirty} onClick={confirm}>
            Confirm
          </button>
          <button type="button" disabled={!dirty} onClick={() => setDraft(structuredClone(live))}>
            Undo
          </button>
        </>
      }
    >
      <div class="cols">
        <div class="col">
          {STAT_IDS.map((k) => {
            const raised = draft.stats[k] - live.stats[k];
            const can = canRaiseStat(b, draft, k);
            return (
              <div class="stat-row">
                <div class="sr-name">
                  <b>{k}</b> <span class="dim small">{STAT_NAMES[k]}</span>
                  <div class="dim small">{STAT_HINT[k]}</div>
                </div>
                <div class="sr-val">
                  {draft.stats[k]}
                  {raised > 0 && <i class="up"> +{raised}</i>}
                </div>
                <button
                  type="button"
                  class="plus"
                  disabled={!can}
                  onClick={() => {
                    const d = structuredClone(draft);
                    raiseStat(b, d, k);
                    setDraft(d);
                  }}
                >
                  + <small>{nextStatCost(b, draft, k)}</small>
                </button>
              </div>
            );
          })}
        </div>
        <div class="col">
          <h4>Stats (before passives and buffs)</h4>
          {rows.map((r) => {
            const d = r.v - r.a;
            const good = r.dec ? d < 0 : d > 0;
            return (
              <div class="ic-line">
                <span>{r.label}</span>
                <span>
                  {fmtNum(Math.round(r.v * 100) / 100)}
                  {Math.abs(d) > 0.001 && (
                    <i class={good ? 'up' : 'down'}>
                      {' '}
                      ({d > 0 ? '+' : ''}
                      {fmtNum(Math.round(d * 100) / 100)})
                    </i>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div class="col">
          <h4>Unlocks</h4>
          {unlocks.length === 0 && <div class="dim small">Nothing near. Keep levelling.</div>}
          {unlocks.map((u) => (
            <div class={`unlock ${u.now ? 'met' : ''}`}>
              <b>{u.s.name}</b> <span class="dim small">T{u.s.tier}</span>
              {u.now && !u.was && <span class="chip buff"> new!</span>}
              <div class="small">
                {u.now ? (
                  <span class="ok">Requirement met</span>
                ) : (
                  u.miss.map((m) => (
                    <span class="bad">
                      {' '}
                      {m.stat} {m.have}/{m.need}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
