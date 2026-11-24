// Progression simulator (PRD Sections 13 and 17, M2): plays Zone 1 from level 1 with a plain
// policy for a human's town visits (spend points, learn skills, equip drops, buy potions) and
// reports how long levels 1 to 15 take. A crude bot stands in for the player, so read the
// numbers as a rough guide.
//
//   npm run sim -- --progress                 (warrior and caster)
//   npm run sim -- --progress --build=caster --seeds=3
import { itemMap, skills as allSkills } from '../../src/data/content';
import { balance as b } from '../../src/data/schema';
import { STAT_IDS, type Stat } from '../../src/data/types';
import { refreshHero } from '../../src/sim/engine';
import {
  addItem,
  addStack,
  buildOf,
  bagItems,
  buyStack,
  canRaiseStat,
  equipFromBag,
  gainExp,
  learnCheck,
  learnSkill,
  newSave,
  presetOf,
  rankUpSkill,
  raiseStat,
  sellItem,
  setSkillSlot,
  takeStack,
  type Template,
} from '../../src/sim/profile';
import type { SaveData } from '../../src/save/types';
import { SimWorld } from '../../src/sim/world';
import { botInput } from './bot';

const DT = 1 / b.tickRate;

const PLANS: Record<
  string,
  {
    template: Template;
    weapon: 'sword' | 'staff';
    look: string;
    skills: string[];
    weights: Partial<Record<Stat, number>>;
  }
> = {
  warrior: {
    template: 'warrior',
    weapon: 'sword',
    look: 'knight',
    skills: [
      'knight_crushing_blow',
      'knight_iron_body',
      'knight_flame_burst',
      'knight_provoke_roar',
    ],
    weights: { STR: 3, VIT: 2, DEX: 1 },
  },
  caster: {
    template: 'caster',
    weapon: 'staff',
    look: 'mage',
    skills: ['mage_ember_bolt', 'mage_arcane_mind', 'mage_frost_lance', 'mage_chain_lightning'],
    weights: { INT: 3, DEX: 2, VIT: 1 },
  },
};

const RAR = ['common', 'fine', 'rare', 'epic', 'legendary'];
const score = (defId: string, rarity: string) => {
  const d = itemMap.get(defId)!;
  return d.tier * 10 + RAR.indexOf(rarity);
};

/** What a player does in town between runs. */
function townVisit(s: SaveData, plan: (typeof PLANS)[string]): void {
  const p = presetOf(s);
  // Stat points by weight.
  for (;;) {
    let pick: Stat | null = null;
    let best = Infinity;
    for (const k of STAT_IDS) {
      const w = plan.weights[k] ?? 0;
      if (!w || !canRaiseStat(b, p, k)) continue;
      const sc = p.stats[k] / w;
      if (sc < best) {
        best = sc;
        pick = k;
      }
    }
    if (!pick) break;
    raiseStat(b, p, pick);
  }
  // Gear: equip the best item per slot, sell everything worse.
  for (let pass = 0; pass < 3; pass++)
    for (const inst of bagItems(s)) {
      const d = itemMap.get(inst.defId)!;
      if (d.levelReq > s.hero.level) continue;
      const slots = d.slot === 'accessory' ? ['acc1', 'acc2'] : [d.slot];
      const worn = slots
        .map((sl) => (p.equipment as Record<string, string | undefined>)[sl])
        .map((uid) => s.hero.inventory.find((x) => x.uid === uid));
      const worst = worn.some((x) => !x)
        ? null
        : worn.reduce((a, c) => (score(a!.defId, a!.rarity) <= score(c!.defId, c!.rarity) ? a : c));
      if (!worst || score(inst.defId, inst.rarity) > score(worst.defId, worst.rarity)) {
        // Staves for casters, swords for warriors: keep the class weapon family.
        if (d.slot === 'weapon' && d.weaponType !== plan.weapon && d.weaponType !== 'greataxe')
          continue;
        if (d.slot === 'weapon' && d.weaponType === 'greataxe' && plan.weapon === 'staff') continue;
        equipFromBag(s, inst.uid);
      }
    }
  for (const inst of [...bagItems(s)]) sellItem(s, inst.uid);
  // Skills: learn what is affordable, rank up the actives evenly.
  for (const id of plan.skills) {
    const def = allSkills.find((x) => x.id === id)!;
    if (!s.hero.learned[id] && learnCheck(s, def).ok) {
      learnSkill(s, id);
      const kind = def.kind === 'passive' ? 'passive' : 'active';
      const arr = kind === 'passive' ? p.passives : p.actives;
      const i = arr.findIndex((x) => x === null);
      if (i >= 0) setSkillSlot(s, kind, i, id);
    }
  }
  const learned = plan.skills.filter((id) => s.hero.learned[id]);
  while (s.hero.skillPointsFree > 0 && learned.length) {
    const lowest = learned.sort((a, c) => s.hero.learned[a] - s.hero.learned[c])[0];
    if (!rankUpSkill(s, lowest)) break;
  }
  // Potions: keep eight of each, but only with gold to spare for the next skill.
  for (const id of ['minor_health', 'minor_mana']) {
    while ((s.hero.stacks[id] ?? 0) < 8 && s.hero.gold > 220 && buyStack(s, id, 1));
  }
  p.consumables = ['minor_health', 'minor_mana'];
}

interface Report {
  who: string;
  levelMin: number[];
  deaths: number;
  kills: number;
  runs: number;
  totalMin: number;
  reached: number;
}

function play(who: string, seed: number, maxMinutes: number, targetLevel: number): Report {
  const plan = PLANS[who];
  const s = newSave(
    { name: who, look: plan.look, weapon: plan.weapon, template: plan.template },
    undefined,
    seed,
  );
  townVisit(s, plan);
  const levelMin: number[] = [];
  let sim = 0;
  let deaths = 0;
  let kills = 0;
  let runs = 0;
  while (sim < maxMinutes * 60 && s.hero.level < targetLevel) {
    runs++;
    const build = buildOf(s);
    const w = new SimWorld({ build, seed: seed * 1000 + runs, mode: 'field' });
    const runTicks = 10 * 60 * b.tickRate;
    for (let t = 0; t < runTicks && sim < maxMinutes * 60; t++) {
      // A human drinks potions when low.
      if (w.hero.hp < w.hero.maxHp * 0.4) w.usePotion(0);
      if (w.hero.sp < w.hero.maxSp * 0.15 && w.hs.slots.some(Boolean)) w.usePotion(1);
      w.tick(DT, botInput(w));
      sim += DT;
      for (const e of w.drainEvents()) {
        if (e.t === 'reward') {
          s.hero.gold += e.gold;
          kills++;
          const up = gainExp(b, s, e.exp);
          if (up) {
            build.level = up.to;
            w.hero.level = up.to;
            refreshHero(w);
            w.hero.hp = w.hero.maxHp;
            w.hero.sp = w.hero.maxSp;
            for (let l = up.from + 1; l <= up.to; l++) levelMin[l] = sim / 60;
          }
        } else if (e.t === 'pickup') {
          if (e.pickup.kind === 'item') addItem(s, e.pickup.item);
          else addStack(s, e.pickup.id, e.pickup.n);
        } else if (e.t === 'potion') takeStack(s, e.id, 1);
      }
      if (w.run.gauge >= w.run.gaugeFull - 1) w.run.gauge = 0;
      if (w.run.phase === 'ended') {
        deaths++;
        sim += 30; // the walk back to town
        break;
      }
    }
    townVisit(s, plan);
  }
  return { who, levelMin, deaths, kills, runs, totalMin: sim / 60, reached: s.hero.level };
}

export function runProgress(builds: string[], seeds: number, maxMinutes: number): void {
  const target = 15;
  console.log(
    `Progression from level 1 (bot policy, up to ${maxMinutes} min, target level ${target})\n`,
  );
  const levels = [2, 3, 4, 5, 6, 8, 10, 12, 15];
  console.log(
    `who      seed  ${levels.map((l) => `L${l}`.padStart(6)).join('')}   deaths  kills  reached  minutes`,
  );
  for (const who of builds) {
    for (let sd = 1; sd <= seeds; sd++) {
      const r = play(who, sd, maxMinutes, target);
      const cells = levels
        .map((l) => (r.levelMin[l] ? r.levelMin[l].toFixed(1) : '-').padStart(6))
        .join('');
      console.log(
        `${who.padEnd(8)} ${String(sd).padStart(4)}  ${cells}   ${String(r.deaths).padStart(6)}  ${String(r.kills).padStart(5)}  ${String(r.reached).padStart(7)}  ${r.totalMin.toFixed(1).padStart(7)}`,
      );
    }
  }
}
