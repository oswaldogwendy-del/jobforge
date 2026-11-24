import { useState } from 'preact/hooks';
import { balance } from '../data/schema';
import { classes, skillMap, skills } from '../data/content';
import { STAT_IDS, type SkillDef } from '../data/types';
import {
  canLearn,
  dormantSkills,
  learn,
  rankUp,
  reqMet,
  reqStats,
  skillPointsSpent,
  skillPointsTotal,
  unequipDormant,
  unmetReq,
  type HeroBuild,
} from '../sim/loadout';
import { costToReach, pointsSpent, statCost, totalPoints } from '../sim/stats';
import type { GameApi } from './api';

const WEAPONS = ['sword', 'greataxe', 'dagger', 'staff'] as const;
const REASON: Record<string, string> = {
  trainer: 'trainer locked',
  requirement: 'stats too low',
  tier: 'learn a lower tier first',
  gold: 'not enough gold',
  known: 'learned',
};

/**
 * Dev loadout: stands in for the Status window, Guild Hall and Loadout screens until M2. It runs
 * the real rules (stat point costs, requirements, tier prerequisites, dormant skills), so what
 * works here is what the engine will enforce.
 */
export function LoadoutPanel({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const [build, setBuild] = useState<HeroBuild>(() => structuredClone(api.getBuild()));
  const [note, setNote] = useState('');
  const b = balance;
  const total = totalPoints(b, build.level);
  const left = total - pointsSpent(b, build.stats);
  const spTotal = skillPointsTotal(b, build.level);
  const spLeft = spTotal - skillPointsSpent(build);
  const ctx = { unlockedClasses: new Set(classes.map((c) => c.id)), skills: skillMap };
  const dormant = new Set(dormantSkills(build, skillMap));

  const mutate = (fn: (x: HeroBuild) => void) => {
    const next = structuredClone(build);
    fn(next);
    const removed = unequipDormant(next, skillMap);
    setNote(
      removed.length
        ? `Unequipped (requirement no longer met): ${removed.map((id) => skillMap.get(id)!.name).join(', ')}`
        : '',
    );
    setBuild(next);
    api.setBuild(next);
  };

  const slotValue = (id: string, kind: SkillDef['kind']): string => {
    const list = kind === 'passive' ? build.passives : build.actives;
    const i = list.indexOf(id);
    return i < 0 ? '' : String(i);
  };
  const setSlot = (def: SkillDef, v: string) =>
    mutate((x) => {
      for (const list of [x.actives, x.passives]) {
        const i = list.indexOf(def.id);
        if (i >= 0) list[i] = null;
      }
      if (v === '') return;
      const list = def.kind === 'passive' ? x.passives : x.actives;
      list[Number(v)] = def.id;
    });

  return (
    <div class="modal loadout">
      <div class="modal-head">
        <b>Loadout (dev)</b>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
      <div class="modal-body">
        <div class="row">
          <span>Preset</span>
          <button
            type="button"
            onClick={() => {
              api.loadPreset('warrior');
              setBuild(structuredClone(api.getBuild()));
              setNote('');
            }}
          >
            Warrior
          </button>
          <button
            type="button"
            onClick={() => {
              api.loadPreset('caster');
              setBuild(structuredClone(api.getBuild()));
              setNote('');
            }}
          >
            Caster
          </button>
        </div>
        <div class="row">
          <span>Level {build.level}</span>
          <button
            type="button"
            disabled={
              build.level <= 1 ||
              pointsSpent(b, build.stats) > totalPoints(b, build.level - 1) ||
              skillPointsSpent(build) > skillPointsTotal(b, build.level - 1)
            }
            onClick={() => mutate((x) => void (x.level -= 1))}
          >
            −
          </button>
          <button
            type="button"
            disabled={build.level >= 99}
            onClick={() => mutate((x) => void (x.level += 1))}
          >
            +
          </button>
          <span class="dim">
            stat points {left} / {total} · skill points {spLeft} / {spTotal} · gold{' '}
            {Math.round(build.gold)}
          </span>
        </div>
        <div class="row">
          <span>Weapon</span>
          {WEAPONS.map((wt) => (
            <button
              type="button"
              class={build.weapon.type === wt ? 'on' : ''}
              onClick={() => mutate((x) => void (x.weapon.type = wt))}
            >
              {wt}
            </button>
          ))}
        </div>
        <div class="stats">
          {STAT_IDS.map((k) => {
            const n = build.stats[k];
            return (
              <div class="stat">
                <b>{k}</b>
                <button
                  type="button"
                  disabled={n <= 1}
                  onClick={() => mutate((x) => void (x.stats[k] -= 1))}
                >
                  −
                </button>
                <span class="val">{n}</span>
                <button
                  type="button"
                  disabled={n >= b.stats.maxBaseStat || left < statCost(b, n)}
                  onClick={() => mutate((x) => void (x.stats[k] += 1))}
                >
                  +{statCost(b, n)}
                </button>
              </div>
            );
          })}
        </div>
        <div class="dim small">
          A stat costs more every 10 points (to reach 20: {costToReach(b, 20)}, 40:{' '}
          {costToReach(b, 40)}). Skills need their stats: lowering one makes dependent skills
          dormant.
        </div>
        {note && <div class="note">{note}</div>}
        {classes.map((c) => (
          <div>
            <h4 style={{ color: c.color }}>{c.name}</h4>
            {skills
              .filter((s) => s.classId === c.id)
              .map((s) => {
                const rank = build.learned[s.id] ?? 0;
                const stats = reqStats(build);
                const ok = reqMet(s.req, stats);
                const miss = unmetReq(s.req, stats);
                const res = rank ? null : canLearn(build, s, ctx);
                return (
                  <div class={`skill-row ${dormant.has(s.id) ? 'dormant' : ''}`}>
                    <span class="nm">
                      T{s.tier} {s.name}
                    </span>
                    <span class={ok ? 'ok' : 'bad'}>
                      {Object.entries(s.req)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(', ')}
                      {!ok &&
                        ` (need ${miss.map((m) => `${m.stat} ${m.need}, have ${m.have}`).join('; ')})`}
                    </span>
                    {rank === 0 ? (
                      <button
                        type="button"
                        disabled={!res || !res.ok}
                        onClick={() => mutate((x) => learn(x, s))}
                      >
                        {res && !res.ok ? REASON[res.reason] : `Learn ${s.gold}g`}
                      </button>
                    ) : (
                      <span class="rank">
                        <button
                          type="button"
                          disabled={rank <= 1}
                          onClick={() => mutate((x) => void (x.learned[s.id] -= 1))}
                        >
                          −
                        </button>
                        <span class="val">r{rank}</span>
                        <button
                          type="button"
                          disabled={rank >= s.maxRank || spLeft < 1}
                          onClick={() => mutate((x) => void rankUp(x, s, spLeft))}
                        >
                          +
                        </button>
                        <select
                          value={slotValue(s.id, s.kind)}
                          disabled={!ok}
                          onChange={(e) => setSlot(s, (e.target as HTMLSelectElement).value)}
                        >
                          <option value="">—</option>
                          {(s.kind === 'passive' ? build.passives : build.actives).map((_, i) => (
                            <option value={String(i)}>
                              {s.kind === 'passive' ? `P${i + 1}` : `Slot ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
