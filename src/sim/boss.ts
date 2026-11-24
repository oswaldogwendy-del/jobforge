import { refreshUnit } from './engine';
import type { Unit } from './types';
import type { SimWorld } from './world';

// Boss scripts: the small unique mechanics built on the shared attack and telegraph primitives
// (PRD Section 0, rule 2). Queen Gelatina: HP phases with splits, an enrage timer and stagger.

/** Spawns the Queen's Jelly adds around the arena edge. Each heals her 4% if it reaches her. */
function splitJellops(w: SimWorld, boss: Unit): void {
  const def = w.content.monsters.get('jellop');
  if (!def || !w.bossDef) return;
  const ringR = w.bossDef.arenaRadius - 2;
  const base = w.rng.next() * Math.PI * 2;
  for (let i = 0; i < 4; i++) {
    const a = base + (i / 4) * Math.PI * 2;
    const u = w.spawnMonster(
      def,
      Math.cos(a) * ringR,
      Math.sin(a) * ringR,
      Math.max(1, boss.level - 2),
      { script: { toQueen: 1 } },
    );
    if (u && u.ai) {
      u.ai.hasAggro = true;
      u.ai.state = 'chase';
    }
  }
  w.emit({ t: 'banner', text: 'Jellops crawl toward the Queen!' });
}

export function updateBoss(w: SimWorld, boss: Unit, dt: number): void {
  const ai = boss.ai;
  const def = w.bossDef;
  if (!ai || !def || !boss.alive) return;
  ai.script.fightT = (ai.script.fightT ?? 0) + dt;

  // Phases: enter each one as HP falls below its threshold, and run its onEnter script once.
  const pct = (boss.hp / boss.maxHp) * 100;
  let idx = 0;
  def.phases.forEach((ph, i) => {
    if (pct < ph.belowHpPct && i > 0) idx = i;
  });
  const current = ai.script.phase ?? 0;
  if (idx > current) {
    for (let i = current + 1; i <= idx; i++) {
      w.emit({ t: 'phase', phase: i });
      if (def.phases[i].onEnter === 'split') {
        ai.script.splits = (ai.script.splits ?? 0) + 1;
        splitJellops(w, boss);
      }
    }
    ai.script.phase = idx;
  }

  // Enrage: +40% speed and double slams once the fight runs long.
  if (!ai.script.enraged && ai.script.fightT >= def.enrage.atSec) {
    ai.script.enraged = 1;
    boss.buffs.push({
      key: 'enrage',
      src: boss.id,
      remaining: 1e9,
      immune: [],
      debuff: false,
      mods: def.enrage.mods
        .filter((m) => m.stat !== 'doubleSlam')
        .map((m) => ({
          stat: m.stat,
          add: typeof m.add === 'number' ? m.add : 0,
          pct: typeof m.pct === 'number' ? m.pct : 0,
        })),
    });
    refreshUnit(w, boss);
    w.emit({ t: 'banner', text: `${def.name} is enraged!` });
  }
}
