import { useState } from 'preact/hooks';
import { balance as b } from '../../data/schema';
import { classes, skills as allSkills } from '../../data/content';
import type { SkillDef } from '../../data/types';
import { unmetReq } from '../../sim/loadout';
import { formatSkillText } from '../../sim/ranked';
import {
  buildOf,
  defaultCtx,
  learnCheck,
  presetOf,
  rankUpSkill,
  resetRanks,
  setSkillSlot,
  slotCounts,
  bossOrderOf,
  unlockedClassIds,
  learnSkill,
} from '../../sim/profile';
import { reqStats } from '../../sim/loadout';
import type { GameApi } from '../api';
import { gold } from '../itemText';
import { Confirm, Panel, Tabs, Tile, useFlash } from '../kit';
import { hudStore, useHud } from '../store';

const REASON: Record<string, string> = {
  trainer: 'Trainer locked',
  requirement: 'Requirement not met',
  tier: 'Learn a skill from the row above first',
  gold: 'Not enough gold',
  known: 'Already learned',
};

/** Guild Hall: 12 trainer tabs, 5 tier rows, learn, rank up, equip and the free rank reset. */
export function GuildHall({ api }: { api: GameApi }) {
  useHud();
  const save = api.getSave();
  const unlocked = unlockedClassIds(defaultCtx, save.progress);
  const [cls, setCls] = useState('knight');
  const [sel, setSel] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, flash] = useFlash();
  const c = classes.find((x) => x.id === cls)!;
  const mine = allSkills.filter((s) => s.classId === cls);
  const build = buildOf(save);
  const stats = reqStats(build);
  const skill = sel ? mine.find((s) => s.id === sel) : undefined;
  const rank = skill ? (save.hero.learned[skill.id] ?? 0) : 0;
  const [viewRank, setViewRank] = useState(1);

  const unlockText = (id: string) => {
    const k = classes.find((x) => x.id === id)!;
    if (k.comingIn) return `Coming in ${k.comingIn}`;
    return k.unlock.type === 'start' ? '' : 'Defeat a boss to unlock';
  };

  const node = (s: SkillDef) => {
    const learned = save.hero.learned[s.id];
    const check = learnCheck(save, s);
    const miss = unmetReq(s.req, stats);
    return (
      <div
        class={`gh-node ${sel === s.id ? 'sel' : ''}`}
        onClick={() => {
          setSel(s.id);
          setViewRank(learned ?? 1);
        }}
      >
        <Tile
          label={s.name.slice(0, 2).toUpperCase()}
          color={c.color}
          dim={!learned && !check.ok}
          selected={sel === s.id}
          badge={learned ? `r${learned}` : undefined}
        />
        <div class="gh-name">
          <b>{s.name}</b>
          <div class="small">
            {learned ? (
              <span class="ok">Learned</span>
            ) : (
              <>
                {Object.entries(s.req).map(([k, v]) => {
                  const bad = miss.some((m) => m.stat === k);
                  return (
                    <span class={bad ? 'bad' : 'ok'}>
                      {k} {v}{' '}
                    </span>
                  );
                })}
                <span class={save.hero.gold >= s.gold ? 'dim' : 'bad'}>{gold(s.gold)}g</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const doLearn = (s: SkillDef) => {
    let reason = '';
    api.mutate((x) => {
      const r = learnSkill(x, s.id);
      if (!r.ok) reason = REASON[r.reason];
    });
    flash(reason || `${s.name} learned`);
  };

  const equip = (s: SkillDef) => {
    const kind = s.kind === 'passive' ? 'passive' : 'active';
    const counts = slotCounts(b, save.progress, bossOrderOf());
    const arr = kind === 'passive' ? presetOf(save).passives : presetOf(save).actives;
    const limit = kind === 'passive' ? counts.passive : counts.active;
    let i = arr.indexOf(s.id);
    if (i < 0) i = arr.slice(0, limit).findIndex((x) => x === null);
    if (i < 0) {
      flash('All slots are full. Free one in Loadout.');
      return;
    }
    api.mutate((x) => void setSkillSlot(x, kind, i, s.id));
    flash(`${s.name} equipped`);
  };

  return (
    <Panel
      title="Guild Hall"
      onClose={() => hudStore.set({ menu: null })}
      right={
        <>
          <span class="chip">{gold(save.hero.gold)} g</span>{' '}
          <span class="chip buff">{save.hero.skillPointsFree} skill pts</span>
        </>
      }
    >
      <Tabs
        tabs={classes.map((k) => ({
          id: k.id,
          label: k.name,
          locked: !unlocked.has(k.id),
          hint: unlockText(k.id),
        }))}
        value={cls}
        onChange={(id) => {
          setCls(id);
          setSel(null);
        }}
      />
      {!unlocked.has(cls) ? (
        <div class="locked-class">
          <h3 style={{ color: c.color }}>{c.name}</h3>
          <p>{c.blurb}</p>
          <p class="dim">{unlockText(cls)}.</p>
        </div>
      ) : (
        <div class="cols">
          <div class="col wide">
            <div class="dim small">{c.blurb}</div>
            {[1, 2, 3, 4, 5].map((t) => {
              const row = mine.filter((s) => s.tier === t);
              if (row.length === 0) return null;
              return (
                <div class="gh-row">
                  <div class="gh-tier">T{t}</div>
                  {row.map(node)}
                </div>
              );
            })}
            <button type="button" class="big" onClick={() => setConfirmReset(true)}>
              Reset all ranks (free)
            </button>
          </div>
          <div class="col">
            {!skill && <div class="dim">Tap a skill to see its details.</div>}
            {skill && (
              <div class="skill-detail">
                <h3 style={{ color: c.color }}>{skill.name}</h3>
                <div class="small dim">
                  Tier {skill.tier} · {skill.kind} · {skill.tags.join(', ') || 'no tags'}
                </div>
                <div class="small dim">Affinity: {skill.affinity?.join(', ') || 'any weapon'}</div>
                <div class="rank-pick">
                  {Array.from({ length: skill.maxRank }, (_, i) => i + 1).map((r) => (
                    <button
                      type="button"
                      class={r === viewRank ? 'on' : ''}
                      onClick={() => setViewRank(r)}
                    >
                      r{r}
                    </button>
                  ))}
                </div>
                <p>{formatSkillText(skill.text, skill.effects, viewRank, skill.maxRank)}</p>
                <div class="small">
                  Cost {skill.sp ? 'SP' : ''}{' '}
                  {Array.isArray(skill.sp) ? `${skill.sp[0]}→${skill.sp[1]}` : skill.sp} · cooldown{' '}
                  {Array.isArray(skill.cooldown)
                    ? `${skill.cooldown[0]}→${skill.cooldown[1]}s`
                    : `${skill.cooldown}s`}
                </div>
                <div class="small">
                  Needs:{' '}
                  {Object.entries(skill.req).map(([k, v]) => (
                    <span
                      class={unmetReq(skill.req, stats).some((m) => m.stat === k) ? 'bad' : 'ok'}
                    >
                      {k} {v}{' '}
                    </span>
                  ))}
                </div>
                <div class="row left">
                  {rank === 0 ? (
                    <button type="button" class="big primary" onClick={() => doLearn(skill)}>
                      Learn · {gold(skill.gold)}g
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        class="big primary"
                        disabled={rank >= skill.maxRank || save.hero.skillPointsFree < 1}
                        onClick={() => api.mutate((x) => void rankUpSkill(x, skill.id))}
                      >
                        Rank up · 1 pt
                      </button>
                      <button type="button" class="big" onClick={() => equip(skill)}>
                        Equip
                      </button>
                    </>
                  )}
                </div>
                {rank === 0 && !learnCheck(save, skill).ok && (
                  <div class="small bad">
                    {REASON[(learnCheck(save, skill) as { reason: string }).reason]}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {msg && <div class="flash">{msg}</div>}
      {confirmReset && (
        <Confirm
          title="Reset all ranks?"
          yes="Reset"
          body="Every skill goes back to rank 1 and you get all skill points back. This is free."
          onNo={() => setConfirmReset(false)}
          onYes={() => {
            api.mutate((x) => void resetRanks(x));
            setConfirmReset(false);
          }}
        />
      )}
    </Panel>
  );
}
